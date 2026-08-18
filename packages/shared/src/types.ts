/**
 * The complete GameState shape and every entity type in the Meadowmark
 * simulation. This file is the contract the engine (rendering), the UI,
 * and every other lane codes against - it deliberately has no logic in it,
 * only shapes. Keep names unambiguous; other lanes will import from here
 * directly rather than re-deriving these shapes.
 *
 * IMPORTANT: this package must never import three.js, Electron, or the DOM.
 * The engine renders state; it never owns state.
 */

import type { RngState } from "./rng.js";

// ---------------------------------------------------------------------------
// Primitive ids
// ---------------------------------------------------------------------------

/** Id of a good defined in balance/goods.json (raw crop/animal output or a manufactured good). */
export type GoodId = string;
/** Id of a crop defined in balance/crops.json. */
export type CropId = string;
/** Id of a factory type defined in balance/factories.json. */
export type FactoryTypeId = string;
/** Id of an animal species defined in balance/animals.json. */
export type AnimalTypeId = string;
/** Id of a placeable building/decoration defined in balance/buildings.json. */
export type BuildingTypeId = string;
/** Id of an achievement defined in balance/achievements.json. */
export type AchievementId = string;
/** Id of a booster kind. */
export type BoosterKind =
  | "growSpeed2x"
  | "factorySpeed2x"
  | "trainSpeed2x"
  | "energyRefill"
  | "orderReroll"
  | "barnOverflow";

/** A bag of good quantities keyed by GoodId. Also used for material costs. */
export type ResourceBag = Record<GoodId, number>;

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

export interface EconomyState {
  /** Standard soft currency, earned constantly through normal play. */
  coins: number;
  /** Premium currency. EARNED ONLY - there is no store, no purchase path, ever. */
  cash: number;
  xp: number;
  level: number;
  /** Energy is spent to plant/dig/etc; regenerates over time up to energyCap. */
  energy: number;
  energyCap: number;
  /** Epoch ms the last time energy was reconciled up to `energy`'s current value. Used to compute regen lazily inside tick() rather than storing a running countdown. */
  energyRegenAnchorAt: number;
  population: number;
  populationCap: number;
  /** Reputation stars earned from orders/helicopter; used to gate some content and fill the helicopter chest bar. */
  reputationStars: number;
}

// ---------------------------------------------------------------------------
// Fields (crops)
// ---------------------------------------------------------------------------

export interface Plot {
  id: string;
  /** Index into the logical plot grid; stable across saves. */
  index: number;
  /** World-grid position on the town grid; see fields.ts's plotPosition() for how `index` maps to this by default. */
  position: GridPosition;
  unlocked: boolean;
  cropId: CropId | null;
  plantedAt: number | null;
  readyAt: number | null;
}

export interface FieldsState {
  plots: Plot[];
  /** Coin cost to unlock the next locked plot (escalates as plots unlock). */
  nextPlotCost: number;
}

export interface PlantAllResult {
  plantedPlotIds: string[];
  skippedPlotIds: string[];
  /** True if planting stopped early because of insufficient seeds/energy/coins for the requested crop. */
  partial: boolean;
  reason?: "insufficientEnergy" | "insufficientCoins" | "noEmptyPlots";
}

export interface HarvestAllResult {
  harvestedPlotIds: string[];
  goodsGained: ResourceBag;
  xpGained: number;
  coinsGained: number;
  /** True if the sweep stopped early because the barn filled up mid-sweep. */
  partial: boolean;
  reason?: "barnFull";
}

// ---------------------------------------------------------------------------
// Animals
// ---------------------------------------------------------------------------

export interface AnimalShed {
  id: string;
  animalTypeId: AnimalTypeId;
  /** World-grid position on the town grid; see animals.ts's defaultShedPosition() for the fallback layout used when a shed is created without an explicit placement. */
  position: GridPosition;
  /** Number of animal slots this shed currently has (upgradeable). */
  slots: number;
  animals: AnimalUnit[];
}

export interface AnimalUnit {
  id: string;
  /** Epoch ms this animal started its current production cycle, or null if idle (unfed). */
  feedStartedAt: number | null;
  readyAt: number | null;
}

export interface AnimalsState {
  sheds: AnimalShed[];
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export interface FactoryQueueSlot {
  recipeId: string;
  startedAt: number;
  readyAt: number;
  /** Set true when the slot has finished but its output could not be delivered to the barn because it was full. The slot holds its output until collected/room is freed. */
  paused: boolean;
  /** Epoch ms the slot entered the paused state, for UI/analytics; null when not paused. */
  pausedAt: number | null;
}

export interface FactoryInstance {
  id: string;
  factoryTypeId: FactoryTypeId;
  /** World-grid position on the town grid; see factories.ts's defaultFactoryPosition() for the fallback layout used when a factory is created without an explicit placement. */
  position: GridPosition;
  level: number;
  /** Number of concurrent queue slots this factory currently has (2 base, upgradeable to 6). */
  queueSlots: number;
  queue: FactoryQueueSlot[];
}

export interface FactoriesState {
  factories: FactoryInstance[];
}

// ---------------------------------------------------------------------------
// Barn (shared storage)
// ---------------------------------------------------------------------------

export interface BarnState {
  /** Single shared capacity: the sum of all good quantities in `inventory` may never exceed this. */
  capacity: number;
  level: number;
}

// ---------------------------------------------------------------------------
// Orders (order board)
// ---------------------------------------------------------------------------

export interface OrderRequirement {
  goodId: GoodId;
  quantity: number;
}

export interface OrderSlot {
  id: string;
  /** Null means the slot is empty and pending a refill. */
  order: {
    requirements: OrderRequirement[];
    rewardCoins: number;
    rewardXp: number;
    rewardReputationStars: number;
  } | null;
  /** Epoch ms the slot will refill with a new order, set after completion. Null when the slot already has an order. */
  refillAt: number | null;
}

export interface OrdersState {
  slots: OrderSlot[];
}

// ---------------------------------------------------------------------------
// Train
// ---------------------------------------------------------------------------

export interface TrainWagonRequest {
  goodId: GoodId;
  quantityNeeded: number;
  quantityLoaded: number;
}

export interface TrainWagon {
  id: string;
  requests: TrainWagonRequest[];
  /** Null while waiting to be loaded/departed. Set when the wagon departs. */
  departedAt: number | null;
  returnsAt: number | null;
  /** Materials this wagon will bring back on arrival. Rolled at departure time using the seeded RNG. */
  rewardMaterials: ResourceBag;
}

export interface TrainState {
  wagons: TrainWagon[];
}

// ---------------------------------------------------------------------------
// Helicopter
// ---------------------------------------------------------------------------

export interface HelicopterOrder {
  id: string;
  requirements: OrderRequirement[];
  rewardCoins: number;
  rewardReputationStars: number;
  refillAt: number | null;
}

export interface HelicopterState {
  orders: HelicopterOrder[];
  reputationBar: number;
  reputationBarCap: number;
  /** True when the bar is full and a chest is waiting to be opened. */
  chestReady: boolean;
}

// ---------------------------------------------------------------------------
// Ship
// ---------------------------------------------------------------------------

export interface ShipCrate {
  id: string;
  goodId: GoodId;
  quantityNeeded: number;
  quantityLoaded: number;
  rewardCoins: number;
  rewardXp: number;
}

export interface ShipState {
  unlocked: boolean;
  crates: ShipCrate[];
  windowStartedAt: number | null;
  windowEndsAt: number | null;
  /** True once all crates have been filled for the current window and the chest is waiting. */
  chestReady: boolean;
}

// ---------------------------------------------------------------------------
// Town (buildable grid)
// ---------------------------------------------------------------------------

export type TownCellKind = "empty" | "road" | "building" | "decoration";

export interface GridPosition {
  x: number;
  y: number;
}

export interface PlacedBuilding {
  id: string;
  buildingTypeId: BuildingTypeId;
  position: GridPosition;
  /** Width/height in grid cells, footprint anchored at `position` (top-left). */
  footprint: { width: number; height: number };
  rotation: 0 | 90 | 180 | 270;
  /** Null once built; while building this is when it will finish. */
  buildStartedAt: number | null;
  buildReadyAt: number | null;
}

export interface TownState {
  gridWidth: number;
  gridHeight: number;
  buildings: PlacedBuilding[];
  /** Aggregate charm score from decorations; paid out as a small daily coin bonus. */
  charmScore: number;
}

// ---------------------------------------------------------------------------
// Terrain (town-grid ground cover)
// ---------------------------------------------------------------------------

export type TerrainKind = "grass" | "soil" | "water" | "sand" | "stone";

export interface TerrainTile {
  /** Row-major index into the town grid (index = y * gridWidth + x), stable across saves - same convention as MineTile.index. */
  index: number;
  kind: TerrainKind;
}

export interface TerrainState {
  /** Mirrors TownState.gridWidth/gridHeight at the time terrain was generated, so `tiles[i]`'s x/y can always be recovered without a second source of truth for grid size. */
  gridWidth: number;
  gridHeight: number;
  tiles: TerrainTile[];
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

export type WeatherKind = "clear" | "rain" | "snow" | "fog";

export interface WeatherState {
  kind: WeatherKind;
  /**
   * Epoch ms of the last WEATHER_CHANGE_INTERVAL_MS-interval boundary this
   * state actually processed a reroll for. Drives tickWeather()'s
   * catch-up loop (see weather.ts) so a multi-hour offline gap rerolls
   * once per boundary actually crossed, deterministically, regardless of
   * how the elapsed time was chunked into tick() calls - same shape as
   * village.ts's lastTopUpAt.
   */
  lastChangeAt: number;
}

// ---------------------------------------------------------------------------
// Expansions
// ---------------------------------------------------------------------------

export interface ParcelState {
  id: string;
  index: number;
  unlocked: boolean;
}

export interface ExpansionsState {
  parcels: ParcelState[];
  permits: number;
}

// ---------------------------------------------------------------------------
// Zoo
// ---------------------------------------------------------------------------

export type ZooHabitat = "grass" | "water" | "rock" | "arctic";

export interface ZooEnclosure {
  id: string;
  habitat: ZooHabitat;
  position: GridPosition;
  footprint: { width: number; height: number };
  speciesId: string | null;
  /** Simple visitor income accrual anchor; visitors "arrive" continuously and are collected in a lump sum, similar to factories. */
  incomeAnchorAt: number;
}

export interface ZooState {
  unlocked: boolean;
  enclosures: ZooEnclosure[];
  /** Animal cards collected per species id, needed to hatch/unlock that species. */
  animalCards: Record<string, number>;
  hatchedSpecies: string[];
  zooBucks: number;
}

// ---------------------------------------------------------------------------
// Mine
// ---------------------------------------------------------------------------

export type MineTileContent =
  | { kind: "empty" }
  | { kind: "rock" }
  | { kind: "ore"; oreId: string }
  | { kind: "gem"; gemId: string }
  | { kind: "tool"; toolId: "pick" | "dynamite" | "tnt" }
  | { kind: "artifactFragment"; artifactId: string };

export interface MineTile {
  index: number;
  dug: boolean;
  content: MineTileContent;
}

export interface MineState {
  unlocked: boolean;
  gridWidth: number;
  gridHeight: number;
  tiles: MineTile[];
  /**
   * Epoch ms of the last local-calendar-day boundary this mine actually
   * processed a regeneration for. Null only before the mine is unlocked.
   * Drives tickMine()'s catch-up loop (see mine.ts) rather than a "did we
   * regenerate today" flag, so a multi-day offline gap regenerates once
   * per day actually crossed - deterministically, regardless of how the
   * elapsed time was chunked into tick() calls.
   */
  lastRegenAt: number | null;
  oreBars: ResourceBag;
  artifactFragments: Record<string, number>;
  completedArtifacts: string[];
  /** Foundry smelting queue: each entry produces a bar good after readyAt. */
  foundryQueue: { barGoodId: GoodId; startedAt: number; readyAt: number }[];
}

// ---------------------------------------------------------------------------
// Museum
// ---------------------------------------------------------------------------

export interface MuseumExhibitProgress {
  exhibitId: string;
  /** Which of this exhibit's required artifact ids have been donated so far. Only present in state.museum.exhibits once at least one donation has happened - see museum.ts's donateArtifact(). */
  donatedArtifactIds: string[];
  completed: boolean;
}

export interface MuseumState {
  unlocked: boolean;
  /** One entry per exhibit that has received at least one donation; an exhibit with zero donations simply has no entry here. */
  exhibits: MuseumExhibitProgress[];
  /** Every artifact id ever donated to ANY exhibit, world-wide - once donated it can never be donated again (to this exhibit or any other), even if a fresh copy is somehow completed later. */
  donatedArtifactIds: string[];
}

// ---------------------------------------------------------------------------
// Boosters
// ---------------------------------------------------------------------------

export interface ActiveBooster {
  id: string;
  kind: BoosterKind;
  startedAt: number;
  expiresAt: number;
}

export interface BoosterInventoryItem {
  kind: BoosterKind;
  quantity: number;
}

export interface BoosterState {
  active: ActiveBooster[];
  /** Unused boosters in inventory, ready to be activated. */
  inventory: BoosterInventoryItem[];
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export interface AchievementProgress {
  achievementId: AchievementId;
  /** Current tier index unlocked (0 = none unlocked yet). */
  tier: number;
  /** Raw counter value (e.g. total harvests) driving tier evaluation. */
  progress: number;
}

export interface AchievementsState {
  progress: Record<AchievementId, AchievementProgress>;
}

// ---------------------------------------------------------------------------
// Dailies
// ---------------------------------------------------------------------------

export interface DailyTask {
  id: string;
  description: string;
  targetKind: string;
  targetId: string | null;
  targetQuantity: number;
  progress: number;
  completed: boolean;
}

export interface DailiesState {
  /** Local date key (YYYY-MM-DD) these tasks were generated for. */
  dateKey: string;
  tasks: DailyTask[];
  chestClaimed: boolean;
  streak: number;
  lastCompletedDateKey: string | null;
  /**
   * Epoch ms of the local-calendar-day boundary that produced the current
   * `dateKey`/`tasks`. Drives tickDailies()'s day-by-day catch-up loop
   * (see dailies.ts) so the streak resets on every unclaimed day actually
   * crossed during an offline gap, not just once regardless of how many
   * days passed.
   */
  lastBoundaryAt: number;
}

// ---------------------------------------------------------------------------
// Village (entirely local co-op simulation, no network calls of any kind)
// ---------------------------------------------------------------------------

export interface VillagerRequest {
  id: string;
  villagerId: string;
  goodId: GoodId;
  quantity: number;
  rewardCoins: number;
  fulfilled: boolean;
  expiresAt: number;
}

export interface Villager {
  id: string;
  name: string;
}

export interface RegattaTask {
  id: string;
  description: string;
  targetKind: string;
  targetQuantity: number;
  progress: number;
  scoreValue: number;
}

export interface RegattaState {
  weekKey: string;
  tasks: RegattaTask[];
  score: number;
  scoreBarCap: number;
  chestClaimed: boolean;
}

export interface VillageState {
  villagers: Villager[];
  requests: VillagerRequest[];
  regatta: RegattaState;
  /**
   * Honest, user-facing copy explaining that the village is entirely local:
   * no other player is present, and nothing about it ever leaves the
   * machine. Surfaced verbatim by the UI wherever the village is shown.
   */
  localOnlyNotice: string;
  /**
   * Epoch ms of the last fixed VILLAGER_REQUEST_EXPIRY_MS-interval
   * boundary this village actually processed an expire-and-top-up round
   * for. Drives tickVillage()'s catch-up loop (see village.ts) so
   * requests refresh in deterministic batches per boundary genuinely
   * crossed, rather than cascading roll-expire-roll once per tick() call.
   */
  lastTopUpAt: number;
}

// ---------------------------------------------------------------------------
// Meta / save
// ---------------------------------------------------------------------------

export interface SaveMeta {
  /** Save schema version, see save.ts. */
  schemaVersion: number;
  createdAt: number;
  lastSavedAt: number;
  playerName: string;
}

// ---------------------------------------------------------------------------
// Root game state
// ---------------------------------------------------------------------------

export interface GameState {
  meta: SaveMeta;
  rng: RngState;
  /** Epoch ms this state was last advanced to via tick(). Used by offline.ts to compute elapsed time on resume. */
  lastTickAt: number;

  economy: EconomyState;
  inventory: ResourceBag;
  barn: BarnState;

  fields: FieldsState;
  animals: AnimalsState;
  factories: FactoriesState;
  orders: OrdersState;
  train: TrainState;
  helicopter: HelicopterState;
  ship: ShipState;
  town: TownState;
  terrain: TerrainState;
  weather: WeatherState;
  expansions: ExpansionsState;
  zoo: ZooState;
  mine: MineState;
  museum: MuseumState;
  boosters: BoosterState;
  achievements: AchievementsState;
  dailies: DailiesState;
  village: VillageState;
}

// ---------------------------------------------------------------------------
// Tick events - the single source of truth both live play and the offline
// summary read from. Never build a second "what happened" implementation.
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: "harvestReady"; plotId: string; cropId: CropId; at: number }
  | { type: "animalProductReady"; shedId: string; animalUnitId: string; at: number }
  | { type: "factoryProductionReady"; factoryId: string; recipeId: string; at: number }
  | { type: "factoryQueuePaused"; factoryId: string; recipeId: string; reason: "barnFull"; at: number }
  | { type: "factoryQueueResumed"; factoryId: string; recipeId: string; at: number }
  | { type: "trainArrived"; wagonId: string; rewardMaterials: ResourceBag; at: number }
  | { type: "helicopterOrderRefilled"; orderId: string; at: number }
  | { type: "helicopterChestReady"; at: number }
  | { type: "shipChestReady"; at: number }
  | { type: "orderRefilled"; slotId: string; at: number }
  | { type: "buildingCompleted"; buildingId: string; buildingTypeId: BuildingTypeId; at: number }
  | { type: "levelUp"; newLevel: number; rewardCoins: number; rewardCash: number; at: number }
  | { type: "energyFull"; at: number }
  | { type: "achievementTierUnlocked"; achievementId: AchievementId; tier: number; at: number }
  | { type: "dailyTaskCompleted"; taskId: string; at: number }
  | { type: "dailyChestReady"; at: number }
  | { type: "mineRegenerated"; at: number }
  | { type: "foundrySmeltReady"; barGoodId: GoodId; at: number }
  | { type: "boosterExpired"; boosterId: string; kind: BoosterKind; at: number };

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}
