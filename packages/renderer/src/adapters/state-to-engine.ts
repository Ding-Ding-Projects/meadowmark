/**
 * Maps the real @meadowmark/shared GameState onto @meadowmark/engine's
 * narrow GameStateView (see packages/engine/src/state-view.ts).
 *
 * The two packages were built in parallel against no shared contract, so
 * several fields the engine wants simply don't exist yet in the
 * simulation (world position for factories/animals, terrain, weather,
 * roads). Every such gap is called out below with a comment and an
 * honest, documented default rather than a silent cast. See the final
 * report for the full list.
 */

import type { GameState, PlacedBuilding } from '@meadowmark/shared';
import { growthStages } from '@meadowmark/engine';
import type {
  AnimalKind,
  AnimalView,
  CropKind,
  CropPlotView,
  DecorationKind,
  DecorationView,
  GameStateView,
  GrowthStage,
  PlacedBuildingView,
  RoadTileView,
  TileView,
  WeatherView,
} from '@meadowmark/engine';
import { buildingsById, cropsById } from '../content.js';

// ---------------------------------------------------------------------------
// Buildings: town.buildings -> engine buildings[] / decorations[]
// ---------------------------------------------------------------------------

/**
 * buildingTypeId (balance/buildings.json) -> asset name registered by
 * @meadowmark/engine's mesh-dsl asset registry (see
 * packages/engine/src/assets/buildings.ts). The engine ships 4 house
 * variants and a fixed set of community buildings; balance/buildings.json
 * defines 7 house tiers and several community buildings the engine has no
 * dedicated model for. Unmapped/partially-mapped entries fall back to the
 * closest available asset and are called out below - this is a real
 * content gap between the two lanes, not a mapping bug.
 */
const HOUSE_ASSET_BY_TIER: Record<string, string> = {
  house_tier_1: 'house_small',
  house_tier_2: 'house_small',
  house_tier_3: 'house_medium',
  house_tier_4: 'house_medium',
  house_tier_5: 'house_cottage',
  house_tier_6: 'house_cottage',
  house_tier_7: 'house_manor',
};

const COMMUNITY_ASSET_BY_TYPE: Record<string, string> = {
  town_hall: 'community_town_hall',
  // GAP: no "farmers_market" model in the engine's asset registry. Falls
  // back to the town hall model, which is visually wrong but at least
  // renders something in the right place instead of throwing.
  farmers_market: 'community_town_hall',
  train_station: 'community_train_station',
  dock: 'community_dock',
  mine_entrance: 'mine_entrance',
  // GAP: no "zoo_gate" model. Falls back to the museum model.
  zoo_gate: 'community_museum',
  museum: 'community_museum',
  restaurant: 'community_restaurant',
  cinema: 'community_cinema',
  school: 'community_school',
  hospital: 'community_hospital',
  fire_station: 'community_fire_station',
  airport: 'community_airport',
  sports_arena: 'community_sports_arena',
};

/** decoration buildingTypeId -> engine DecorationKind. */
const DECORATION_KIND_BY_TYPE: Record<string, DecorationKind> = {
  // GAP: no flower-bed asset; closest existing decoration is the berry bush.
  flower_bed: 'bush_berry',
  hedge_row: 'hedge',
  fountain: 'fountain',
  statue: 'statue',
  // GAP: no gazebo asset; falls back to a bench.
  gazebo: 'bench',
  // GAP: no topiary asset; falls back to a plain bush.
  topiary_garden: 'bush',
};

function rotationToStep(rotation: 0 | 90 | 180 | 270): 0 | 1 | 2 | 3 {
  return ((rotation / 90) % 4) as 0 | 1 | 2 | 3;
}

function mapBuildings(placed: readonly PlacedBuilding[]): {
  buildings: PlacedBuildingView[];
  decorations: DecorationView[];
  roads: RoadTileView[];
} {
  const buildingViews: PlacedBuildingView[] = [];
  const decorationViews: DecorationView[] = [];
  // GAP: balance/buildings.json currently defines no entry whose kind is
  // "road" (see town.ts's TownCellKind/BuildingCatalogEntry.kind), so this
  // list is always empty against real content today - kept here so roads
  // render correctly the day content adds them.
  const roadViews: RoadTileView[] = [];

  for (const building of placed) {
    const catalogEntry = buildingsById.get(building.buildingTypeId);
    const rotation = rotationToStep(building.rotation);
    const position = { x: building.position.x, y: building.position.y };

    if (catalogEntry?.kind === 'decoration') {
      const kind = DECORATION_KIND_BY_TYPE[building.buildingTypeId] ?? 'bush';
      decorationViews.push({ id: building.id, kind, position, rotation });
      continue;
    }

    const assetName =
      HOUSE_ASSET_BY_TIER[building.buildingTypeId] ??
      COMMUNITY_ASSET_BY_TYPE[building.buildingTypeId] ??
      // GAP: any buildingTypeId not in either table above (including a
      // road-kind entry, until one exists) defaults to the small house
      // model rather than throwing, so an unrecognized placement still
      // renders as *something* on the grid.
      'house_small';

    buildingViews.push({ id: building.id, assetName, position, rotation });
  }

  return { buildings: buildingViews, decorations: decorationViews, roads: roadViews };
}

// ---------------------------------------------------------------------------
// Crops: fields.plots -> engine cropPlots[]
// ---------------------------------------------------------------------------

/**
 * The engine only ships 4 visual crop kinds (wheat/carrot/corn/berry), but
 * balance/crops.json defines 17 crops. Anything outside the engine's
 * CropKind falls back to 'berry' (the generic catch-all) so every crop at
 * least renders as *a* plant rather than throwing on requireAsset().
 */
const CROP_KIND_BY_ID: Partial<Record<string, CropKind>> = {
  wheat: 'wheat',
  carrot: 'carrot',
  corn: 'corn',
};

function cropKindFor(cropId: string): CropKind {
  return CROP_KIND_BY_ID[cropId] ?? 'berry';
}

/**
 * GAP: Plot in @meadowmark/shared has no world position at all - only a
 * stable numeric `index`. Field placement/layout was never assigned to
 * either lane. This lays plots out in a fixed 8-wide grid starting at a
 * hard-coded farm origin so the game is at least visually coherent; a real
 * layout (chosen by whichever lane owns the town grid) should replace
 * this.
 */
const FIELD_ORIGIN = { x: 2, y: 2 };
const FIELD_GRID_WIDTH = 8;

function plotPosition(index: number): { x: number; y: number } {
  return {
    x: FIELD_ORIGIN.x + (index % FIELD_GRID_WIDTH),
    y: FIELD_ORIGIN.y + Math.floor(index / FIELD_GRID_WIDTH),
  };
}

function growthStageFor(plantedAt: number | null, readyAt: number | null, now: number): GrowthStage {
  if (plantedAt === null || readyAt === null) return 'seed';
  if (now >= readyAt) return 'ready';
  const elapsed = now - plantedAt;
  const total = Math.max(1, readyAt - plantedAt);
  const fraction = elapsed / total;
  // growthStages = ['seed', 'sprout', 'growing', 'ready'] - bucket evenly
  // across the first 3 stages; 'ready' is only reached above.
  const stageCount = growthStages.length - 1;
  const index = Math.min(stageCount - 1, Math.floor(fraction * stageCount));
  return growthStages[index] ?? 'seed';
}

function mapCropPlots(state: GameState, now: number): CropPlotView[] {
  const views: CropPlotView[] = [];
  for (const plot of state.fields.plots) {
    if (!plot.unlocked || plot.cropId === null) continue;
    const crop = cropsById.get(plot.cropId);
    views.push({
      id: plot.id,
      position: plotPosition(plot.index),
      cropKind: cropKindFor(plot.cropId),
      growthStage: growthStageFor(plot.plantedAt, plot.readyAt ?? (crop ? plot.plantedAt : null), now),
    });
  }
  return views;
}

function mapFieldPlotBeds(state: GameState): DecorationView[] {
  return state.fields.plots
    .filter((plot) => plot.unlocked)
    .map((plot) => ({
      id: `field-bed-${plot.id}`,
      kind: 'field_plot_empty',
      position: plotPosition(plot.index),
      rotation: 0,
    }));
}

// ---------------------------------------------------------------------------
// Animals: animals.sheds[].animals[] -> engine animals[]
// ---------------------------------------------------------------------------

/**
 * The engine's AnimalKind covers chicken/cow/sheep/pig/goat/bee, matching
 * balance/animals.json's 6 species ids directly - this part is a clean
 * 1:1 mapping. What is NOT clean: AnimalShed/AnimalUnit in
 * @meadowmark/shared carry no world position (no shed placement at all -
 * sheds are pure logical inventory, not town-grid entities), so there is
 * nowhere real to put them. This lays sheds out in a fixed row south of
 * the fields and spreads each shed's units along a short arc, purely so
 * something renders; it is not derived from any real placement data.
 */
const ANIMAL_KINDS: readonly AnimalKind[] = ['chicken', 'cow', 'sheep', 'pig', 'goat', 'bee'];

function animalKindFor(animalTypeId: string): AnimalKind {
  return (ANIMAL_KINDS as readonly string[]).includes(animalTypeId) ? (animalTypeId as AnimalKind) : 'chicken';
}

const SHED_ORIGIN = { x: 2, y: 14 };

function mapAnimals(state: GameState): AnimalView[] {
  const views: AnimalView[] = [];
  state.animals.sheds.forEach((shed, shedIndex) => {
    const shedOrigin = { x: SHED_ORIGIN.x + shedIndex * 4, y: SHED_ORIGIN.y };
    shed.animals.forEach((unit, unitIndex) => {
      const angle = (unitIndex / Math.max(1, shed.animals.length)) * Math.PI * 2;
      views.push({
        id: unit.id,
        kind: animalKindFor(shed.animalTypeId),
        position: {
          x: shedOrigin.x + Math.round(Math.cos(angle)),
          y: shedOrigin.y + Math.round(Math.sin(angle)),
        },
        heading: angle,
      });
    });
  });
  return views;
}

// ---------------------------------------------------------------------------
// Tiles / weather
// ---------------------------------------------------------------------------

/**
 * GAP: @meadowmark/shared has no terrain/tile data and no weather system
 * at all (GameState has nothing named "weather"). Terrain defaults to
 * grass everywhere on the town grid; weather is always 'clear', and
 * timeOfDay is derived from the real wall-clock hour (fractional) purely
 * for a day/night visual, not from any simulated in-game clock.
 */
function buildTiles(gridWidth: number, gridHeight: number): TileView[] {
  const tiles: TileView[] = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      tiles.push({ position: { x, y }, terrain: 'grass' });
    }
  }
  return tiles;
}

function buildWeather(now: number): WeatherView {
  const date = new Date(now);
  const timeOfDay = date.getHours() + date.getMinutes() / 60;
  return { kind: 'clear', timeOfDay };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Resolves the engine asset name a given buildingTypeId (or decoration
 * buildingTypeId) would render as, for use by the placement-preview ghost
 * (RendererBridge.enterPlacementMode) before anything is actually placed.
 * Uses the same lookup tables and the same documented fallbacks as
 * mapBuildings() above.
 */
export function assetNameForBuildingType(buildingTypeId: string): string {
  const catalogEntry = buildingsById.get(buildingTypeId);
  if (catalogEntry?.kind === 'decoration') {
    return DECORATION_KIND_BY_TYPE[buildingTypeId] ?? 'bush';
  }
  return HOUSE_ASSET_BY_TIER[buildingTypeId] ?? COMMUNITY_ASSET_BY_TYPE[buildingTypeId] ?? 'house_small';
}

export function stateToEngineView(state: GameState, now: number): GameStateView {
  const { buildings, decorations, roads } = mapBuildings(state.town.buildings);

  // Zoo enclosures have real world position/footprint and are close enough
  // to "a building on the grid" to render as one - map them alongside town
  // buildings using the habitat-appropriate enclosure asset.
  const zooBuildings: PlacedBuildingView[] = state.zoo.enclosures.map((enclosure) => ({
    id: enclosure.id,
    assetName:
      enclosure.habitat === 'grass'
        ? 'zoo_enclosure_savanna'
        : enclosure.habitat === 'water'
          ? 'zoo_enclosure_pond'
          : // GAP: no dedicated rock/arctic enclosure model; falls back to
            // the generic paddock asset.
            'zoo_enclosure_paddock',
    position: enclosure.position,
    rotation: 0,
  }));

  return {
    tiles: buildTiles(state.town.gridWidth, state.town.gridHeight),
    buildings: [...buildings, ...zooBuildings],
    cropPlots: mapCropPlots(state, now),
    animals: mapAnimals(state),
    roads,
    decorations: [...decorations, ...mapFieldPlotBeds(state)],
    weather: buildWeather(now),
  };
}
