/**
 * Maps the real @meadowmark/shared GameState onto @meadowmark/engine's
 * narrow GameStateView (see packages/engine/src/state-view.ts).
 *
 * The two packages were built in parallel against no shared contract, so
 * several fields the engine wants simply don't exist yet in the
 * simulation (roads; a dedicated factory/shed 3D asset per type). Every
 * such remaining gap is called out below with a comment and an honest,
 * documented fallback rather than a silent cast.
 *
 * factories/sheds/field plots now carry a real `position` in
 * @meadowmark/shared's GameState (schema v2 - see save.ts's migration),
 * and terrain/weather are real saved state too, so none of those are
 * placeholder-computed here anymore.
 */

import type { FactoryInstance, GameState, PlacedBuilding } from '@meadowmark/shared';
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

/**
 * factoryTypeId (balance/factories.json, 22 entries) -> engine asset name.
 * The engine ships only 5 distinct factory silhouettes
 * (factory_bakery/mill/dairy/textile/workshop - see
 * packages/engine/src/assets/buildings.ts), so most factory types share
 * the closest-looking model. This is a real content gap between the two
 * lanes, not a mapping bug - every entry not listed here falls back to
 * 'factory_workshop', the smallest/most generic silhouette.
 */
const FACTORY_ASSET_BY_TYPE: Record<string, string> = {
  bakery: 'factory_bakery',
  mill: 'factory_mill',
  feed_mill: 'factory_mill',
  sugar_mill: 'factory_mill',
  dairy: 'factory_dairy',
  bottler: 'factory_dairy',
  ice_cream: 'factory_dairy',
  winery: 'factory_dairy',
  sauce: 'factory_dairy',
  preserves: 'factory_dairy',
  textile: 'factory_textile',
  tailor: 'factory_textile',
  // GAP: no bakery-adjacent "cafe"/confectionery model; the bakery
  // silhouette (oven + chimney) is the closest visual match.
  coffee_house: 'factory_bakery',
  chocolate: 'factory_bakery',
  candy: 'factory_bakery',
  snack: 'factory_bakery',
  pizzeria: 'factory_bakery',
};

function factoryAssetFor(factoryTypeId: string): string {
  return FACTORY_ASSET_BY_TYPE[factoryTypeId] ?? 'factory_workshop';
}

function mapFactories(factories: readonly FactoryInstance[]): PlacedBuildingView[] {
  return factories.map((f) => ({
    id: f.id,
    assetName: factoryAssetFor(f.factoryTypeId),
    position: f.position,
    rotation: 0,
  }));
}

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
      position: plot.position,
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
      position: plot.position,
      rotation: 0,
    }));
}

// ---------------------------------------------------------------------------
// Animals: animals.sheds[].animals[] -> engine animals[]
// ---------------------------------------------------------------------------

/**
 * The engine's AnimalKind covers chicken/cow/sheep/pig/goat/bee, matching
 * balance/animals.json's 6 species ids directly - this part is a clean
 * 1:1 mapping. AnimalShed now carries a real world `position` (see
 * animals.ts's defaultShedPosition/save.ts's schema v2 migration); this
 * spreads each shed's individual units in a short arc around that real
 * position, since AnimalUnit itself is pure logical inventory with no
 * per-unit placement of its own.
 */
const ANIMAL_KINDS: readonly AnimalKind[] = ['chicken', 'cow', 'sheep', 'pig', 'goat', 'bee'];

function animalKindFor(animalTypeId: string): AnimalKind {
  return (ANIMAL_KINDS as readonly string[]).includes(animalTypeId) ? (animalTypeId as AnimalKind) : 'chicken';
}

function mapAnimals(state: GameState): AnimalView[] {
  const views: AnimalView[] = [];
  for (const shed of state.animals.sheds) {
    shed.animals.forEach((unit, unitIndex) => {
      const angle = (unitIndex / Math.max(1, shed.animals.length)) * Math.PI * 2;
      views.push({
        id: unit.id,
        kind: animalKindFor(shed.animalTypeId),
        position: {
          x: shed.position.x + Math.round(Math.cos(angle)),
          y: shed.position.y + Math.round(Math.sin(angle)),
        },
        heading: angle,
      });
    });
  }
  return views;
}

// ---------------------------------------------------------------------------
// Tiles / weather
// ---------------------------------------------------------------------------

/**
 * @meadowmark/shared's GameState.terrain (schema v2) is now the real,
 * saved source of ground cover - grass everywhere except every unlocked
 * field plot's own tile, which is marked 'soil' at creation/migration
 * time (see terrain.ts/fields.ts) so the field area reads as a farm from
 * the very first frame. Tiles are stored flat/row-major there
 * (index = y * gridWidth + x, same convention as MineTile), so this just
 * unpacks that into the engine's per-tile TileView list.
 */
function buildTiles(state: GameState): TileView[] {
  const { gridWidth, tiles } = state.terrain;
  return tiles.map((tile) => ({
    position: { x: tile.index % gridWidth, y: Math.floor(tile.index / gridWidth) },
    terrain: tile.kind,
  }));
}

/**
 * state.weather.kind (schema v2) is now the real, saved weather - see
 * weather.ts's tickWeather for how it rerolls over time. timeOfDay stays
 * derived from the real wall-clock hour (fractional), purely for the
 * day/night visual; nothing in the simulation tracks an in-game clock
 * separate from real time.
 */
function buildWeather(state: GameState, now: number): WeatherView {
  const date = new Date(now);
  const timeOfDay = date.getHours() + date.getMinutes() / 60;
  return { kind: state.weather.kind, timeOfDay };
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

  const factoryBuildings = mapFactories(state.factories.factories);

  return {
    tiles: buildTiles(state),
    buildings: [...buildings, ...zooBuildings, ...factoryBuildings],
    cropPlots: mapCropPlots(state, now),
    animals: mapAnimals(state),
    roads,
    decorations: [...decorations, ...mapFieldPlotBeds(state)],
    weather: buildWeather(state, now),
  };
}
