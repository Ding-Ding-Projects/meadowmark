/**
 * Factories: ~22 buildings each with a production queue (2 slots base,
 * upgradeable to 6). Production runs while the app is closed - it is
 * driven entirely by absolute readyAt stamps, so tick() catches queues up
 * correctly no matter how long the app was shut. A full barn PAUSES a
 * queue slot rather than silently discarding its output; the pause reason
 * travels in state so the UI can say so plainly.
 */

import type {
  FactoryInstance,
  FactoryQueueSlot,
  FactoryTypeId,
  GameEvent,
  GameState,
  ResourceBag,
} from "./types";
import { addGood, barnFreeSpace, hasAll, removeAll } from "./economy";
import { isReady } from "./time";

export const FACTORY_BASE_QUEUE_SLOTS = 2;
export const FACTORY_MAX_QUEUE_SLOTS = 6;

export interface RecipeCatalogEntry {
  recipeId: string;
  factoryTypeId: FactoryTypeId;
  inputs: ResourceBag;
  outputGoodId: string;
  outputQuantity: number;
  productionTimeMs: number;
  unlockLevel: number;
  xpReward: number;
  coinReward: number;
}

export function createFactory(id: string, factoryTypeId: FactoryTypeId): FactoryInstance {
  return { id, factoryTypeId, level: 1, queueSlots: FACTORY_BASE_QUEUE_SLOTS, queue: [] };
}

/** Starts a production job in the next free queue slot for the given factory, if inputs are available and there is room in the queue. */
export function startProduction(
  state: GameState,
  factoryId: string,
  recipe: RecipeCatalogEntry,
  now: number,
): { state: GameState; started: boolean; reason?: "queueFull" | "missingInputs" } {
  const factory = state.factories.factories.find((f) => f.id === factoryId);
  if (!factory) return { state, started: false, reason: "queueFull" };
  if (factory.queue.length >= factory.queueSlots) return { state, started: false, reason: "queueFull" };
  if (!hasAll(state.inventory, recipe.inputs)) return { state, started: false, reason: "missingInputs" };

  const newSlot: FactoryQueueSlot = {
    recipeId: recipe.recipeId,
    startedAt: now,
    readyAt: now + recipe.productionTimeMs,
    paused: false,
    pausedAt: null,
  };

  const factories = state.factories.factories.map((f) =>
    f.id === factoryId ? { ...f, queue: [...f.queue, newSlot] } : f,
  );

  return {
    state: {
      ...state,
      inventory: removeAll(state.inventory, recipe.inputs),
      factories: { factories },
    },
    started: true,
  };
}

/** Collects a finished (and not paused) queue slot's output into the barn. */
export function collectProduction(
  state: GameState,
  factoryId: string,
  slotIndex: number,
  recipe: RecipeCatalogEntry,
  now: number,
): { state: GameState; collected: boolean; reason?: "notReady" | "barnFull" } {
  const factory = state.factories.factories.find((f) => f.id === factoryId);
  const slot = factory?.queue[slotIndex];
  if (!factory || !slot || !isReady(slot.readyAt, now)) {
    return { state, collected: false, reason: "notReady" };
  }
  if (barnFreeSpace(state) < recipe.outputQuantity) {
    return { state, collected: false, reason: "barnFull" };
  }

  const factories = state.factories.factories.map((f) =>
    f.id === factoryId ? { ...f, queue: f.queue.filter((_, i) => i !== slotIndex) } : f,
  );

  return {
    state: {
      ...state,
      economy: { ...state.economy, xp: state.economy.xp + recipe.xpReward, coins: state.economy.coins + recipe.coinReward },
      inventory: addGood(state.inventory, recipe.outputGoodId, recipe.outputQuantity),
      factories: { factories },
    },
    collected: true,
  };
}

export interface FactoryUpgradeTier {
  queueSlots: number;
  costCoins: number;
  costMaterials: ResourceBag;
}

export const FACTORY_QUEUE_UPGRADE_TIERS: FactoryUpgradeTier[] = [
  { queueSlots: 3, costCoins: 1500, costMaterials: { planks: 8, nails: 8 } },
  { queueSlots: 4, costCoins: 4000, costMaterials: { bricks: 12, glass: 8 } },
  { queueSlots: 5, costCoins: 9000, costMaterials: { slabs: 16, paint: 10 } },
  { queueSlots: 6, costCoins: 18000, costMaterials: { screws: 20, paint: 16 } },
];

export function upgradeFactoryQueue(state: GameState, factoryId: string): GameState {
  const factory = state.factories.factories.find((f) => f.id === factoryId);
  if (!factory) return state;
  const tier = FACTORY_QUEUE_UPGRADE_TIERS.find((t) => t.queueSlots === factory.queueSlots + 1);
  if (!tier) return state;
  if (state.economy.coins < tier.costCoins || !hasAll(state.inventory, tier.costMaterials)) return state;

  const factories = state.factories.factories.map((f) =>
    f.id === factoryId ? { ...f, queueSlots: tier.queueSlots } : f,
  );

  return {
    ...state,
    economy: { ...state.economy, coins: state.economy.coins - tier.costCoins },
    inventory: removeAll(state.inventory, tier.costMaterials),
    factories: { factories },
  };
}

/**
 * Reconciles every factory queue against `now`: a slot whose output is
 * ready but cannot fit in the barn is marked paused (rather than silently
 * discarded), and a previously paused slot whose room has since freed up
 * is unmarked. Emits events for both transitions and for fresh
 * readiness, so the UI and offline summary share the same source of truth.
 */
export function tickFactories(state: GameState, now: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let barnFree = barnFreeSpace(state);

  const factories = state.factories.factories.map((factory) => {
    const queue = factory.queue.map((slot) => {
      const ready = isReady(slot.readyAt, now);
      if (!ready) return slot;

      if (!slot.paused) {
        events.push({ type: "factoryProductionReady", factoryId: factory.id, recipeId: slot.recipeId, at: slot.readyAt });
      }

      // We don't know the exact output quantity here (that's catalog data
      // owned by the app layer), so pausing logic is conservative: any
      // ready-but-uncollected slot that the barn currently has zero free
      // space for is flagged paused. The app layer's collect call is the
      // real gate that enforces the output-quantity-specific check.
      if (barnFree <= 0) {
        if (!slot.paused) {
          events.push({ type: "factoryQueuePaused", factoryId: factory.id, recipeId: slot.recipeId, reason: "barnFull", at: now });
        }
        return { ...slot, paused: true, pausedAt: slot.pausedAt ?? now };
      }

      if (slot.paused) {
        events.push({ type: "factoryQueueResumed", factoryId: factory.id, recipeId: slot.recipeId, at: now });
        return { ...slot, paused: false, pausedAt: null };
      }

      return slot;
    });
    return { ...factory, queue };
  });

  return { state: { ...state, factories: { factories } }, events };
}

