/**
 * Maps the real @meadowmark/shared GameState onto @meadowmark/ui's
 * GameStateView (see packages/ui/src/contracts.ts).
 *
 * Like state-to-engine.ts, this reconciles two contracts that were
 * designed independently and in parallel. Several UI fields have no real
 * counterpart in the simulation (a museum system, a zoo species catalog,
 * per-good offline-summary breakdowns, cash-priced buildings, expiring
 * orders). Every such gap has a comment and an honest default - see the
 * final report for the complete list.
 */

import type { GameState, OfflineSummary } from '@meadowmark/shared';
import { barnUsed, hasAll, nextBarnUpgrade, xpToNext, ENERGY_REGEN_INTERVAL_MS, ORDER_REROLL_COST_CASH } from '@meadowmark/shared';
import type {
  AchievementDef,
  BarnView,
  BuildingCatalogEntry as UiBuildingCatalogEntry,
  CropDef,
  DailiesView,
  DeliveryVehicleView,
  FactoriesView,
  FactoryInstance as UiFactoryInstance,
  FieldsView,
  GameStateView,
  MineView,
  MuseumView,
  OfflineSummaryView,
  OrdersView,
  PlacedBuilding as UiPlacedBuilding,
  RecipeDef,
  TownView,
  VillageView,
  ZooView,
} from '@meadowmark/ui';
import {
  achievementMetaById,
  achievementCatalog,
  animalsByType,
  buildingCatalogByType,
  buildingsById,
  cropCatalog,
  cropsById,
  factoryTypesById,
  goodsById,
  recipesByFactoryType,
} from '../content.js';

const ENERGY_REGEN_PER_MINUTE = 60_000 / ENERGY_REGEN_INTERVAL_MS;

function mapFields(state: GameState): FieldsView {
  // Locked plots simply don't appear, rather than inventing a "locked"
  // PlotState the contract doesn't define; the unlock cost for the next
  // one (below) is what lets the panel offer unlocking at all.
  const plots = state.fields.plots
    .filter((p) => p.unlocked)
    .map((p) => ({
      id: p.id,
      index: p.index,
      state:
        p.cropId === null
          ? ({ kind: 'empty' } as const)
          : p.readyAt !== null && Date.now() >= p.readyAt
            ? ({ kind: 'ready', cropId: p.cropId } as const)
            : ({ kind: 'growing', cropId: p.cropId, plantedAt: p.plantedAt ?? 0, readyAt: p.readyAt ?? 0 } as const),
    }));

  const availableCrops: CropDef[] = Array.from(cropsById.values())
    .filter((c) => c.unlockLevel <= state.economy.level)
    .map((c) => ({
      id: c.id,
      // GAP FIXED: this used to pass c.displayName (a literal string like
      // "Wheat") straight into a slot that `t()` treats as a lookup key,
      // which can only ever resolve if a copy table happens to register a
      // key that is literally the English word "Wheat" - it never did, so
      // every crop picker rendered "⟨missing:Wheat⟩" in the UI. The real
      // key is namespaced per crop id and registered with real translations
      // in packages/ui/src/i18n/content.ts.
      nameKey: `content.crop.${c.id}.name`,
      iconId: `crop_${c.id}`,
      growthMs: c.growTimeMs,
      // Every crop yields 1 unit of its own good id on harvest (see fields.ts harvest()).
      yieldGoodId: c.id,
      yieldAmount: 1,
      unlockLevel: c.unlockLevel,
    }));

  const hasLockedPlot = state.fields.plots.some((p) => !p.unlocked);
  const nextPlotUnlockCost = hasLockedPlot ? state.fields.nextPlotCost : null;

  return { plots, availableCrops, nextPlotUnlockCost };
}

function mapFactories(state: GameState): FactoriesView {
  const factories: UiFactoryInstance[] = state.factories.factories.map((f) => {
    const recipes = recipesByFactoryType.get(f.factoryTypeId) ?? [];
    const availableRecipes: RecipeDef[] = recipes
      .filter((r) => r.unlockLevel <= state.economy.level)
      .map((r) => ({
        id: r.id,
        nameKey: r.id,
        iconId: `good_${r.outputGoodId}`,
        inputs: Object.entries(r.inputs).map(([goodId, amount]) => ({ goodId, amount })),
        outputGoodId: r.outputGoodId,
        outputAmount: r.outputQuantity,
        durationMs: r.productionTimeMs,
        unlockLevel: r.unlockLevel,
      }));

    // The real queue only holds active/paused jobs; pad it out to
    // queueSlots so the UI can render idle capacity too.
    const slots = Array.from({ length: f.queueSlots }, (_, index) => {
      const job = f.queue[index];
      return job
        ? {
            index,
            recipeId: job.recipeId,
            startedAt: job.startedAt,
            readyAt: job.readyAt,
            pausedBarnFull: job.paused,
          }
        : { index, recipeId: null, startedAt: null, readyAt: null, pausedBarnFull: false };
    });

    return {
      id: f.id,
      // GAP: FactoryInstance in @meadowmark/shared has no world position and
      // is never placed as a town building - there is no real buildingId to
      // report. The factoryTypeId is reused here as a stand-in.
      buildingId: f.factoryTypeId,
      nameKey: factoryTypesById.get(f.factoryTypeId)?.displayName ?? f.factoryTypeId,
      slotCount: f.queueSlots,
      slots,
      availableRecipes,
    };
  });

  return { factories };
}

function mapBarn(state: GameState): BarnView {
  const upgrade = nextBarnUpgrade(state.barn);
  const goodDefs = Object.fromEntries(
    Array.from(goodsById.values()).map((g) => [
      g.id,
      { id: g.id, nameKey: g.displayName, iconId: `good_${g.id}`, sellPrice: g.baseValue },
    ]),
  );

  return {
    capacity: state.barn.capacity,
    used: barnUsed(state.inventory),
    stock: state.inventory,
    goodDefs,
    upgradeCost: upgrade?.costCoins ?? null,
    nextCapacity: upgrade?.capacity ?? null,
  };
}

function mapOrders(state: GameState): OrdersView {
  const slots = state.orders.slots.map((slot, index) => {
    if (!slot.order) {
      return {
        index,
        orderId: null,
        requirements: [],
        rewardCoins: 0,
        rewardXp: 0,
        rewardCash: 0,
        expiresAt: null,
        canFill: false,
        rerollCost: null,
      };
    }
    const requirements = slot.order.requirements.map((r) => ({
      goodId: r.goodId,
      amount: r.quantity,
      available: state.inventory[r.goodId] ?? 0,
    }));
    const bag: Record<string, number> = {};
    for (const r of slot.order.requirements) bag[r.goodId] = r.quantity;

    return {
      index,
      orderId: slot.id,
      requirements,
      rewardCoins: slot.order.rewardCoins,
      rewardXp: slot.order.rewardXp,
      // GAP: orders never pay cash in this simulation (only coins, xp and
      // reputation stars - reputation isn't modeled by OrderSlot in
      // ui/src/contracts.ts at all).
      rewardCash: 0,
      // GAP: orders never expire in this simulation, they only refill a
      // fixed delay after being fulfilled (see ORDER_REFILL_DELAY_MS).
      expiresAt: null,
      canFill: hasAll(state.inventory, bag),
      rerollCost: ORDER_REROLL_COST_CASH,
    };
  });

  return { slots };
}

function mapTrain(state: GameState, now: number): DeliveryVehicleView {
  // GAP: the real train has 3 independent wagons (TrainState.wagons);
  // ui/src/contracts.ts's DeliveryVehicleView models exactly one vehicle
  // per kind. Wagon 0 is surfaced as "the" train; the other two wagons are
  // invisible to the UI layer until the contract grows a wagon index.
  const wagon = state.train.wagons[0];
  if (!wagon) {
    return { id: 'train', kind: 'train', state: 'idle', cargo: [], departsAt: null, returnsAt: null, chestReward: null };
  }

  const cargo = wagon.requests.map((r, index) => ({
    index,
    goodId: r.goodId,
    amount: r.quantityLoaded,
    requestedGoodId: r.goodId,
    requestedAmount: r.quantityNeeded,
  }));

  let vehicleState: DeliveryVehicleView['state'] = 'idle';
  if (wagon.departedAt === null) {
    vehicleState = wagon.requests.some((r) => r.quantityLoaded > 0) ? 'loading' : 'idle';
  } else if (wagon.returnsAt !== null && now >= wagon.returnsAt) {
    vehicleState = 'arrived';
  } else {
    vehicleState = 'returning';
  }

  return {
    id: wagon.id,
    kind: 'train',
    state: vehicleState,
    cargo,
    departsAt: wagon.departedAt,
    returnsAt: wagon.returnsAt,
    // GAP: the train pays out rewardMaterials directly on collection, not
    // through a chest - there's no coins/xp/cash/goods bundle to report.
    chestReward: null,
  };
}

function mapHelicopter(state: GameState): DeliveryVehicleView {
  // GAP: the real helicopter has 2 independent orders, each with its own
  // (possibly multi-good) requirement list, fulfilled atomically. This
  // collapses both orders into cargo slots and, since CargoSlot only
  // carries one good, surfaces only each order's FIRST requirement.
  const cargo = state.helicopter.orders.map((order, index) => {
    const req = order.requirements[0] ?? null;
    return {
      index,
      goodId: req?.goodId ?? null,
      amount: 0,
      requestedGoodId: req?.goodId ?? null,
      requestedAmount: req?.quantity ?? 0,
    };
  });

  return {
    id: 'helicopter',
    kind: 'helicopter',
    state: state.helicopter.chestReady ? 'arrived' : cargo.some((c) => c.requestedGoodId) ? 'loading' : 'idle',
    cargo,
    departsAt: null,
    returnsAt: null,
    chestReward: null,
  };
}

function mapShip(state: GameState): DeliveryVehicleView {
  const cargo = state.ship.crates.map((c, index) => ({
    index,
    goodId: c.goodId,
    amount: c.quantityLoaded,
    requestedGoodId: c.goodId,
    requestedAmount: c.quantityNeeded,
  }));

  let vehicleState: DeliveryVehicleView['state'] = 'idle';
  if (!state.ship.unlocked) vehicleState = 'idle';
  else if (state.ship.chestReady) vehicleState = 'arrived';
  else if (cargo.some((c) => c.amount > 0)) vehicleState = 'loading';

  return {
    id: 'ship',
    kind: 'ship',
    state: vehicleState,
    cargo,
    departsAt: state.ship.windowStartedAt,
    returnsAt: state.ship.windowEndsAt,
    chestReward: null,
  };
}

function mapTown(state: GameState, selectedBuildingInstanceId: string | null): TownView {
  const catalog: UiBuildingCatalogEntry[] = Object.values(buildingCatalogByType)
    .filter((entry) => entry.requiresLevel <= state.economy.level)
    .map((entry) => {
      const meta = buildingsById.get(entry.buildingTypeId);
      const category = entry.kind === 'house' ? 'house' : entry.kind === 'community' ? 'civic' : entry.kind === 'decoration' ? 'decoration' : 'field';
      return {
        id: entry.buildingTypeId,
        nameKey: meta?.displayName ?? entry.buildingTypeId,
        descriptionKey: meta?.displayName ?? entry.buildingTypeId,
        iconId: `building_${entry.buildingTypeId}`,
        category,
        // GAP: buildings never cost cash in this simulation, only coins and materials.
        cost: { coins: entry.costCoins, cash: 0 },
        unlockLevel: entry.requiresLevel,
        footprint: { width: entry.footprint.width, depth: entry.footprint.height },
      };
    });

  const placed: UiPlacedBuilding[] = state.town.buildings.map((b) => ({
    id: b.id,
    buildingId: b.buildingTypeId,
    x: b.position.x,
    y: b.position.y,
    rotation: b.rotation,
  }));

  return {
    catalog,
    placed,
    selectedBuildingInstanceId,
  };
}

function mapZoo(state: GameState): ZooView {
  const enclosures = state.zoo.enclosures.map((e) => ({
    id: e.id,
    // GAP: zoo enclosures have no linked town buildingId in shared - they
    // are their own grid-positioned entity type. The habitat is reused as
    // a stand-in identifier.
    buildingId: e.habitat,
    animalId: e.speciesId,
    lastCollectedAt: null,
    // GAP: zoo income accrues continuously (collectZooIncome), there's no
    // discrete "ready at" timestamp to report.
    readyAt: null,
  }));

  return {
    enclosures,
    // GAP: balance/ ships no zoo species catalog (no zoo.json), so there
    // is nothing real to hatch/assign yet.
    availableAnimals: [],
  };
}

function mapMine(state: GameState): MineView {
  const grid = state.mine.tiles.map((t) => ({
    index: t.index,
    state: !t.dug ? ('hidden' as const) : t.content.kind === 'artifactFragment' ? ('find' as const) : ('revealed' as const),
    findId: t.dug && t.content.kind === 'artifactFragment' ? t.content.artifactId : null,
  }));

  return {
    grid,
    gridWidth: state.mine.gridWidth,
    energyCostPerDig: 1,
    // GAP: digging never requires selecting a tool in this simulation -
    // dynamite/TNT apply automatically when the dug tile holds one.
    toolId: null,
  };
}

function mapMuseum(): MuseumView {
  // GAP: @meadowmark/shared has no museum system at all - mine.ts tracks
  // completed artifacts (state.mine.completedArtifacts) but there is no
  // museum exhibit-set/reward catalog anywhere in balance/ to build this
  // from. Always empty until that content exists.
  return { exhibits: [] };
}

function mapAchievements(state: GameState): AchievementDef[] {
  return achievementCatalog
    .slice()
    .sort((a, b) => (achievementMetaById.get(a.achievementId)?.sortIndex ?? 0) - (achievementMetaById.get(b.achievementId)?.sortIndex ?? 0))
    .map((entry) => {
      const meta = achievementMetaById.get(entry.achievementId);
      const current = state.achievements.progress[entry.achievementId];
      const currentTierIndex = current?.tier ?? 0;
      return {
        id: entry.achievementId,
        nameKey: meta?.displayName ?? entry.achievementId,
        descriptionKey: meta?.displayName ?? entry.achievementId,
        iconId: 'achievement',
        progress: current?.progress ?? 0,
        tiers: entry.tiers.map((t, i) => ({ tier: i, goal: t.threshold, rewardCoins: t.rewardCoins, rewardXp: 0 })),
        currentTierIndex,
        // GAP: evaluateAchievements() pays out the tier reward the instant
        // a counter crosses its threshold - there is no separate "claim"
        // step in the simulation, so every crossed tier is already
        // effectively claimed.
        claimed: entry.tiers.map((_, i) => i < currentTierIndex),
      };
    });
}

function mapDailies(state: GameState): DailiesView {
  const tasks = state.dailies.tasks.map((task, index) => ({
    index,
    descriptionKey: task.description,
    goal: task.targetQuantity,
    progress: task.progress,
    // GAP: individual daily tasks carry no coin reward in this
    // simulation - only the completed set pays out, via claimDailyChest().
    rewardCoins: 0,
    completed: task.completed,
    // GAP: there is no per-task claim step, only the whole-set chest.
    claimed: task.completed,
  }));

  return {
    tasks,
    streakDays: state.dailies.streak,
    streakRewardClaimedToday: state.dailies.chestClaimed,
  };
}

function mapVillage(state: GameState): VillageView {
  const neighbors = state.village.villagers.map((v) => ({
    localId: v.id,
    displayName: v.name,
    // GAP: villagers have no level or last-visited timestamp in this
    // entirely-local simulation.
    level: 1,
    lastVisitedAt: null,
  }));

  return { neighbors, isLocalOnly: true };
}

export function mapOfflineSummary(summary: OfflineSummary): OfflineSummaryView {
  return {
    awayDurationMs: summary.elapsedMs,
    // GAP: crops never auto-harvest while away - this counts how many
    // became READY while offline (readyHarvests), not how many were
    // actually collected.
    cropsHarvested: summary.readyHarvests,
    // GAP: OfflineSummary tracks batch/event COUNTS, not per-good
    // quantities, so there is nothing to build a real breakdown from.
    goodsProduced: [],
    // GAP: OfflineSummary doesn't total coins/xp earned while away.
    coinsEarned: 0,
    xpEarned: 0,
    // GAP: orders never expire in this simulation.
    ordersExpired: 0,
    // GAP: only train arrivals are counted as "vehicle arrivals" here;
    // helicopter/ship chest-ready events aren't vehicle arrivals in the
    // shared model.
    vehiclesArrived: summary.trainArrivals,
  };
}

export function stateToUiView(
  state: GameState,
  now: number,
  pendingOfflineSummary: OfflineSummaryView | null,
  selectedBuildingInstanceId: string | null = null,
): GameStateView {
  return {
    playerId: state.meta.playerName,
    resources: {
      coins: state.economy.coins,
      cash: state.economy.cash,
      xp: state.economy.xp,
      level: state.economy.level,
      xpForNextLevel: xpToNext(state.economy.level),
      population: state.economy.population,
      populationCap: state.economy.populationCap,
      energy: state.economy.energy,
      energyCap: state.economy.energyCap,
      energyRegenPerMinute: ENERGY_REGEN_PER_MINUTE,
    },
    fields: mapFields(state),
    factories: mapFactories(state),
    barn: mapBarn(state),
    orders: mapOrders(state),
    train: mapTrain(state, now),
    helicopter: mapHelicopter(state),
    ship: mapShip(state),
    town: mapTown(state, selectedBuildingInstanceId),
    zoo: mapZoo(state),
    mine: mapMine(state),
    museum: mapMuseum(),
    achievements: mapAchievements(state),
    dailies: mapDailies(state),
    village: mapVillage(state),
    pendingOfflineSummary,
  };
}
