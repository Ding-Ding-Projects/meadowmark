/**
 * Loads balance/*.json (the game's content data) and turns it into the
 * catalogs @meadowmark/shared's tick() and its action functions expect.
 *
 * This is the one place in the renderer package that reads content data.
 * Every adapter and every action dispatcher receives its catalogs from
 * here rather than re-reading JSON itself.
 *
 * GAP: balance/ has no JSON file for daily task templates or regatta task
 * templates (dailies.ts and village.ts both take a caller-supplied
 * template list; balance/ only covers crops/goods/animals/factories/
 * buildings/achievements/unlocks). DAILY_TASK_TEMPLATES and
 * REGATTA_TASK_TEMPLATES below are a small hand-authored placeholder set
 * so those subsystems have something to roll from. Whichever lane owns
 * balance/ should add real dailies.json / regatta.json content and this
 * file should switch to loading it.
 */

import type {
  AchievementCatalogEntry,
  AnimalCatalogEntry,
  BuildingCatalogEntry,
  CropCatalogEntry,
  DailyTaskTemplate,
  HeliOrderableGood,
  OrderableGood,
  RecipeCatalogEntry,
  RegattaTaskTemplate,
  ShippableGood,
  TickConfig,
} from '@meadowmark/shared';

import goodsJson from '../../../balance/goods.json';
import cropsJson from '../../../balance/crops.json';
import animalsJson from '../../../balance/animals.json';
import factoriesJson from '../../../balance/factories.json';
import buildingsJson from '../../../balance/buildings.json';
import achievementsJson from '../../../balance/achievements.json';

interface GoodEntry {
  id: string;
  category: string;
  unlockLevel: number;
  baseValue: number;
  displayName: string;
}

interface CropEntry {
  id: string;
  displayName: string;
  unlockLevel: number;
  growTimeMs: number;
  seedCostCoins: number;
  xpReward: number;
  coinReward: number;
  sortIndex: number;
}

interface AnimalEntry {
  id: string;
  level: number;
  productGoodId: string;
  productionTimeMs: number;
  feedCost: number;
  displayName: string;
  coinReward: number;
  xpReward: number;
}

interface RecipeEntry {
  id: string;
  factoryTypeId: string;
  inputs: Record<string, number>;
  outputGoodId: string;
  outputQuantity: number;
  productionTimeMs: number;
  unlockLevel: number;
  xpReward: number;
  coinReward: number;
}

interface FactoryTypeEntry {
  id: string;
  displayName: string;
  unlockLevel: number;
}

interface BuildingEntry {
  buildingTypeId: string;
  displayName: string;
  kind: 'house' | 'community' | 'decoration' | 'road';
  footprint: { width: number; height: number };
  costCoins: number;
  costMaterials: Record<string, number>;
  buildTimeMs: number;
  populationReward: number;
  requiresPopulation: number;
  requiresLevel: number;
  charmValue: number;
}

interface AchievementTierEntry {
  threshold: number;
  rewardCoins: number;
  rewardCash: number;
}

interface AchievementEntry {
  achievementId: string;
  displayName: string;
  counterKey: string;
  sortIndex: number;
  tiers: AchievementTierEntry[];
}

const goods = (goodsJson as { goods: GoodEntry[] }).goods;
const crops = (cropsJson as { crops: CropEntry[] }).crops;
const animals = (animalsJson as { animals: AnimalEntry[] }).animals;
const recipes = (factoriesJson as { recipes: RecipeEntry[] }).recipes;
const factoryTypes = (factoriesJson as { factoryTypes: FactoryTypeEntry[] }).factoryTypes;
const buildings = (buildingsJson as { buildings: BuildingEntry[] }).buildings;
const achievementsCatalogRaw = (achievementsJson as { achievements: AchievementEntry[] }).achievements;

/** Good id -> its balance entry, for anywhere the UI needs a display name/sell value. */
export const goodsById: ReadonlyMap<string, GoodEntry> = new Map(goods.map((g) => [g.id, g]));

/** Crop id -> its balance entry. */
export const cropsById: ReadonlyMap<string, CropEntry> = new Map(crops.map((c) => [c.id, c]));

/** Animal (species) type id -> its balance entry. */
export const animalsByType: ReadonlyMap<string, AnimalEntry> = new Map(animals.map((a) => [a.id, a]));

/** Recipe id -> its balance entry. */
export const recipesById: ReadonlyMap<string, RecipeEntry> = new Map(recipes.map((r) => [r.id, r]));

/** Factory type id -> the recipes it can run. */
export const recipesByFactoryType: ReadonlyMap<string, RecipeEntry[]> = (() => {
  const map = new Map<string, RecipeEntry[]>();
  for (const r of recipes) {
    const list = map.get(r.factoryTypeId) ?? [];
    list.push(r);
    map.set(r.factoryTypeId, list);
  }
  return map;
})();

export const factoryTypesById: ReadonlyMap<string, FactoryTypeEntry> = new Map(factoryTypes.map((f) => [f.id, f]));

/** Building type id -> its balance entry. */
export const buildingsById: ReadonlyMap<string, BuildingEntry> = new Map(buildings.map((b) => [b.buildingTypeId, b]));

export const cropCatalog: Record<string, CropCatalogEntry> = Object.fromEntries(
  crops.map((c): [string, CropCatalogEntry] => [
    c.id,
    {
      cropId: c.id,
      growTimeMs: c.growTimeMs,
      seedCostCoins: c.seedCostCoins,
      xpReward: c.xpReward,
      coinReward: c.coinReward,
    },
  ]),
);

export const animalCatalogByType: Record<string, AnimalCatalogEntry> = Object.fromEntries(
  animals.map((a): [string, AnimalCatalogEntry] => [
    a.id,
    {
      animalTypeId: a.id,
      productGoodId: a.productGoodId,
      productionTimeMs: a.productionTimeMs,
      feedCost: a.feedCost,
      xpReward: a.xpReward,
      coinReward: a.coinReward,
    },
  ]),
);

export const recipeCatalog: Record<string, RecipeCatalogEntry> = Object.fromEntries(
  recipes.map((r): [string, RecipeCatalogEntry] => [
    r.id,
    {
      recipeId: r.id,
      factoryTypeId: r.factoryTypeId,
      inputs: r.inputs,
      outputGoodId: r.outputGoodId,
      outputQuantity: r.outputQuantity,
      productionTimeMs: r.productionTimeMs,
      unlockLevel: r.unlockLevel,
      xpReward: r.xpReward,
      coinReward: r.coinReward,
    },
  ]),
);

export const buildingCatalogByType: Record<string, BuildingCatalogEntry> = Object.fromEntries(
  buildings.map((b): [string, BuildingCatalogEntry] => [
    b.buildingTypeId,
    {
      buildingTypeId: b.buildingTypeId,
      footprint: b.footprint,
      costCoins: b.costCoins,
      costMaterials: b.costMaterials,
      buildTimeMs: b.buildTimeMs,
      populationReward: b.populationReward,
      requiresPopulation: b.requiresPopulation,
      requiresLevel: b.requiresLevel,
      charmValue: b.charmValue,
      kind: b.kind,
    },
  ]),
);

export const achievementCatalog: AchievementCatalogEntry[] = achievementsCatalogRaw.map((a) => ({
  achievementId: a.achievementId,
  counterKey: a.counterKey,
  tiers: a.tiers,
}));

/** achievementId -> its display name / sort index, kept separately since AchievementCatalogEntry (shared's type) doesn't carry display metadata. */
export const achievementMetaById: ReadonlyMap<string, { displayName: string; sortIndex: number }> = new Map(
  achievementsCatalogRaw.map((a) => [a.achievementId, { displayName: a.displayName, sortIndex: a.sortIndex }]),
);

/**
 * GAP: goods.json has one unlockLevel/baseValue per good with no
 * distinction between "orderable at the farm board", "orderable via
 * helicopter" and "shippable by boat". The real game likely wants three
 * different pools (the ship in particular is meant to want higher-tier
 * goods per ship.ts's header comment). Until balance/ carries that
 * distinction, all three delivery systems draw from the same full goods
 * list, filtered only by tick()'s own unlockLevel <= playerLevel check.
 */
const orderableGoodPool = goods.map((g) => ({ goodId: g.id, unlockLevel: g.unlockLevel, baseValue: g.baseValue }));

export const orderableGoods: OrderableGood[] = orderableGoodPool;
export const heliOrderableGoods: HeliOrderableGood[] = orderableGoodPool;
export const shippableGoods: ShippableGood[] = orderableGoodPool;
export const trainRequestGoods = goods.map((g) => ({ goodId: g.id, unlockLevel: g.unlockLevel }));

/**
 * GAP: no dailies.json/regatta.json in balance/. This is a small
 * hand-authored placeholder template set built from real crop/good ids so
 * the daily-task and regatta systems have real, playable content rather
 * than being permanently empty. Replace with real balance data when that
 * lane ships it.
 */
export const dailyTaskTemplates: DailyTaskTemplate[] = [
  {
    targetKind: 'harvest',
    describe: (q) => `Harvest ${q} crops`,
    targetIdPool: null,
    minQuantity: 5,
    maxQuantity: 15,
  },
  {
    targetKind: 'orderFulfilled',
    describe: (q) => `Fill ${q} orders`,
    targetIdPool: null,
    minQuantity: 1,
    maxQuantity: 3,
  },
  {
    targetKind: 'factoryCollect',
    describe: (q) => `Collect ${q} factory products`,
    targetIdPool: null,
    minQuantity: 3,
    maxQuantity: 8,
  },
  {
    targetKind: 'animalCollect',
    describe: (q) => `Collect ${q} animal products`,
    targetIdPool: null,
    minQuantity: 3,
    maxQuantity: 8,
  },
  {
    targetKind: 'mineDig',
    describe: (q) => `Dig ${q} mine tiles`,
    targetIdPool: null,
    minQuantity: 5,
    maxQuantity: 12,
  },
];

export const regattaTaskTemplates: RegattaTaskTemplate[] = [
  { description: 'Harvest crops', targetKind: 'harvest', minQuantity: 20, maxQuantity: 40, scoreValue: 10 },
  { description: 'Fulfill orders', targetKind: 'orderFulfilled', minQuantity: 3, maxQuantity: 6, scoreValue: 15 },
  { description: 'Collect factory goods', targetKind: 'factoryCollect', minQuantity: 10, maxQuantity: 20, scoreValue: 12 },
];

export const regattaScoreBarCap = 100;

/** Full TickConfig built from every catalog above, passed to tick()/resumeOffline() on every call. */
export const tickConfig: TickConfig = {
  orderableGoods,
  heliOrderableGoods,
  shippableGoods,
  buildingCatalog: buildingCatalogByType,
  dailyTaskTemplates,
  regattaTaskTemplates,
  regattaScoreBarCap,
};
