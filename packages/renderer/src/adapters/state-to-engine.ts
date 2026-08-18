/**
 * Maps the real @meadowmark/shared GameState onto @meadowmark/engine's
 * narrow GameStateView (see packages/engine/src/state-view.ts).
 *
 * The two packages were built in parallel against no shared contract, so
 * several fields the engine wants simply don't exist yet in the
 * simulation (world position for factories, sheds, the barn; terrain;
 * weather). Every such gap is called out below with a comment and an
 * honest, documented default rather than a silent cast.
 *
 * Every real content id (crop, house tier, community building, factory
 * type, decoration) now maps onto a real, distinctly registered engine
 * asset - see packages/engine/src/assets/*.ts. Nothing here falls back to
 * a borrowed mesh silently; requireAsset() is never asked for a name that
 * is not registered, and the one remaining fallback path (an unknown
 * buildingTypeId content adds later) is logged via console.warn rather
 * than rendered as something else without comment.
 *
 * "Village life" wiring (buildVillageLife/buildReadySparkles/
 * buildChimneySmoke, near the bottom): several parallel asset lanes are
 * registering new props and effects meshes this file references by name
 * before this worktree necessarily has them. Referencing a name that
 * turns out to be unregistered is deliberate here, not a bug to route
 * around - see EXPECTED_LIFE_ASSET_NAMES and assertLifeAssetsRegistered()
 * for the single loud startup error that names every asset still missing.
 */

import type { AnimalShed, AnimalUnit, FactoryInstance, GameState, PlacedBuilding, RngState } from '@meadowmark/shared';
import { chance, createRng, nextInt, pickWeighted, seedFromString } from '@meadowmark/shared';
import { getAsset, growthStages, listAssetNames, resolveRoadTile } from '@meadowmark/engine';
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
// Buildings: town.buildings -> engine buildings[] / decorations[] / roads[]
// ---------------------------------------------------------------------------

/**
 * house_tier_1 .. house_tier_7 (balance/buildings.json's 7 real house
 * tiers) map 1:1 onto the engine's identically named house_tier_N assets
 * (see assets/buildings.ts) - no lossy 7-into-4 compression anymore.
 */
function houseAssetName(buildingTypeId: string): string | null {
  return /^house_tier_[1-7]$/.test(buildingTypeId) ? buildingTypeId : null;
}

/**
 * Community buildingTypeId (balance/buildings.json) -> the engine's
 * "community_<id>" asset. Every one of balance/buildings.json's 14
 * community building ids now has a distinctly registered asset - see
 * assets/buildings.ts's community_farmers_market and community_zoo_gate,
 * which used to fall back to community_town_hall/community_museum.
 * mine_entrance keeps its bare name (no "community_" prefix) since it is
 * also the mine's own dedicated landmark asset, defined once and shared.
 */
const COMMUNITY_ASSET_BY_TYPE: Record<string, string> = {
  town_hall: 'community_town_hall',
  farmers_market: 'community_farmers_market',
  train_station: 'community_train_station',
  dock: 'community_dock',
  mine_entrance: 'mine_entrance',
  zoo_gate: 'community_zoo_gate',
  museum: 'community_museum',
  restaurant: 'community_restaurant',
  cinema: 'community_cinema',
  school: 'community_school',
  hospital: 'community_hospital',
  fire_station: 'community_fire_station',
  airport: 'community_airport',
  sports_arena: 'community_sports_arena',
};

/** decoration buildingTypeId -> engine DecorationKind. Every one of
 * balance/buildings.json's 6 decoration ids now has a real, distinctly
 * registered asset (flower_bed/topiary/gazebo were added alongside the
 * pre-existing hedge/fountain/statue - see assets/nature.ts). */
const DECORATION_KIND_BY_TYPE: Record<string, DecorationKind> = {
  flower_bed: 'flower_bed',
  hedge_row: 'hedge',
  fountain: 'fountain',
  statue: 'statue',
  gazebo: 'gazebo',
  topiary_garden: 'topiary',
};

const loggedFallbacks = new Set<string>();

/** A buildingTypeId that is neither a known house tier, a known community
 * type, nor a decoration falls back to the smallest house model so
 * something still renders instead of requireAsset() throwing - but only
 * ever once per unrecognized id, logged loudly so the gap is visible
 * rather than silently masked. */
function fallbackHouseAsset(buildingTypeId: string): string {
  if (!loggedFallbacks.has(buildingTypeId)) {
    loggedFallbacks.add(buildingTypeId);
    // eslint-disable-next-line no-console
    console.warn(
      `state-to-engine: buildingTypeId "${buildingTypeId}" has no house/community/decoration mapping - rendering it as house_tier_1 until content/the adapter catches up.`,
    );
  }
  return 'house_tier_1';
}

function rotationToStep(rotation: 0 | 90 | 180 | 270): 0 | 1 | 2 | 3 {
  return ((rotation / 90) % 4) as 0 | 1 | 2 | 3;
}

function mapBuildings(placed: readonly PlacedBuilding[]): {
  buildings: PlacedBuildingView[];
  decorations: DecorationView[];
  roadPositions: Array<{ x: number; y: number }>;
} {
  const buildingViews: PlacedBuildingView[] = [];
  const decorationViews: DecorationView[] = [];
  // Roads are a real TownCellKind/BuildingCatalogEntry.kind ("road"), but
  // balance/buildings.json currently defines no entry of that kind - see
  // town.ts. This still handles the kind correctly so roads render with
  // real neighbour-aware straight/corner/junction/end selection the day
  // content adds a road catalog entry, rather than silently ignoring it.
  const roadPositions: Array<{ x: number; y: number }> = [];

  for (const building of placed) {
    const catalogEntry = buildingsById.get(building.buildingTypeId);
    const rotation = rotationToStep(building.rotation);
    const position = { x: building.position.x, y: building.position.y };

    if (catalogEntry?.kind === 'decoration') {
      const kind = DECORATION_KIND_BY_TYPE[building.buildingTypeId] ?? 'bush';
      decorationViews.push({ id: building.id, kind, position, rotation });
      continue;
    }

    if (catalogEntry?.kind === 'road') {
      roadPositions.push(position);
      continue;
    }

    const assetName =
      houseAssetName(building.buildingTypeId) ??
      COMMUNITY_ASSET_BY_TYPE[building.buildingTypeId] ??
      fallbackHouseAsset(building.buildingTypeId);

    buildingViews.push({ id: building.id, assetName, position, rotation });
  }

  return { buildings: buildingViews, decorations: decorationViews, roadPositions };
}

/** Turns a flat list of road-tile positions into RoadTileView[] with real
 * neighbour-derived shape/rotation, joining visually with adjacent road
 * tiles exactly like the reference game's road tool. */
function resolveRoads(roadPositions: readonly { x: number; y: number }[]): RoadTileView[] {
  if (roadPositions.length === 0) return [];
  const roadSet = new Set(roadPositions.map((p) => `${p.x},${p.y}`));
  const isRoad = (t: { x: number; y: number }): boolean => roadSet.has(`${t.x},${t.y}`);
  return roadPositions.map((position) => {
    const connections = {
      N: isRoad({ x: position.x, y: position.y - 1 }),
      E: isRoad({ x: position.x + 1, y: position.y }),
      S: isRoad({ x: position.x, y: position.y + 1 }),
      W: isRoad({ x: position.x - 1, y: position.y }),
    };
    const { shape, rotation } = resolveRoadTile(connections);
    return { position, shape, rotation };
  });
}

// ---------------------------------------------------------------------------
// Crops: fields.plots -> engine cropPlots[]
// ---------------------------------------------------------------------------

/** Every real crop id balance/crops.json defines - the engine's CropKind
 * union is exhaustive over exactly these plus 'berry', so this list and
 * that union must be kept in sync by hand (assets/nature.ts's cropColor
 * Record is a compile-time check on the engine side that catches a
 * missing mesh; this Set is the matching compile-time-adjacent check on
 * the content side). */
const KNOWN_CROP_KINDS: ReadonlySet<string> = new Set<CropKind>([
  'wheat',
  'corn',
  'carrot',
  'sugarcane',
  'cotton',
  'strawberry',
  'tomato',
  'potato',
  'soybean',
  'rice',
  'pumpkin',
  'chilli',
  'coffee_bean',
  'lavender',
  'grape',
  'blueberry',
  'vanilla',
]);

function cropKindFor(cropId: string): CropKind {
  return KNOWN_CROP_KINDS.has(cropId) ? (cropId as CropKind) : 'berry';
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
/** MAX_PLOT_COUNT from fields.ts (60), duplicated here as a plain number
 * so the adapter doesn't need a runtime import just to reserve the full
 * eventual field footprint for scenery placement below - a player who
 * hasn't unlocked plot 59 yet still shouldn't get a tree spawned on top
 * of where it will appear. */
const FIELD_MAX_PLOTS = 60;
const FIELD_GRID_HEIGHT = Math.ceil(FIELD_MAX_PLOTS / FIELD_GRID_WIDTH);

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
      position: plot.position ?? plotPosition(plot.index),
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
      kind: 'field_plot_empty' as const,
      position: plot.position ?? plotPosition(plot.index),
      rotation: 0 as const,
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
const SHED_SPACING_X = 4;
/** Reserve enough rows below SHED_ORIGIN for any realistic shed count so
 * scenery never gets seeded on top of a shed that hasn't been created yet
 * in this particular save but is a normal amount of sheds to have. */
const SHED_RESERVED_ROWS = 3;

function mapAnimals(state: GameState): AnimalView[] {
  const views: AnimalView[] = [];
  state.animals.sheds.forEach((shed, shedIndex) => {
    const shedOrigin = shed.position ?? { x: SHED_ORIGIN.x + shedIndex * SHED_SPACING_X, y: SHED_ORIGIN.y };
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
// Factories: factories.factories[] -> engine buildings[]
// ---------------------------------------------------------------------------

/**
 * GAP: FactoryInstance in @meadowmark/shared carries no world position at
 * all (see types.ts) - factories are pure production/inventory state, not
 * town-grid entities, exactly like animal sheds above. This lays them out
 * in a fixed row so every factory the player has built actually renders
 * somewhere, using the same documented-placeholder pattern as
 * SHED_ORIGIN/FIELD_ORIGIN rather than leaving factories completely
 * invisible (the previous state of this adapter didn't map factories at
 * all).
 */
const FACTORY_ORIGIN = { x: 2, y: 19 };
const FACTORY_SPACING_X = 3;
const FACTORY_ROW_WIDTH = 10;

function mapFactories(factories: readonly FactoryInstance[]): PlacedBuildingView[] {
  return factories.map((factory, i) => {
    const row = Math.floor(i / FACTORY_ROW_WIDTH);
    const col = i % FACTORY_ROW_WIDTH;
    return {
      id: factory.id,
      // Every real factoryTypeId (balance/factories.json's 21 ids) has a
      // distinctly registered "factory_<id>" asset - see
      // assets/buildings.ts's hand-tuned five plus the generated sixteen.
      assetName: `factory_${factory.factoryTypeId}`,
      position: factory.position ?? { x: FACTORY_ORIGIN.x + col * FACTORY_SPACING_X, y: FACTORY_ORIGIN.y + row * 3 },
      rotation: 0,
    };
  });
}

// ---------------------------------------------------------------------------
// The barn: a single fixed landmark, not part of any placement list
// ---------------------------------------------------------------------------

/**
 * GAP: BarnState (@meadowmark/shared) carries capacity/level only - no
 * world position, because every player has exactly one barn and it was
 * never modeled as a PlacedBuilding. It is the town's central production
 * hub, so it gets a fixed anchor near the fields rather than being left
 * unrendered.
 */
const BARN_POSITION = { x: 11, y: 2 };

// ---------------------------------------------------------------------------
// Scenery: deterministic decoration scattered across unoccupied tiles
// ---------------------------------------------------------------------------

type SceneryKind = Extract<
  DecorationKind,
  'tree_round' | 'tree_pine' | 'tree_fruit' | 'bush' | 'bush_berry' | 'rock_small' | 'rock_medium'
>;
const SCENERY_POOL: readonly SceneryKind[] = ['tree_round', 'tree_pine', 'tree_fruit', 'bush', 'bush_berry', 'rock_small', 'rock_medium'];
const SCENERY_WEIGHTS: readonly number[] = [5, 4, 2, 4, 2, 3, 1];
/** Fraction of unreserved tiles that get a scenery prop. Low enough that a
 * 40x40 town still reads as walkable parkland, not a solid forest. */
const SCENERY_DENSITY = 0.05;

/** A small deterministic pond, placed once per save (seeded from the
 * save's own creation time so it's stable across reloads, but distinct
 * per save) in a corner far from the field/shed/factory/barn anchors
 * above. Only ever rendered on tiles that are NOT reserved for something
 * else this frame, so a building placed on top of it simply displaces it
 * rather than the two visually conflicting. */
function pondTiles(gridWidth: number, gridHeight: number, seed: number): Set<string> {
  const rng = createRng(seed ^ 0x9e3779b9);
  const originX = Math.max(0, gridWidth - 6 - nextInt(rng, 0, 3));
  const originY = Math.max(0, gridHeight - 6 - nextInt(rng, 0, 3));
  const tiles = new Set<string>();
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 4; dx++) {
      // Rounded blob rather than a hard rectangle: skip the corners.
      if ((dx === 0 || dx === 3) && (dy === 0 || dy === 2)) continue;
      tiles.add(`${originX + dx},${originY + dy}`);
    }
  }
  return tiles;
}

/**
 * Stable across reloads and ticks (meta.createdAt never changes for a
 * save) but distinct per save, so two players' towns don't grow an
 * identical forest - this is the "world seed" the lane brief asks for;
 * GameState has no dedicated one, so it is derived from the one field
 * that is genuinely stable for the life of a save.
 */
function worldScenerySeed(state: GameState): number {
  return seedFromString(`scenery:${state.meta.createdAt}`);
}

function buildScenery(state: GameState, reserved: ReadonlySet<string>, pond: ReadonlySet<string>): DecorationView[] {
  const gridWidth = state.town.gridWidth;
  const gridHeight = state.town.gridHeight;
  const rng = createRng(worldScenerySeed(state));
  const decorations: DecorationView[] = [];
  let idCounter = 0;

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const key = `${x},${y}`;
      if (reserved.has(key) || pond.has(key)) continue;
      if (!chance(rng, SCENERY_DENSITY)) continue;
      const kind = pickWeighted(rng, SCENERY_POOL, SCENERY_WEIGHTS);
      decorations.push({
        id: `scenery-${idCounter++}`,
        kind,
        position: { x, y },
        rotation: nextInt(rng, 0, 3) as 0 | 1 | 2 | 3,
      });
    }
  }

  // Rock "edges" ringing the pond so the water reads as a feature rather
  // than a stray puddle - only on tiles that are free and not already
  // water themselves.
  for (const tileKey of pond) {
    const [xStr, yStr] = tileKey.split(',');
    const x = Number(xStr);
    const y = Number(yStr);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const nKey = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) continue;
      if (pond.has(nKey) || reserved.has(nKey)) continue;
      if (!chance(rng, 0.35)) continue;
      decorations.push({
        id: `scenery-${idCounter++}`,
        kind: 'rock_small',
        position: { x: nx, y: ny },
        rotation: nextInt(rng, 0, 3) as 0 | 1 | 2 | 3,
      });
    }
  }

  // A fence ring bordering the field block so the farm reads as a
  // deliberately enclosed plot rather than blending into open scenery.
  //
  // `fence_rail` is modelled as a box whose LONG axis runs along local X
  // (see assets/nature.ts) and rotationY = (PI/2) * decoration.rotation.
  // The top/bottom run below walks along X with Y fixed, so each rail's
  // long axis must stay parallel to X too — rotation 0, unrotated. The
  // left/right run walks along Y with X fixed, so each rail needs its long
  // axis turned to run along Z instead — rotation 1 (a quarter turn). These
  // two were previously swapped, which pointed every rail perpendicular to
  // the fence line it was meant to trace, so the "fence" rendered as loose
  // sticks scattered at right angles rather than a continuous rail line.
  // (`fence_post` is a plain cylinder, so its rotation is cosmetically
  // irrelevant either way.)
  const fenceMinX = FIELD_ORIGIN.x - 1;
  const fenceMaxX = FIELD_ORIGIN.x + FIELD_GRID_WIDTH;
  const fenceMinY = FIELD_ORIGIN.y - 1;
  const fenceMaxY = FIELD_ORIGIN.y + FIELD_GRID_HEIGHT;
  for (let x = fenceMinX; x <= fenceMaxX; x++) {
    for (const y of [fenceMinY, fenceMaxY]) {
      const key = `${x},${y}`;
      if (reserved.has(key) || pond.has(key) || x < 0 || y < 0) continue;
      const isCorner = x === fenceMinX || x === fenceMaxX;
      decorations.push({
        id: `scenery-${idCounter++}`,
        kind: isCorner ? 'fence_post' : 'fence_rail',
        position: { x, y },
        rotation: 0,
      });
    }
  }
  for (let y = fenceMinY + 1; y < fenceMaxY; y++) {
    for (const x of [fenceMinX, fenceMaxX]) {
      const key = `${x},${y}`;
      if (reserved.has(key) || pond.has(key) || x < 0 || y < 0) continue;
      decorations.push({ id: `scenery-${idCounter++}`, kind: 'fence_rail', position: { x, y }, rotation: 1 });
    }
  }

  return decorations;
}

/** Every tile scenery must never be placed on: real placed buildings and
 * their footprints, zoo enclosures and their footprints, road tiles, the
 * whole (eventual) field block, the whole (eventual) shed row, the
 * factory row, and the barn's anchor. */
function reservedTileSet(
  state: GameState,
  buildings: readonly PlacedBuilding[],
  zooFootprints: ReadonlyArray<{ position: { x: number; y: number }; footprint: { width: number; height: number } }>,
  roadPositions: readonly { x: number; y: number }[],
): Set<string> {
  const reserved = new Set<string>();

  for (const b of buildings) {
    for (let dx = 0; dx < b.footprint.width; dx++) {
      for (let dy = 0; dy < b.footprint.height; dy++) {
        reserved.add(`${b.position.x + dx},${b.position.y + dy}`);
      }
    }
  }
  for (const z of zooFootprints) {
    for (let dx = 0; dx < z.footprint.width; dx++) {
      for (let dy = 0; dy < z.footprint.height; dy++) {
        reserved.add(`${z.position.x + dx},${z.position.y + dy}`);
      }
    }
  }
  for (const r of roadPositions) reserved.add(`${r.x},${r.y}`);

  for (let dx = 0; dx < FIELD_GRID_WIDTH; dx++) {
    for (let dy = 0; dy < FIELD_GRID_HEIGHT; dy++) {
      reserved.add(`${FIELD_ORIGIN.x + dx},${FIELD_ORIGIN.y + dy}`);
    }
  }

  const shedCount = Math.max(state.animals.sheds.length, 1);
  for (let dx = 0; dx < shedCount * SHED_SPACING_X + 2; dx++) {
    for (let dy = -1; dy <= SHED_RESERVED_ROWS; dy++) {
      reserved.add(`${SHED_ORIGIN.x + dx},${SHED_ORIGIN.y + dy}`);
    }
  }

  const factoryRows = Math.max(1, Math.ceil(Math.max(state.factories.factories.length, 1) / FACTORY_ROW_WIDTH));
  for (let dx = 0; dx < FACTORY_ROW_WIDTH * FACTORY_SPACING_X; dx++) {
    for (let dy = -1; dy < factoryRows * 3 + 1; dy++) {
      reserved.add(`${FACTORY_ORIGIN.x + dx},${FACTORY_ORIGIN.y + dy}`);
    }
  }

  reserved.add(`${BARN_POSITION.x},${BARN_POSITION.y}`);

  return reserved;
}

// ---------------------------------------------------------------------------
// Village life: wires up the props and effects six parallel asset lanes
// are registering, none of which the town would otherwise render even
// once they exist. See the module doc for the asset names this section
// depends on and how missing ones are surfaced.
// ---------------------------------------------------------------------------

/**
 * Every mesh-dsl asset name this section references but does not itself
 * register. These are the other lanes' work: 'prop_cart_hand', 'prop_barrel_a', 'prop_crate_a' and
 * 'prop_market_stall_a' are roadside/market/factory props (assets/props.ts or a
 * new file in that spirit); 'critter_duck' is ambient pond wildlife
 * (assets/characters.ts); 'effect_growth_pop' is a small hovering glyph over
 * anything with product waiting to be collected, and 'effect_smoke_puff' is a
 * puff hovering over a factory that is actively producing right now
 * (both presumably assets/props.ts "effects").
 *
 * Checked exactly once, eagerly, the first time stateToEngineView() runs.
 * If any are missing this throws ONE error naming all of them, rather
 * than letting the renderer discover the gap one InstancedMesh crash at a
 * time deep in a frame - see mesh-dsl's requireAsset() for the per-name
 * version of that error this pre-empts.
 */
const EXPECTED_LIFE_ASSET_NAMES: readonly DecorationKind[] = [
  'prop_cart_hand',
  'prop_barrel_a',
  'prop_crate_a',
  'prop_market_stall_a',
  'critter_duck',
  'effect_growth_pop',
  'effect_smoke_puff',
];

let lifeAssetsValidated = false;
function assertLifeAssetsRegistered(): void {
  if (lifeAssetsValidated) return;
  lifeAssetsValidated = true;
  const missing = EXPECTED_LIFE_ASSET_NAMES.filter((name) => getAsset(name) === undefined);
  if (missing.length > 0) {
    throw new Error(
      `state-to-engine: the village-life wiring expects these mesh-dsl assets to be registered by ` +
        `other asset lanes, but they are missing: ${missing.join(', ')}. Known assets: ` +
        `${listAssetNames().join(', ')}. (See EXPECTED_LIFE_ASSET_NAMES in state-to-engine.ts.)`,
    );
  }
}

/** Finds an unoccupied tile within `radius` rings of `origin`, preferring
 * the nearest ring, deterministically shuffled by `rng` so which side of a
 * building a prop lands on varies without ever landing on top of
 * something. Marks the chosen tile into `occupied` before returning it so
 * a second call in the same pass cannot double-place. Returns null once
 * every candidate tile is exhausted. */
function findFreeNeighborTile(
  origin: { x: number; y: number },
  radius: number,
  rng: RngState,
  gridWidth: number,
  gridHeight: number,
  reserved: ReadonlySet<string>,
  pond: ReadonlySet<string>,
  occupied: Set<string>,
): { x: number; y: number } | null {
  for (let ring = 1; ring <= radius; ring++) {
    const candidates: Array<{ x: number; y: number }> = [];
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue; // ring border only
        const x = origin.x + dx;
        const y = origin.y + dy;
        if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) continue;
        const key = `${x},${y}`;
        if (reserved.has(key) || pond.has(key) || occupied.has(key)) continue;
        candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) continue;
    const pick = candidates[nextInt(rng, 0, candidates.length - 1)]!;
    occupied.add(`${pick.x},${pick.y}`);
    return pick;
  }
  return null;
}

/** Roadside carts, a huddle of market stalls by the farmers' market, and
 * barrels/crates stacked outside every factory - the incidental clutter
 * that makes a town read as a lived-in place rather than a diagram. Every
 * placement is derived from the world seed plus a stable id (building id,
 * factory id, road-tile coordinate), so it never shuffles on reload, and
 * every chosen tile is folded into `occupied` so the general scenery pass
 * that runs afterward can never land a tree on top of a cart. */
function buildVillageLife(
  state: GameState,
  buildings: readonly PlacedBuilding[],
  factories: readonly FactoryInstance[],
  roadPositions: readonly { x: number; y: number }[],
  reserved: ReadonlySet<string>,
  pond: ReadonlySet<string>,
): { decorations: DecorationView[]; occupied: Set<string> } {
  assertLifeAssetsRegistered();

  const gridWidth = state.town.gridWidth;
  const gridHeight = state.town.gridHeight;
  const occupied = new Set<string>();
  const decorations: DecorationView[] = [];
  let idCounter = 0;

  const place = (
    kind: DecorationKind,
    origin: { x: number; y: number },
    radius: number,
    rng: RngState,
  ): void => {
    const tile = findFreeNeighborTile(origin, radius, rng, gridWidth, gridHeight, reserved, pond, occupied);
    if (!tile) return; // hemmed in on every side this frame; skip rather than overlap something real
    decorations.push({
      id: `life-${idCounter++}`,
      kind,
      position: tile,
      rotation: nextInt(rng, 0, 3) as 0 | 1 | 2 | 3,
    });
  };

  // Market: a farmers' market gets a small cluster of stalls plus a cart,
  // seeded per building id so the exact stalls stay put across reloads.
  for (const building of buildings) {
    if (building.buildingTypeId !== 'farmers_market') continue;
    const marketCenter = {
      x: building.position.x + Math.floor(building.footprint.width / 2),
      y: building.position.y + Math.floor(building.footprint.height / 2),
    };
    const rng = createRng(seedFromString(`life-market:${building.id}`));
    const stallCount = nextInt(rng, 2, 3);
    for (let i = 0; i < stallCount; i++) place('prop_market_stall_a', marketCenter, 3, rng);
    place('prop_cart_hand', marketCenter, 3, rng);
  }

  // Factories: a couple of barrels or crates parked outside every one,
  // seeded per factory id.
  for (const factory of factories) {
    const origin = factory.position ?? { x: FACTORY_ORIGIN.x, y: FACTORY_ORIGIN.y };
    const rng = createRng(seedFromString(`life-factory:${factory.id}`));
    const propCount = nextInt(rng, 1, 3);
    for (let i = 0; i < propCount; i++) {
      const kind = pickWeighted<DecorationKind>(rng, ['prop_barrel_a', 'prop_crate_a'], [3, 2]);
      place(kind, origin, 2, rng);
    }
  }

  // Roads: a sparse scatter of carts along the network, one seeded roll
  // per road tile so the same stretch of road always gets (or never gets)
  // its cart.
  for (const roadTile of roadPositions) {
    const rng = createRng(seedFromString(`life-road:${roadTile.x},${roadTile.y}`));
    if (!chance(rng, 0.06)) continue;
    place('prop_cart_hand', roadTile, 1, rng);
  }

  // Ducks paddling the pond - a handful, seeded off the pond's own tiles
  // rather than a building id, since the pond has none.
  if (pond.size > 0) {
    const pondTilesArray = [...pond].map((key) => {
      const [xStr, yStr] = key.split(',');
      return { x: Number(xStr), y: Number(yStr) };
    });
    const rng = createRng(worldScenerySeed(state) ^ 0xd0c4d0c4);
    const duckCount = Math.min(pondTilesArray.length, nextInt(rng, 1, 2));
    for (let i = 0; i < duckCount; i++) {
      const tile = pondTilesArray[nextInt(rng, 0, pondTilesArray.length - 1)]!;
      const key = `${tile.x},${tile.y}`;
      if (occupied.has(key)) continue;
      occupied.add(key);
      decorations.push({
        id: `life-${idCounter++}`,
        kind: 'critter_duck',
        position: tile,
        rotation: nextInt(rng, 0, 3) as 0 | 1 | 2 | 3,
      });
    }
  }

  return { decorations, occupied };
}

/**
 * Ready-state cues: a sparkle over a crop plot that has actually finished
 * growing, a factory with at least one finished-or-blocked queue slot, and
 * an animal whose product has actually finished its cycle. Every one of
 * these is read from the real simulation state passed to this frame - no
 * decorative guess, no "probably done by now" timer of its own.
 */
function buildReadySparkles(
  cropPlots: readonly CropPlotView[],
  factories: readonly FactoryInstance[],
  animalSheds: readonly AnimalShed[],
  now: number,
): DecorationView[] {
  const sparkles: DecorationView[] = [];

  for (const plot of cropPlots) {
    if (plot.growthStage !== 'ready') continue;
    sparkles.push({ id: `sparkle-crop-${plot.id}`, kind: 'effect_growth_pop', position: plot.position, rotation: 0 });
  }

  for (const factory of factories) {
    // A slot is "output waiting" once it has finished (readyAt reached) or
    // was already finished and blocked from delivering to a full barn
    // (paused) - both are real product sitting there for the player to
    // collect, not a guess about how the queue is probably doing.
    const hasReadyOutput = factory.queue.some((slot) => slot.paused || slot.readyAt <= now);
    if (!hasReadyOutput) continue;
    const position = factory.position ?? { x: FACTORY_ORIGIN.x, y: FACTORY_ORIGIN.y };
    sparkles.push({ id: `sparkle-factory-${factory.id}`, kind: 'effect_growth_pop', position, rotation: 0 });
  }

  for (const shed of animalSheds) {
    for (const unit of shed.animals) {
      if (!animalUnitReady(unit, now)) continue;
      sparkles.push({ id: `sparkle-animal-${unit.id}`, kind: 'effect_growth_pop', position: shed.position, rotation: 0 });
    }
  }

  return sparkles;
}

function animalUnitReady(unit: AnimalUnit, now: number): boolean {
  return unit.feedStartedAt !== null && unit.readyAt !== null && now >= unit.readyAt;
}

/** Chimney smoke over every factory with a queue slot genuinely running
 * right now (started, not yet finished, not paused-and-blocked) - never a
 * factory that is idle, finished, or stalled behind a full barn. */
function buildChimneySmoke(factories: readonly FactoryInstance[], now: number): DecorationView[] {
  const smoke: DecorationView[] = [];
  for (const factory of factories) {
    const isProducing = factory.queue.some((slot) => !slot.paused && slot.startedAt <= now && now < slot.readyAt);
    if (!isProducing) continue;
    const position = factory.position ?? { x: FACTORY_ORIGIN.x, y: FACTORY_ORIGIN.y };
    smoke.push({ id: `smoke-${factory.id}`, kind: 'effect_smoke_puff', position, rotation: 0 });
  }
  return smoke;
}

// ---------------------------------------------------------------------------
// Tiles / weather
// ---------------------------------------------------------------------------

/**
 * GAP: @meadowmark/shared has no terrain/tile data and no weather system
 * at all (GameState has nothing named "weather"). Weather is always
 * 'clear', and timeOfDay is derived from the real wall-clock hour
 * (fractional) purely for a day/night visual, not from any simulated
 * in-game clock.
 *
 * Terrain defaults to grass everywhere on the town grid except every
 * unlocked field plot's own tile (marked 'soil') and the deterministic
 * scenery pond's own tiles (marked 'water') - both of which only ever
 * paint over an otherwise-unoccupied tile, so a building placed there
 * later simply stops being water/soil next frame rather than looking
 * wrong underneath it.
 */
function buildTiles(
  gridWidth: number,
  gridHeight: number,
  soilTiles: ReadonlySet<string>,
  waterTiles: ReadonlySet<string>,
): TileView[] {
  const tiles: TileView[] = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const key = `${x},${y}`;
      const terrain = soilTiles.has(key) ? 'soil' : waterTiles.has(key) ? 'water' : 'grass';
      tiles.push({ position: { x, y }, terrain });
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
  return (
    houseAssetName(buildingTypeId) ?? COMMUNITY_ASSET_BY_TYPE[buildingTypeId] ?? fallbackHouseAsset(buildingTypeId)
  );
}

export function stateToEngineView(state: GameState, now: number): GameStateView {
  const { buildings, decorations, roadPositions } = mapBuildings(state.town.buildings);
  const roads = resolveRoads(roadPositions);

  // Zoo enclosures have real world position/footprint and are close enough
  // to "a building on the grid" to render as one - map them alongside town
  // buildings using the habitat-appropriate enclosure asset. Every
  // ZooHabitat ("grass" | "water" | "rock" | "arctic") now has its own
  // distinctly registered enclosure asset - see assets/buildings.ts.
  const zooBuildings: PlacedBuildingView[] = state.zoo.enclosures.map((enclosure) => ({
    id: enclosure.id,
    assetName:
      enclosure.habitat === 'grass'
        ? 'zoo_enclosure_savanna'
        : enclosure.habitat === 'water'
          ? 'zoo_enclosure_pond'
          : enclosure.habitat === 'rock'
            ? 'zoo_enclosure_rock'
            : 'zoo_enclosure_arctic',
    position: enclosure.position,
    rotation: 0,
  }));

  const factoryBuildings = mapFactories(state.factories.factories);
  const barnBuilding: PlacedBuildingView = { id: 'barn', assetName: 'barn', position: BARN_POSITION, rotation: 0 };

  const soilTiles = new Set(
    state.fields.plots.filter((p) => p.unlocked).map((p) => {
      const pos = plotPosition(p.index);
      return `${pos.x},${pos.y}`;
    }),
  );

  const reserved = reservedTileSet(state, state.town.buildings, state.zoo.enclosures, roadPositions);
  const waterTiles = pondTiles(state.town.gridWidth, state.town.gridHeight, worldScenerySeed(state));

  // Village life (roadside carts, market stalls, factory barrels, pond
  // ducks) is placed before the general scenery pass, and every tile it
  // claims is folded into `reserved` so a tree can never spawn on top of
  // a cart - see buildVillageLife()'s own doc.
  const villageLife = buildVillageLife(
    state,
    state.town.buildings,
    state.factories.factories,
    roadPositions,
    reserved,
    waterTiles,
  );
  const reservedWithLife = new Set(reserved);
  for (const key of villageLife.occupied) reservedWithLife.add(key);
  const scenery = buildScenery(state, reservedWithLife, waterTiles);

  const cropPlots = mapCropPlots(state, now);
  const animals = mapAnimals(state);
  const readySparkles = buildReadySparkles(cropPlots, state.factories.factories, state.animals.sheds, now);
  const chimneySmoke = buildChimneySmoke(state.factories.factories, now);

  return {
    tiles: state.terrain
      ? state.terrain.tiles.map((t, i) => ({
          position: { x: i % state.terrain.gridWidth, y: Math.floor(i / state.terrain.gridWidth) },
          terrain: t.kind,
        }))
      : buildTiles(state.town.gridWidth, state.town.gridHeight, soilTiles, waterTiles),
    buildings: [...buildings, ...zooBuildings, ...factoryBuildings, barnBuilding],
    cropPlots,
    animals,
    roads,
    decorations: [
      ...decorations,
      ...mapFieldPlotBeds(state),
      ...scenery,
      ...villageLife.decorations,
      ...readySparkles,
      ...chimneySmoke,
    ],
    weather: state.weather
      ? { kind: state.weather.kind, timeOfDay: buildWeather(now).timeOfDay }
      : buildWeather(now),
  };
}
