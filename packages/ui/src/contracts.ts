/**
 * Narrow structural contracts between the UI layer and the rest of Meadowmark.
 *
 * This package must never import `three` or `electron` directly, and must never
 * import concrete types from `@meadowmark/shared` or `@meadowmark/engine` — those
 * packages are being written in parallel by other lanes. Instead we declare the
 * minimal *shape* we read from game state and the minimal shape we call on the
 * renderer/host bridge. At integration time these are reconciled against the
 * real exported types from `@meadowmark/shared` (state) and the real bridge
 * implementation the Electron host injects (see `packages/app`).
 *
 * RECONCILIATION NOTES (for the integrating agent):
 * - `GameStateView` should become (or be satisfied by) the real `GameState` type
 *   from `@meadowmark/shared`. Field names below were chosen to be obvious and
 *   may need renaming to match the shared package's actual schema.
 * - `RendererBridge` should become (or be satisfied by) whatever `@meadowmark/engine`
 *   exposes for camera/placement/selection control. The host (packages/app) is
 *   expected to construct a concrete `RendererBridge` and a concrete `HostBridge`
 *   and call `mountUi(root, { state$, bridge, host })` from this package's entry
 *   point (see index.ts).
 * - All money/time fields are plain numbers (money in cents to avoid float drift;
 *   time in epoch milliseconds) — confirm this matches shared's convention.
 */

// ---------------------------------------------------------------------------
// Primitive aliases
// ---------------------------------------------------------------------------

export type EntityId = string;
export type GoodId = string;
export type CropId = string;
export type BuildingId = string;
export type RecipeId = string;
export type AnimalId = string;
export type ArtifactId = string;
export type AchievementId = string;
export type PlayerId = string;

/** Epoch milliseconds. */
export type Timestamp = number;
/** Milliseconds duration. */
export type DurationMs = number;
/** Integer cents. */
export type Money = number;

// ---------------------------------------------------------------------------
// Resources / currencies
// ---------------------------------------------------------------------------

export interface PlayerResources {
  coins: number;
  cash: Money;
  xp: number;
  level: number;
  xpForNextLevel: number;
  population: number;
  populationCap: number;
  energy: number;
  energyCap: number;
  energyRegenPerMinute: number;
}

// ---------------------------------------------------------------------------
// Fields / crops
// ---------------------------------------------------------------------------

export interface CropDef {
  id: CropId;
  nameKey: string;
  iconId: string;
  growthMs: DurationMs;
  yieldGoodId: GoodId;
  yieldAmount: number;
  unlockLevel: number;
}

export type PlotState =
  | { kind: "empty" }
  | { kind: "growing"; cropId: CropId; plantedAt: Timestamp; readyAt: Timestamp }
  | { kind: "ready"; cropId: CropId }
  | { kind: "withered"; cropId: CropId };

export interface FieldPlot {
  id: EntityId;
  index: number;
  state: PlotState;
}

export interface FieldsView {
  plots: FieldPlot[];
  availableCrops: CropDef[];
  /** Coin cost to unlock the next locked plot, or null once every plot is unlocked. */
  nextPlotUnlockCost: number | null;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export interface RecipeDef {
  id: RecipeId;
  nameKey: string;
  iconId: string;
  inputs: { goodId: GoodId; amount: number }[];
  outputGoodId: GoodId;
  outputAmount: number;
  durationMs: DurationMs;
  unlockLevel: number;
}

export interface FactoryQueueSlot {
  index: number;
  recipeId: RecipeId | null;
  startedAt: Timestamp | null;
  readyAt: Timestamp | null;
  /** True when this slot finished producing but output could not be delivered to the barn. */
  pausedBarnFull: boolean;
}

export interface FactoryInstance {
  id: EntityId;
  buildingId: BuildingId;
  nameKey: string;
  slotCount: number;
  slots: FactoryQueueSlot[];
  availableRecipes: RecipeDef[];
}

export interface FactoriesView {
  factories: FactoryInstance[];
}

// ---------------------------------------------------------------------------
// Barn / goods
// ---------------------------------------------------------------------------

export interface GoodDef {
  id: GoodId;
  nameKey: string;
  iconId: string;
  sellPrice: Money;
}

export interface BarnView {
  capacity: number;
  used: number;
  stock: Record<GoodId, number>;
  goodDefs: Record<GoodId, GoodDef>;
  upgradeCost: Money | null;
  nextCapacity: number | null;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface OrderRequirement {
  goodId: GoodId;
  amount: number;
  available: number;
}

export interface OrderSlot {
  index: number;
  orderId: EntityId | null;
  requirements: OrderRequirement[];
  rewardCoins: number;
  rewardXp: number;
  rewardCash: Money;
  expiresAt: Timestamp | null;
  canFill: boolean;
  rerollCost: Money | null;
}

export interface OrdersView {
  slots: OrderSlot[];
}

// ---------------------------------------------------------------------------
// Train — 3 independent wagons, each requesting its own goods
// ---------------------------------------------------------------------------

export interface TrainWagonRequestView {
  goodId: GoodId;
  quantityNeeded: number;
  quantityLoaded: number;
  /** How much of this good the player currently holds in the barn — real inventory, not a guess. */
  available: number;
}

/**
 * A wagon only ever needs one of these three states from the UI's point of
 * view: "loading" covers everything before departure (whether or not it is
 * actually full yet — the caller checks each request's own quantities for
 * that), "departed" is mid-trip, "arrived" is ready to collect.
 */
export type TrainWagonState = "loading" | "departed" | "arrived";

export interface TrainWagonView {
  id: EntityId;
  /** 0, 1, or 2 — which of the train's three wagons this is. */
  index: number;
  requests: TrainWagonRequestView[];
  state: TrainWagonState;
  departedAt: Timestamp | null;
  returnsAt: Timestamp | null;
  /** The materials this wagon is bringing back. Empty until it has departed and rolled its reward — never a guessed reward before that. */
  rewardMaterials: { goodId: GoodId; amount: number }[];
}

export interface TrainView {
  wagons: TrainWagonView[];
}

// ---------------------------------------------------------------------------
// Helicopter — 2 fast orders, a reputation bar, and a reputation chest
// ---------------------------------------------------------------------------

export type HelicopterOrderState = "available" | "refilling";

export interface HelicopterOrderView {
  id: EntityId;
  /** 0 or 1 — which of the helicopter's two order slots this is. */
  index: number;
  state: HelicopterOrderState;
  requirements: OrderRequirement[];
  rewardCoins: number;
  rewardReputationStars: number;
  /** Only meaningful while state is "refilling". */
  refillAt: Timestamp | null;
  canFulfill: boolean;
}

export interface HelicopterChestRewardView {
  cash: Money;
  boosterKind: string;
  boosterQuantity: number;
  expansionPermits: number;
}

export interface HelicopterView {
  orders: HelicopterOrderView[];
  reputationBar: number;
  reputationBarCap: number;
  chestReady: boolean;
  /** Rolled the instant the bar fills; null before then, and null on a save from before this reward existed — an honest unknown rather than a placeholder number. */
  chestReward: HelicopterChestRewardView | null;
}

// ---------------------------------------------------------------------------
// Ship — 6 crates on a rolling 24h delivery window, plus an all-six chest
// ---------------------------------------------------------------------------

export interface ShipCrateView {
  id: EntityId;
  /** 0-5 — which of the ship's six crates this is. A crate disappears from the list once collected, so fewer than six may be visible mid-window. */
  index: number;
  goodId: GoodId;
  quantityNeeded: number;
  quantityLoaded: number;
  /** How much of this good the player currently holds in the barn — real inventory, not a guess. */
  available: number;
  rewardCoins: number;
  rewardXp: number;
  canCollect: boolean;
}

export interface ShipChestRewardView {
  cash: Money;
  expansionPermits: number;
}

export interface ShipView {
  unlocked: boolean;
  crates: ShipCrateView[];
  windowStartedAt: Timestamp | null;
  windowEndsAt: Timestamp | null;
  chestReady: boolean;
  /** Rolled the instant the sixth crate is collected; null before then, and null on a save from before this reward existed — an honest unknown rather than a placeholder number. */
  chestReward: ShipChestRewardView | null;
}

// ---------------------------------------------------------------------------
// Town / buildings
// ---------------------------------------------------------------------------

export interface BuildingCatalogEntry {
  id: BuildingId;
  nameKey: string;
  descriptionKey: string;
  iconId: string;
  category: "house" | "factory" | "decoration" | "field" | "civic" | "special";
  cost: { coins: number; cash: Money };
  unlockLevel: number;
  footprint: { width: number; depth: number };
}

export interface PlacedBuilding {
  id: EntityId;
  buildingId: BuildingId;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface TownView {
  catalog: BuildingCatalogEntry[];
  placed: PlacedBuilding[];
  selectedBuildingInstanceId: EntityId | null;
}

// ---------------------------------------------------------------------------
// Zoo / mine / museum
// ---------------------------------------------------------------------------

export interface AnimalDef {
  id: AnimalId;
  nameKey: string;
  iconId: string;
  enclosureBuildingId: BuildingId;
  goodYieldId: GoodId;
  yieldIntervalMs: DurationMs;
}

export interface EnclosureInstance {
  id: EntityId;
  buildingId: BuildingId;
  animalId: AnimalId | null;
  lastCollectedAt: Timestamp | null;
  readyAt: Timestamp | null;
}

export type ZooHabitatId = "grass" | "water" | "rock" | "arctic";

/** One species in the zoo's catalog, with the player's card-collection progress toward hatching it. */
export interface ZooSpeciesCard {
  speciesId: AnimalId;
  nameKey: string;
  iconId: string;
  habitat: ZooHabitatId;
  cardsHeld: number;
  cardsNeeded: number;
  hatched: boolean;
}

export interface ZooView {
  enclosures: EnclosureInstance[];
  /** Only species the player has already hatched - the only ones assignable to an enclosure. */
  availableAnimals: AnimalDef[];
  /** The full species catalog with card-collection progress, driving the hatchery/collection view. */
  speciesCards: ZooSpeciesCard[];
}

export type MineTileState = "hidden" | "revealed" | "obstacle" | "find";

export interface MineTile {
  index: number;
  state: MineTileState;
  findId: ArtifactId | null;
}

export interface MineView {
  grid: MineTile[];
  gridWidth: number;
  energyCostPerDig: number;
  toolId: string | null;
}

export interface ArtifactDef {
  id: ArtifactId;
  nameKey: string;
  iconId: string;
  setId: string;
}

export interface MuseumExhibitSlot {
  setId: string;
  setNameKey: string;
  /**
   * `available` is true when the required artifact for this exact slot has
   * already been fully assembled (state.mine.completedArtifacts) but not
   * yet donated anywhere - i.e. the slot is empty and ready to fill. It is
   * always false once `artifactId` is set (the slot is already filled).
   */
  slots: { artifactId: ArtifactId | null; def: ArtifactDef | null; available: boolean }[];
  rewardCoins: number;
  completed: boolean;
}

export interface MuseumView {
  exhibits: MuseumExhibitSlot[];
}

// ---------------------------------------------------------------------------
// Achievements / dailies / village (local-only)
// ---------------------------------------------------------------------------

export interface AchievementTier {
  tier: number;
  goal: number;
  rewardCoins: number;
  rewardXp: number;
}

export interface AchievementDef {
  id: AchievementId;
  nameKey: string;
  descriptionKey: string;
  iconId: string;
  progress: number;
  tiers: AchievementTier[];
  currentTierIndex: number;
  claimed: boolean[];
}

export interface DailyTask {
  index: number;
  descriptionKey: string;
  goal: number;
  progress: number;
  rewardCoins: number;
  completed: boolean;
  claimed: boolean;
}

export interface DailiesView {
  tasks: DailyTask[];
  streakDays: number;
  streakRewardClaimedToday: boolean;
}

/** Village is explicitly local-only: no network identity of any kind. */
export interface VillageNeighborView {
  localId: string;
  displayName: string;
  level: number;
  lastVisitedAt: Timestamp | null;
}

export interface VillageView {
  neighbors: VillageNeighborView[];
  isLocalOnly: true;
}

// ---------------------------------------------------------------------------
// Offline summary
// ---------------------------------------------------------------------------

export interface OfflineSummaryView {
  awayDurationMs: DurationMs;
  cropsHarvested: number;
  goodsProduced: { goodId: GoodId; amount: number }[];
  coinsEarned: number;
  xpEarned: number;
  ordersExpired: number;
  vehiclesArrived: number;
}

// ---------------------------------------------------------------------------
// Aggregate read-only state view consumed by the UI
// ---------------------------------------------------------------------------

export interface GameStateView {
  playerId: PlayerId;
  resources: PlayerResources;
  fields: FieldsView;
  factories: FactoriesView;
  barn: BarnView;
  orders: OrdersView;
  train: TrainView;
  helicopter: HelicopterView;
  ship: ShipView;
  town: TownView;
  zoo: ZooView;
  mine: MineView;
  museum: MuseumView;
  achievements: AchievementDef[];
  dailies: DailiesView;
  village: VillageView;
  pendingOfflineSummary: OfflineSummaryView | null;
}

/** A minimal observable: subscribe returns an unsubscribe function. */
export interface ReadonlyStore<T> {
  getSnapshot(): T;
  subscribe(listener: (value: T) => void): () => void;
}

// ---------------------------------------------------------------------------
// Renderer bridge (owned by @meadowmark/engine at integration time)
// ---------------------------------------------------------------------------

export interface RendererBridge {
  enterPlacementMode(buildingId: BuildingId, onPlaced: (x: number, y: number, rotation: 0 | 90 | 180 | 270) => void, onCancel: () => void): void;
  exitPlacementMode(): void;
  focusCameraOnEntity(entityId: EntityId): void;
  focusCameraOnTile(x: number, y: number): void;
  highlightEntity(entityId: EntityId | null): void;
  setInteractionEnabled(enabled: boolean): void;
}

// ---------------------------------------------------------------------------
// Host bridge (owned by packages/app, the Electron shell)
// ---------------------------------------------------------------------------

export interface HostBridge {
  /** Dispatch a game-affecting action; the app/engine layer owns the actual reducer. */
  dispatch(action: GameAction): void;
  openExternalEditor?(path: string): void;
  platform: "win32" | "darwin" | "linux";
}

export type GameAction =
  | { type: "field/plant"; plotId: EntityId; cropId: CropId }
  | { type: "field/plantAll"; cropId: CropId }
  | { type: "field/harvest"; plotId: EntityId }
  | { type: "field/harvestAll" }
  | { type: "field/unlockPlot" }
  | { type: "factory/queue"; factoryId: EntityId; slotIndex: number; recipeId: RecipeId }
  | { type: "factory/cancel"; factoryId: EntityId; slotIndex: number }
  | { type: "factory/collect"; factoryId: EntityId; slotIndex: number }
  | { type: "barn/sell"; goodId: GoodId; amount: number }
  | { type: "barn/upgrade" }
  | { type: "order/fill"; orderIndex: number }
  | { type: "order/reroll"; orderIndex: number }
  | { type: "train/load"; wagonIndex: number; goodId: GoodId; amount: number }
  | { type: "train/dispatch"; wagonIndex: number }
  | { type: "train/collect"; wagonIndex: number }
  | { type: "helicopter/fulfill"; orderIndex: number }
  | { type: "helicopter/openChest" }
  | { type: "ship/load"; crateIndex: number; goodId: GoodId; amount: number }
  | { type: "ship/collect"; crateIndex: number }
  | { type: "ship/openChest" }
  | { type: "town/place"; buildingId: BuildingId; x: number; y: number; rotation: 0 | 90 | 180 | 270 }
  | { type: "town/demolish"; instanceId: EntityId }
  | { type: "town/select"; instanceId: EntityId | null }
  | { type: "zoo/assign"; enclosureId: EntityId; animalId: AnimalId }
  | { type: "zoo/collect"; enclosureId: EntityId }
  | { type: "zoo/hatch"; speciesId: AnimalId }
  | { type: "animal/collect"; shedId: EntityId; animalUnitId: EntityId }
  | { type: "mine/dig"; tileIndex: number }
  | { type: "museum/donate"; setId: string; slotIndex: number; artifactId: ArtifactId }
  | { type: "achievement/claim"; achievementId: AchievementId; tier: number }
  | { type: "daily/claim"; taskIndex: number }
  | { type: "daily/claimStreak" }
  | { type: "offlineSummary/acknowledge" };
