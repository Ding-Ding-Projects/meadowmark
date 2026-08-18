/**
 * Turns every @meadowmark/ui GameAction into a real call against
 * @meadowmark/shared, using the catalogs built in content.ts.
 *
 * @meadowmark/shared now exports cancelProduction() and demolishBuilding()
 * (added alongside this file's own factory/collect, field/unlockPlot,
 * animal/collect, and town/select action handling), so "cancel a factory
 * job" and "demolish a building" are real, refund-aware/undo-aware
 * operations rather than no-ops. A few genuine gaps remain and are called
 * out at their case below: achievements/dailies pay out automatically
 * rather than through an explicit claim, the zoo has no species catalog to
 * collect income against, and the museum and per-shed animal collection
 * have no simulation support at all yet.
 */

import type { GameAction } from '@meadowmark/ui';
import type { GameState } from '@meadowmark/shared';
import {
  cancelProduction,
  claimDailyChest,
  collectAll,
  collectCrate,
  collectProduct,
  collectProduction,
  collectWagon,
  demolishBuilding,
  departWagon,
  digTile,
  fulfillHeliOrder,
  fulfillOrder,
  harvest,
  harvestAll,
  loadCrate,
  loadWagon,
  openHeliChest,
  openShipChest,
  placeBuilding,
  plant,
  plantAll,
  removeGood,
  rerollOrder,
  startProduction,
  unlockNextPlot,
  upgradeBarn,
} from '@meadowmark/shared';
import {
  animalCatalogByType,
  buildingCatalogByType,
  cropCatalog,
  goodsById,
  orderableGoods,
  recipeCatalog,
  trainRequestGoods,
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
    case 'field/unlockPlot':
      return unlockNextPlot(state);

    case 'factory/queue': {
      const recipe = recipeCatalog[action.recipeId];
      if (!recipe) return state;
      return startProduction(state, action.factoryId, recipe, now).state;
    }
    case 'factory/cancel': {
      const factory = state.factories.factories.find((f) => f.id === action.factoryId);
      const slot = factory?.queue[action.slotIndex];
      const recipe = slot ? recipeCatalog[slot.recipeId] : undefined;
      if (!recipe) return state;
      return cancelProduction(state, action.factoryId, action.slotIndex, recipe).state;
    }
    case 'factory/collect': {
      const factory = state.factories.factories.find((f) => f.id === action.factoryId);
      const slot = factory?.queue[action.slotIndex];
      const recipe = slot ? recipeCatalog[slot.recipeId] : undefined;
      if (!recipe) return state;
      const result = collectProduction(state, action.factoryId, action.slotIndex, recipe, now);
      if (result.collected) counters.totalGoodsProduced += 1;
      return result.state;
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

    case 'vehicle/load': {
      if (action.vehicle === 'train') {
        const wagon = state.train.wagons[0];
        if (!wagon) return state;
        return loadWagon(state, wagon.id, action.goodId, action.amount).state;
      }
      if (action.vehicle === 'ship') {
        const crate = state.ship.crates[action.slotIndex];
        if (!crate) return state;
        return loadCrate(state, crate.id, action.amount).state;
      }
      // helicopter: GAP - heli orders are fulfilled atomically from
      // inventory (fulfillHeliOrder), there is no incremental "load"
      // concept, so a load action attempts the full atomic fulfillment.
      const order = state.helicopter.orders[action.slotIndex];
      if (!order) return state;
      return fulfillHeliOrder(state, order.id, now).state;
    }

    case 'vehicle/dispatch': {
      if (action.vehicle === 'train') {
        const wagon = state.train.wagons[0];
        if (!wagon) return state;
        return departWagon(state, rng, wagon.id, now).state;
      }
      // GAP: helicopter and ship have no manual "depart" step in this
      // simulation - the helicopter fulfills atomically and the ship's
      // delivery window rolls automatically inside tick()/tickShip().
      return state;
    }

    case 'vehicle/collect': {
      if (action.vehicle === 'train') {
        const wagon = state.train.wagons[0];
        if (!wagon) return state;
        return collectWagon(state, rng, wagon.id, trainRequestGoods, now).state;
      }
      if (action.vehicle === 'ship') {
        let next = state;
        for (const crate of state.ship.crates) {
          if (crate.quantityLoaded >= crate.quantityNeeded) {
            next = collectCrate(next, crate.id, now).state;
          }
        }
        if (next.ship.chestReady) {
          // GAP: no balance data defines the ship chest's reward - this is
          // a small honest placeholder rather than a real reward table.
          next = openShipChest(next, { cash: 5, expansionPermits: 1, animalCards: {} });
        }
        return next;
      }
      if (state.helicopter.chestReady) {
        // GAP: same as the ship - no balance data for the heli chest reward.
        return openHeliChest(state, { cash: 5, boosterKinds: [], animalCards: {} });
      }
      return state;
    }

    case 'town/place': {
      const catalog = buildingCatalogByType[action.buildingId];
      if (!catalog) return state;
      const result = placeBuilding(state, catalog, { x: action.x, y: action.y }, freshId('building'), now, action.rotation);
      if (result.placed) counters.buildingsPlaced += 1;
      return result.state;
    }
    case 'town/demolish': {
      const result = demolishBuilding(state, buildingCatalogByType, action.instanceId);
      return result.state;
    }
    case 'town/select':
      // Building selection is presentational, not simulation state - it
      // never affects tick()/determinism and has no place in GameState.
      // Handled at the app layer (see main.ts), which tracks the
      // currently-selected instance id alongside `state` and feeds it into
      // mapTown() when building the next GameStateView; nothing here needs
      // to change.
      return state;

    case 'zoo/assign':
      // assignSpeciesToEnclosure() itself needs no catalog, so this one
      // actually works even without a real zoo species catalog.
      return {
        ...state,
        zoo: {
          ...state.zoo,
          enclosures: state.zoo.enclosures.map((e) => (e.id === action.enclosureId ? { ...e, speciesId: action.animalId } : e)),
        },
      };
    case 'zoo/collect':
      // GAP: collectZooIncome() needs a ZooSpeciesCatalogEntry (habitat,
      // family, base income) that balance/ does not ship (no zoo.json).
      return state;

    case 'animal/collect': {
      const shed = state.animals.sheds.find((s) => s.id === action.shedId);
      const catalog = shed ? animalCatalogByType[shed.animalTypeId] : undefined;
      if (!catalog) return state;
      const result = collectProduct(state, action.shedId, action.animalUnitId, catalog, now);
      if (result.collected) counters.totalGoodsProduced += 1;
      return result.state;
    }

    case 'mine/dig': {
      const result = digTile(state, action.tileIndex);
      if (result.dug) counters.tilesDug += 1;
      return result.state;
    }

    case 'museum/donate':
      // GAP: @meadowmark/shared has no museum system at all.
      return state;

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
      // GAP: no balance data defines the daily chest's reward - small
      // honest placeholder values.
      const result = claimDailyChest(state, 200, 1);
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

// 'animal/collect' (above) reaches a single animal unit, matching how
// every other subsystem's per-entity collect action works. There is
// still no per-shed/per-type "collect all" action in GameAction, and -
// more fundamentally - nothing in @meadowmark/shared or this app layer
// ever calls createShed()/addAnimalUnit() for a placed animal building,
// so no shed exists for a player to collect from in the first place, and
// there is no UI panel for the animals subsystem at all yet (contrast
// fields/factories/town, which all have one). That is real, substantial,
// out-of-lane work - a shed-creation path in town.ts's building
// placement and a whole new animals panel - not a mapping gap in this
// adapter, so it is reported here rather than silently built partway.
// This bulk helper remains available for a future periodic auto-collect
// sweep once sheds actually exist.
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
