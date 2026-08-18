/**
 * Turns every @meadowmark/ui GameAction into a real call against
 * @meadowmark/shared, using the catalogs built in content.ts.
 *
 * Some actions the UI can dispatch have no matching function in
 * @meadowmark/shared at all (there is no "cancel a factory job", "demolish
 * a building", or "sell a good" function, and achievements/dailies pay out
 * automatically rather than through an explicit claim). Each such case is
 * called out below and handled as an honest, documented no-op (or, where
 * the existing exported economy/barn helpers are enough to build the
 * feature for real - as with barn/sell - implemented directly rather than
 * faked).
 */

import type { GameAction } from '@meadowmark/ui';
import type { GameState } from '@meadowmark/shared';
import {
  claimDailyChest,
  collectAll,
  collectCrate,
  collectProduction,
  collectWagon,
  collectZooIncome,
  departWagon,
  digTile,
  donateArtifact,
  fulfillHeliOrder,
  fulfillOrder,
  harvest,
  harvestAll,
  hatchSpecies,
  loadCrate,
  loadWagon,
  museumBonusTotal,
  openHeliChest,
  openShipChest,
  placeBuilding,
  plant,
  plantAll,
  removeGood,
  rerollOrder,
  startProduction,
  upgradeBarn,
} from '@meadowmark/shared';
import {
  animalCatalogByType,
  buildingCatalogByType,
  cropCatalog,
  dailyChestReward,
  goodsById,
  heliChestReward,
  museumExhibitCatalog,
  museumExhibitCatalogById,
  orderableGoods,
  recipeCatalog,
  shipChestReward,
  trainRequestGoods,
  zooSpeciesCatalog,
} from '../content.js';

/**
 * Cumulative gameplay counters achievements.ts's evaluateAchievements()
 * needs (see balance/achievements.json's counterKey field). @meadowmark/shared
 * keeps no running totals of its own - the app layer owns tallying these as
 * actions succeed, exactly per achievements.ts's own doc comment.
 */
export interface AchievementCounters {
  totalHarvests: number;
  totalGoodsProduced: number;
  ordersFulfilled: number;
  buildingsPlaced: number;
  tilesDug: number;
  animalsHatched: number;
}

export function createAchievementCounters(): AchievementCounters {
  return { totalHarvests: 0, totalGoodsProduced: 0, ordersFulfilled: 0, buildingsPlaced: 0, tilesDug: 0, animalsHatched: 0 };
}

let nextEntityId = 1;
function freshId(prefix: string): string {
  nextEntityId += 1;
  return `${prefix}-${Date.now()}-${nextEntityId}`;
}

export function applyAction(state: GameState, counters: AchievementCounters, action: GameAction, now: number): GameState {
  const rng = state.rng;

  switch (action.type) {
    case 'field/plant': {
      const catalog = cropCatalog[action.cropId];
      if (!catalog) return state;
      return plant(state, action.plotId, action.cropId, catalog.growTimeMs, catalog.seedCostCoins, now);
    }
    case 'field/plantAll': {
      const catalog = cropCatalog[action.cropId];
      if (!catalog) return state;
      return plantAll(state, catalog, now).state;
    }
    case 'field/harvest': {
      const plot = state.fields.plots.find((p) => p.id === action.plotId);
      const catalog = plot?.cropId ? cropCatalog[plot.cropId] : undefined;
      if (!plot || !catalog) return state;
      const result = harvest(state, action.plotId, catalog, now);
      if (result.harvested) {
        counters.totalHarvests += 1;
        counters.totalGoodsProduced += 1;
      }
      return result.state;
    }
    case 'field/harvestAll': {
      const result = harvestAll(state, cropCatalog, now);
      counters.totalHarvests += result.result.harvestedPlotIds.length;
      counters.totalGoodsProduced += result.result.harvestedPlotIds.length;
      return result.state;
    }

    case 'factory/queue': {
      const recipe = recipeCatalog[action.recipeId];
      if (!recipe) return state;
      return startProduction(state, action.factoryId, recipe, now).state;
    }
    case 'factory/cancel': {
      // GAP: @meadowmark/shared has no function to remove/cancel a queued
      // factory job (factories.ts only offers startProduction and
      // collectProduction). This is a genuine missing capability, not a
      // mapping choice - report to whoever owns @meadowmark/shared.
      return state;
    }

    case 'barn/sell': {
      const good = goodsById.get(action.goodId);
      const held = state.inventory[action.goodId] ?? 0;
      const amount = Math.min(action.amount, held);
      if (!good || amount <= 0) return state;
      return {
        ...state,
        inventory: removeGood(state.inventory, action.goodId, amount),
        economy: { ...state.economy, coins: state.economy.coins + good.baseValue * amount },
      };
    }
    case 'barn/upgrade':
      return upgradeBarn(state);

    case 'order/fill': {
      const slot = state.orders.slots[action.orderIndex];
      if (!slot) return state;
      const result = fulfillOrder(state, slot.id, now);
      if (result.fulfilled) counters.ordersFulfilled += 1;
      return result.state;
    }
    case 'order/reroll': {
      const slot = state.orders.slots[action.orderIndex];
      if (!slot) return state;
      return rerollOrder(state, rng, slot.id, orderableGoods).state;
    }

    // Train: three independent wagons, each addressed by its own index -
    // every wagon is individually loadable, dispatchable, and collectible
    // (this used to be hardcoded to wagons[0] only; the other two wagons
    // were invisible and unusable from the UI).
    case 'train/load': {
      const wagon = state.train.wagons[action.wagonIndex];
      if (!wagon) return state;
      return loadWagon(state, wagon.id, action.goodId, action.amount).state;
    }
    case 'train/dispatch': {
      const wagon = state.train.wagons[action.wagonIndex];
      if (!wagon) return state;
      return departWagon(state, rng, wagon.id, now).state;
    }
    case 'train/collect': {
      const wagon = state.train.wagons[action.wagonIndex];
      if (!wagon) return state;
      return collectWagon(state, rng, wagon.id, trainRequestGoods, now).state;
    }

    // Helicopter: orders are fulfilled atomically from inventory (there is
    // no incremental "load" concept for them), and the reputation chest is
    // opened as its own explicit action once its already-rolled reward is
    // ready.
    case 'helicopter/fulfill': {
      const order = state.helicopter.orders[action.orderIndex];
      if (!order) return state;
      return fulfillHeliOrder(state, rng, order.id, now).state;
    }
    case 'helicopter/openChest':
      return openHeliChest(state);

    // Ship: crates are loaded incrementally like the train's wagons, then
    // collected individually once full; the all-six chest opens as its own
    // explicit action once its already-rolled reward is ready.
    case 'ship/load': {
      const crate = state.ship.crates[action.crateIndex];
      if (!crate) return state;
      return loadCrate(state, crate.id, action.amount).state;
    }
    case 'ship/collect': {
      const crate = state.ship.crates[action.crateIndex];
      if (!crate) return state;
      return collectCrate(state, rng, crate.id, now).state;
    }
    case 'ship/openChest':
      return openShipChest(state);

    case 'town/place': {
      const catalog = buildingCatalogByType[action.buildingId];
      if (!catalog) return state;
      const result = placeBuilding(state, catalog, { x: action.x, y: action.y }, freshId('building'), now);
      if (result.placed) counters.buildingsPlaced += 1;
      // GAP: placeBuilding() in @meadowmark/shared always places at
      // rotation 0 - it has no parameter for the requested rotation, so
      // action.rotation is silently unusable here. Report to whoever owns
      // @meadowmark/shared's town.ts.
      return result.state;
    }
    case 'town/demolish': {
      // GAP: @meadowmark/shared has no function to remove a placed
      // building (town.ts only offers placeBuilding). Genuine missing
      // capability.
      return state;
    }

    case 'zoo/assign':
      // Only a species the player has actually hatched (see zoo/hatch
      // below) may be put in an enclosure - assignSpeciesToEnclosure()
      // itself is a dumb setter with no such check, so the gate lives here.
      if (!state.zoo.hatchedSpecies.includes(action.animalId)) return state;
      return {
        ...state,
        zoo: {
          ...state.zoo,
          enclosures: state.zoo.enclosures.map((e) => (e.id === action.enclosureId ? { ...e, speciesId: action.animalId } : e)),
        },
      };
    case 'zoo/collect': {
      const zooBonus = museumBonusTotal(state, museumExhibitCatalog, 'zooIncomeBonus');
      const result = collectZooIncome(state, action.enclosureId, zooSpeciesCatalog, now, zooBonus);
      return result.state;
    }
    case 'zoo/hatch': {
      const species = zooSpeciesCatalog[action.speciesId];
      if (!species) return state;
      const result = hatchSpecies(state, species);
      if (result.hatched) counters.animalsHatched += 1;
      return result.state;
    }

    case 'mine/dig': {
      const result = digTile(state, action.tileIndex);
      if (result.dug) counters.tilesDug += 1;
      return result.state;
    }

    case 'museum/donate': {
      const result = donateArtifact(state, museumExhibitCatalogById, action.setId, action.artifactId);
      return result.state;
    }

    case 'achievement/claim':
      // Achievements pay out automatically the instant a counter crosses a
      // tier threshold (evaluateAchievements(), run every tick in
      // main.ts) - there is no separate claim step to perform.
      return state;

    case 'daily/claim':
      // GAP: individual daily tasks have no per-task claim/reward in this
      // simulation - only the completed set pays out via claimDailyChest.
      return state;
    case 'daily/claimStreak': {
      const result = claimDailyChest(state, dailyChestReward.rewardCoins, dailyChestReward.rewardCash);
      return result.state;
    }

    case 'offlineSummary/acknowledge':
      // Handled at the app layer (clears the pending summary shown to the
      // UI); nothing in GameState itself needs to change here.
      return state;

    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}

// GAP: GameAction (ui/src/contracts.ts) has no animal feed/collect action
// and no factory-collect action at all - every other subsystem
// (fields/orders/vehicles/town/mine/zoo) has a way to collect its
// finished output through the action union; animals and factories do not.
// These two helpers exist so the capability is reachable from main.ts's
// own code (e.g. a periodic auto-collect sweep) even though no UI control
// can trigger them yet - report the missing actions to whoever owns
// ui/src/contracts.ts.
export function feedAndCollectAllAnimals(state: GameState, now: number): GameState {
  return collectAll(state, animalCatalogByType, now).state;
}

export function collectAllFactoryProduction(state: GameState, now: number): GameState {
  let next = state;
  for (const factory of state.factories.factories) {
    // Collecting shifts queue indices down (collectProduction splices the
    // slot out), so walk from the end to keep earlier indices stable.
    for (let slotIndex = factory.queue.length - 1; slotIndex >= 0; slotIndex--) {
      const job = factory.queue[slotIndex];
      const recipe = job ? recipeCatalog[job.recipeId] : undefined;
      if (!job || !recipe) continue;
      next = collectProduction(next, factory.id, slotIndex, recipe, now).state;
    }
  }
  return next;
}
