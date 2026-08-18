/**
 * Maps the real @meadowmark/shared GameState onto @meadowmark/ui's
 * GameStateView (see packages/ui/src/contracts.ts).
 *
 * Like state-to-engine.ts, this reconciles two contracts that were
 * designed independently and in parallel. Several UI fields have no real
 * counterpart in the simulation (per-good offline-summary breakdowns,
 * cash-priced buildings, expiring orders). Every such gap has a comment
 * and an honest default - see the final report for the complete list.
 * The museum system and the zoo species catalog (both previously GAPs
 * here) are now real: see museum.ts/zoo.ts in @meadowmark/shared and
 * balance/museum.json / balance/zoo.json.
 */

import type { GameState, OfflineSummary } from '@meadowmark/shared';
import {
  barnUsed,
  hasAll,
  nextBarnUpgrade,
  xpToNext,
  ENERGY_REGEN_INTERVAL_MS,
  ORDER_REROLL_COST_CASH,
  ZOO_INCOME_INTERVAL_MS,
} from '@meadowmark/shared';
import type {
  AchievementDef,
  BarnView,
  BuildingCatalogEntry as UiBuildingCatalogEntry,
  CropDef,
  DailiesView,
  FactoriesView,
  FactoryInstance as UiFactoryInstance,
  FieldsView,
  GameStateView,
  HelicopterView,
  MineView,
  MuseumView,
  OfflineSummaryView,
  OrdersView,
  PlacedBuilding as UiPlacedBuilding,
  RecipeDef,
  ShipView,
  TownView,
  TrainView,
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
  museumArtifactsById,
  museumExhibitCatalog,
  recipesByFactoryType,
  zooSpeciesList,
} from '../content.js';

const ENERGY_REGEN_PER_MINUTE = 60_000 / ENERGY_REGEN_INTERVAL_MS;

function mapFields(state: GameState): FieldsView {
  // GAP: GameAction (ui/src/contracts.ts) has no "unlock plot" action, so
  // plot unlocking isn't reachable from the UI layer at all yet. Only
  // currently-unlocked plots are surfaced; locked ones simply don't
  // appear, rather than inventing a "locked" PlotState the contract
  // doesn't define.
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

  return { plots, availableCrops };
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
      // NOTE: FactoryInstance now carries a real world `position` (schema
      // v2 - see @meadowmark/shared's factories.ts), but it is still not
      // placed as a @meadowmark/shared TownState building, so there is no
      // PlacedBuilding id to report here. The factoryTypeId is reused as
      // a stand-in for this UI-only field.
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

function mapTrain(state: GameState, now: number): TrainView {
  // FIXED GAP: the real train has 3 independent wagons (TrainState.wagons)
  // and used to be collapsed onto wagon 0 only, leaving the other two
  // invisible and unusable. Every wagon is now its own TrainWagonView.
  const wagons = state.train.wagons.map((wagon, index) => {
    const requests = wagon.requests.map((r) => ({
      goodId: r.goodId,
      quantityNeeded: r.quantityNeeded,
      quantityLoaded: r.quantityLoaded,
      available: state.inventory[r.goodId] ?? 0,
    }));

    let vehicleState: 'loading' | 'departed' | 'arrived' = 'loading';
    if (wagon.departedAt !== null) {
      vehicleState = wagon.returnsAt !== null && now >= wagon.returnsAt ? 'arrived' : 'departed';
    }

    // Real material rewards, straight from state - empty until the wagon
    // has actually departed and rolled one (see train.ts's departWagon()).
    const rewardMaterials = Object.entries(wagon.rewardMaterials).map(([goodId, amount]) => ({ goodId, amount }));

    return {
      id: wagon.id,
      index,
      requests,
      state: vehicleState,
      departedAt: wagon.departedAt,
      returnsAt: wagon.returnsAt,
      rewardMaterials,
    };
  });

  return { wagons };
}

function mapHelicopter(state: GameState): HelicopterView {
  const orders = state.helicopter.orders.map((order, index) => {
    const requirements = order.requirements.map((r) => ({
      goodId: r.goodId,
      amount: r.quantity,
      available: state.inventory[r.goodId] ?? 0,
    }));
    const bag: Record<string, number> = {};
    for (const r of order.requirements) bag[r.goodId] = r.quantity;

    return {
      id: order.id,
      index,
      state: order.requirements.length > 0 ? ('available' as const) : ('refilling' as const),
      requirements,
      rewardCoins: order.rewardCoins,
      rewardReputationStars: order.rewardReputationStars,
      refillAt: order.refillAt,
      canFulfill: order.requirements.length > 0 && hasAll(state.inventory, bag),
    };
  });

  // The chest's contents are rolled by shared the instant the bar fills
  // (see helicopter.ts's fulfillHeliOrder()) and live in state.helicopter.
  // chestReward - real state, never a placeholder guessed here. A save
  // from before that reward existed can have chestReady true with no
  // roll recorded; that renders as an honest "unknown" rather than a
  // fabricated number.
  const reward = state.helicopter.chestReward;
  return {
    orders,
    reputationBar: state.helicopter.reputationBar,
    reputationBarCap: state.helicopter.reputationBarCap,
    chestReady: state.helicopter.chestReady,
    chestReward:
      state.helicopter.chestReady && reward
        ? { cash: reward.cash, boosterKind: reward.boosterKind, boosterQuantity: reward.boosterQuantity, expansionPermits: reward.expansionPermits }
        : null,
  };
}

function mapShip(state: GameState): ShipView {
  const crates = state.ship.crates.map((c, index) => ({
    id: c.id,
    index,
    goodId: c.goodId,
    quantityNeeded: c.quantityNeeded,
    quantityLoaded: c.quantityLoaded,
    available: state.inventory[c.goodId] ?? 0,
    rewardCoins: c.rewardCoins,
    rewardXp: c.rewardXp,
    canCollect: c.quantityLoaded >= c.quantityNeeded,
  }));

  // The chest's contents are rolled by shared the instant the sixth crate
  // is collected (see ship.ts's collectCrate()) and live in
  // state.ship.chestReward - real state, never a placeholder guessed here.
  const reward = state.ship.chestReward;
  return {
    unlocked: state.ship.unlocked,
    crates,
    windowStartedAt: state.ship.windowStartedAt,
    windowEndsAt: state.ship.windowEndsAt,
    chestReady: state.ship.chestReady,
    chestReward: state.ship.chestReady && reward ? { cash: reward.cash, expansionPermits: reward.expansionPermits } : null,
  };
}

function mapTown(state: GameState): TownView {
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
    // GAP: building selection isn't modeled by GameAction; there is no
    // "select building instance" action to drive this from.
    selectedBuildingInstanceId: null,
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
    // Income accrues continuously (collectZooIncome) rather than through a
    // single readyAt the way factories/animals do, but the very next
    // instant at which at least one interval's worth is collectible is
    // exactly incomeAnchorAt + one interval - real and meaningful, not a
    // guess, so the grid tile's "ready" pulse means something.
    readyAt: e.speciesId ? e.incomeAnchorAt + ZOO_INCOME_INTERVAL_MS : null,
  }));

  // Only species the player has actually hatched can be assigned to an
  // enclosure - matching zoo.ts's hatchSpecies()/state.zoo.hatchedSpecies.
  const availableAnimals = zooSpeciesList
    .filter((s) => state.zoo.hatchedSpecies.includes(s.speciesId))
    .map((s) => ({
      id: s.speciesId,
      nameKey: `content.zoo.${s.speciesId}.name`,
      iconId: s.iconId,
      // GAP: zoo species have no linked town/enclosure building type in
      // this simulation - enclosures are their own grid entity (see
      // above), so there is no real BuildingId to report here. The
      // habitat is reused as a stand-in, same as `enclosures[].buildingId`.
      enclosureBuildingId: s.habitat,
      goodYieldId: 'coins',
      yieldIntervalMs: ZOO_INCOME_INTERVAL_MS,
    }));

  const speciesCards = zooSpeciesList.map((s) => ({
    speciesId: s.speciesId,
    nameKey: `content.zoo.${s.speciesId}.name`,
    iconId: s.iconId,
    habitat: s.habitat,
    cardsHeld: state.zoo.animalCards[s.speciesId] ?? 0,
    cardsNeeded: s.cardsNeeded,
    hatched: state.zoo.hatchedSpecies.includes(s.speciesId),
  }));

  return { enclosures, availableAnimals, speciesCards };
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

function mapMuseum(state: GameState): MuseumView {
  const exhibits = museumExhibitCatalog.map((def) => {
    const progress = state.museum.exhibits.find((e) => e.exhibitId === def.exhibitId);
    const donated = progress?.donatedArtifactIds ?? [];
    const slots = def.artifactIds.map((artifactId) => {
      const isDonated = donated.includes(artifactId);
      const artifactMeta = museumArtifactsById.get(artifactId);
      const uiDef = artifactMeta
        ? { id: artifactId, nameKey: `content.museum.artifact.${artifactId}.name`, iconId: artifactMeta.iconId, setId: artifactMeta.setId }
        : null;
      return {
        artifactId: isDonated ? artifactId : null,
        def: uiDef,
        // Ready to donate: the artifact is fully assembled and hasn't
        // already gone to this or any other exhibit.
        available: !isDonated && state.mine.completedArtifacts.includes(artifactId) && !state.museum.donatedArtifactIds.includes(artifactId),
      };
    });
    return {
      setId: def.exhibitId,
      setNameKey: `content.museum.exhibit.${def.exhibitId}.name`,
      slots,
      rewardCoins: def.rewardCoins,
      completed: progress?.completed ?? false,
    };
  });

  return { exhibits };
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

export function stateToUiView(state: GameState, now: number, pendingOfflineSummary: OfflineSummaryView | null): GameStateView {
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
    town: mapTown(state),
    zoo: mapZoo(state),
    mine: mapMine(state),
    museum: mapMuseum(state),
    achievements: mapAchievements(state),
    dailies: mapDailies(state),
    village: mapVillage(state),
    pendingOfflineSummary,
  };
}
