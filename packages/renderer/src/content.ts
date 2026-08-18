/**
 * Loads balance/*.json (the game's content data) and turns it into the
 * catalogs @meadowmark/shared's tick() and its action functions expect.
 *
 * This is the one place in the renderer package that reads content data.
 * Every adapter and every action dispatcher receives its catalogs from
 * here rather than re-reading JSON itself.
 */

import type {
  AchievementCatalogEntry,
  AnimalCatalogEntry,
  BoosterKind,
  BuildingCatalogEntry,
  CropCatalogEntry,
  DailyTaskTemplate,
  HeliChestReward,
  HeliOrderableGood,
  OrderableGood,
  RecipeCatalogEntry,
  RegattaTaskTemplate,
  ShipChestReward,
  ShippableGood,
  TickConfig,
} from '@meadowmark/shared';
import type { MuseumExhibitDef } from '@meadowmark/shared';
import type { ZooSpeciesCatalogEntry } from '@meadowmark/shared';

import goodsJson from '../../../balance/goods.json';
import cropsJson from '../../../balance/crops.json';
import animalsJson from '../../../balance/animals.json';
import factoriesJson from '../../../balance/factories.json';
import buildingsJson from '../../../balance/buildings.json';
import achievementsJson from '../../../balance/achievements.json';
import zooJson from '../../../balance/zoo.json';
import museumJson from '../../../balance/museum.json';
import dailiesJson from '../../../balance/dailies.json';
import regattaJson from '../../../balance/regatta.json';
import chestsJson from '../../../balance/chests.json';

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

interface ZooSpeciesEntry {
  speciesId: string;
  displayName: string;
  iconId: string;
  habitat: 'grass' | 'water' | 'rock' | 'arctic';
  family: string;
  cardsNeeded: number;
  baseIncomeCoins: number;
  baseIncomeZooBucks: number;
}

interface MuseumArtifactEntry {
  id: string;
  displayName: string;
  iconId: string;
  setId: string;
}

interface MuseumExhibitEntry {
  exhibitId: string;
  displayName: string;
  artifactIds: string[];
  rewardCoins: number;
  rewardCash: number;
  bonusKind: MuseumExhibitDef['bonusKind'];
  bonusValue: number;
}

interface DailyTaskTemplateEntry {
  targetKind: string;
  descriptionTemplate: string;
  targetIdPool: string[] | null;
  minQuantity: number;
  maxQuantity: number;
}

interface RegattaTaskTemplateEntry {
  description: string;
  targetKind: string;
  minQuantity: number;
  maxQuantity: number;
  scoreValue: number;
}

interface ChestRewardEntry {
  cash: number;
  boosterKinds?: BoosterKind[];
  animalCards?: Record<string, number>;
  expansionPermits?: number;
}

interface DailyChestRewardEntry {
  rewardCoins: number;
  rewardCash: number;
}

const goods = (goodsJson as unknown as { goods: GoodEntry[] }).goods;
const crops = (cropsJson as unknown as { crops: CropEntry[] }).crops;
const animals = (animalsJson as unknown as { animals: AnimalEntry[] }).animals;
const recipes = (factoriesJson as unknown as { recipes: RecipeEntry[] }).recipes;
const factoryTypes = (factoriesJson as unknown as { factoryTypes: FactoryTypeEntry[] }).factoryTypes;
const buildings = (buildingsJson as unknown as { buildings: BuildingEntry[] }).buildings;
const achievementsCatalogRaw = (achievementsJson as unknown as { achievements: AchievementEntry[] }).achievements;
const zooSpeciesRaw = (zooJson as unknown as { species: ZooSpeciesEntry[] }).species;
const museumArtifactsRaw = (museumJson as unknown as { artifacts: MuseumArtifactEntry[] }).artifacts;
const museumExhibitsRaw = (museumJson as unknown as { exhibits: MuseumExhibitEntry[] }).exhibits;
const dailyTaskTemplatesRaw = (dailiesJson as unknown as { templates: DailyTaskTemplateEntry[] }).templates;
const regattaTaskTemplatesRaw = (regattaJson as unknown as { templates: RegattaTaskTemplateEntry[]; scoreBarCap: number });
const chestsRaw = chestsJson as unknown as { helicopter: ChestRewardEntry; ship: ChestRewardEntry; daily: DailyChestRewardEntry };

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

/** balance/dailies.json's 5 rotating task templates, with `descriptionTemplate`'s "{q}" placeholder turned into the `describe` closure DailyTaskTemplate expects. */
export const dailyTaskTemplates: DailyTaskTemplate[] = dailyTaskTemplatesRaw.map((t) => ({
  targetKind: t.targetKind,
  describe: (q: number) => t.descriptionTemplate.replace('{q}', String(q)),
  targetIdPool: t.targetIdPool,
  minQuantity: t.minQuantity,
  maxQuantity: t.maxQuantity,
}));

/** balance/regatta.json's weekly regatta task templates. */
export const regattaTaskTemplates: RegattaTaskTemplate[] = regattaTaskTemplatesRaw.templates.map((t) => ({
  description: t.description,
  targetKind: t.targetKind,
  minQuantity: t.minQuantity,
  maxQuantity: t.maxQuantity,
  scoreValue: t.scoreValue,
}));

export const regattaScoreBarCap = regattaTaskTemplatesRaw.scoreBarCap;

/** balance/zoo.json's species id -> the ZooSpeciesCatalogEntry shape zoo.ts's hatchSpecies/collectZooIncome need. */
export const zooSpeciesCatalog: Record<string, ZooSpeciesCatalogEntry> = Object.fromEntries(
  zooSpeciesRaw.map((s): [string, ZooSpeciesCatalogEntry] => [
    s.speciesId,
    {
      speciesId: s.speciesId,
      habitat: s.habitat,
      family: s.family,
      cardsNeeded: s.cardsNeeded,
      baseIncomeCoins: s.baseIncomeCoins,
      baseIncomeZooBucks: s.baseIncomeZooBucks,
    },
  ]),
);

/** balance/zoo.json's species id -> display metadata (name/icon), kept separately since ZooSpeciesCatalogEntry (shared's type) carries no display fields. */
export const zooSpeciesMetaById: ReadonlyMap<string, ZooSpeciesEntry> = new Map(zooSpeciesRaw.map((s) => [s.speciesId, s]));
export const zooSpeciesList: ZooSpeciesEntry[] = zooSpeciesRaw;

/** balance/museum.json's artifact id -> display metadata (name/icon/owning exhibit). */
export const museumArtifactsById: ReadonlyMap<string, MuseumArtifactEntry> = new Map(museumArtifactsRaw.map((a) => [a.id, a]));

/** balance/museum.json's exhibit catalog, in the MuseumExhibitDef shape museum.ts's donateArtifact/museumBonusTotal need. */
export const museumExhibitCatalog: MuseumExhibitDef[] = museumExhibitsRaw.map((e) => ({
  exhibitId: e.exhibitId,
  artifactIds: e.artifactIds,
  rewardCoins: e.rewardCoins,
  rewardCash: e.rewardCash,
  bonusKind: e.bonusKind,
  bonusValue: e.bonusValue,
}));
export const museumExhibitCatalogById: Record<string, MuseumExhibitDef> = Object.fromEntries(
  museumExhibitCatalog.map((e): [string, MuseumExhibitDef] => [e.exhibitId, e]),
);
/** exhibitId -> display metadata (name), kept separately for the same reason as achievementMetaById above. */
export const museumExhibitMetaById: ReadonlyMap<string, { displayName: string }> = new Map(
  museumExhibitsRaw.map((e) => [e.exhibitId, { displayName: e.displayName }]),
);

/** balance/chests.json's helicopter/ship/daily chest rewards, in the shapes openHeliChest/openShipChest/claimDailyChest expect. */
export const heliChestReward: HeliChestReward = {
  cash: chestsRaw.helicopter.cash,
  boosterKinds: chestsRaw.helicopter.boosterKinds ?? [],
  animalCards: chestsRaw.helicopter.animalCards ?? {},
};
export const shipChestReward: ShipChestReward = {
  cash: chestsRaw.ship.cash,
  expansionPermits: chestsRaw.ship.expansionPermits ?? 0,
  animalCards: chestsRaw.ship.animalCards ?? {},
};
export const dailyChestReward: DailyChestRewardEntry = chestsRaw.daily;

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
