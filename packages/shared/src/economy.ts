/**
 * Core economy: coins, cash (earned only - never purchasable), xp, level,
 * population, energy, and barn capacity helpers. Every function here is
 * pure: it takes a GameState and returns a new one, never mutates in place.
 */

import type { EconomyState, GameEvent, GameState } from "./types.js";
import { MINUTE_MS } from "./time.js";

/** XP required to go from level L to L+1. */
export function xpToNext(level: number): number {
  return Math.round(60 * Math.pow(level, 1.55));
}

/** Coins awarded for reaching a given level. Scales gently so late levels still feel worth it. */
export function levelUpCoinReward(newLevel: number): number {
  return 200 + newLevel * 150;
}

/** Cash awarded for reaching a given level. Flat and earned-only. */
export function levelUpCashReward(_newLevel: number): number {
  return 2;
}

/** Energy regenerates +1 per 2 minutes, capped at energyCap. */
export const ENERGY_REGEN_INTERVAL_MS = 2 * MINUTE_MS;

/**
 * Coin cost to instantly finish any timer with `remainingMs` left.
 * Never zero - even a near-finished timer costs a token 1 cash - and
 * scales at one cash per 5 minutes remaining, rounded up.
 */
export function rushCostCash(remainingMs: number): number {
  return Math.max(1, Math.ceil(remainingMs / (5 * MINUTE_MS)));
}

/**
 * Reconciles energy regeneration up to `now`, based on the anchor stored on
 * the economy. Returns a new EconomyState; does not mutate the input.
 */
export function reconcileEnergy(economy: EconomyState, now: number): EconomyState {
  if (economy.energy >= economy.energyCap) {
    return { ...economy, energyRegenAnchorAt: now };
  }
  const elapsed = Math.max(0, now - economy.energyRegenAnchorAt);
  const ticksElapsed = Math.floor(elapsed / ENERGY_REGEN_INTERVAL_MS);
  if (ticksElapsed <= 0) return economy;

  const gained = ticksElapsed;
  const newEnergy = Math.min(economy.energyCap, economy.energy + gained);
  const consumedMs = ticksElapsed * ENERGY_REGEN_INTERVAL_MS;
  return {
    ...economy,
    energy: newEnergy,
    // Only advance the anchor by whole ticks consumed, so partial progress
    // toward the next tick survives across calls (no drift/loss).
    energyRegenAnchorAt: economy.energyRegenAnchorAt + consumedMs,
  };
}

/** Adds xp to the economy, applying as many level-ups as the xp affords. Returns the new economy plus any levelUp events generated. */
export function addXp(economy: EconomyState, xpGained: number, now: number): { economy: EconomyState; events: GameEvent[] } {
  let xp = economy.xp + xpGained;
  let level = economy.level;
  let coins = economy.coins;
  let cash = economy.cash;
  const events: GameEvent[] = [];

  let need = xpToNext(level);
  while (xp >= need) {
    xp -= need;
    level += 1;
    const rewardCoins = levelUpCoinReward(level);
    const rewardCash = levelUpCashReward(level);
    coins += rewardCoins;
    cash += rewardCash;
    events.push({ type: "levelUp", newLevel: level, rewardCoins, rewardCash, at: now });
    need = xpToNext(level);
  }

  return { economy: { ...economy, xp, level, coins, cash }, events };
}

/** Total number of goods currently held in the barn. */
export function barnUsed(inventory: Record<string, number>): number {
  let total = 0;
  for (const key in inventory) total += inventory[key] ?? 0;
  return total;
}

/** Remaining barn space, never negative. */
export function barnFreeSpace(state: Pick<GameState, "inventory" | "barn">): number {
  return Math.max(0, state.barn.capacity - barnUsed(state.inventory));
}

/** Adds a good to the inventory, mutating a copy. Caller is responsible for checking barn space first when partial-fill semantics matter (see fields.ts/factories.ts). */
export function addGood(inventory: Record<string, number>, goodId: string, quantity: number): Record<string, number> {
  if (quantity === 0) return inventory;
  return { ...inventory, [goodId]: (inventory[goodId] ?? 0) + quantity };
}

/** Removes a good from the inventory, clamping at zero. */
export function removeGood(inventory: Record<string, number>, goodId: string, quantity: number): Record<string, number> {
  if (quantity === 0) return inventory;
  const next = Math.max(0, (inventory[goodId] ?? 0) - quantity);
  return { ...inventory, [goodId]: next };
}

/** True if the inventory holds at least `quantity` of every entry in the bag. */
export function hasAll(inventory: Record<string, number>, bag: Record<string, number>): boolean {
  for (const goodId in bag) {
    // bag[goodId] is always present since goodId came from iterating bag's
    // own keys - the ?? 0 is defensive against noUncheckedIndexedAccess's
    // static widening, not a real "missing entry" case, and 0 is the
    // correct fallback semantics either way (require nothing of it).
    const required = bag[goodId] ?? 0;
    if ((inventory[goodId] ?? 0) < required) return false;
  }
  return true;
}

/** Removes every entry in `bag` from the inventory. Caller must check hasAll() first. */
export function removeAll(inventory: Record<string, number>, bag: Record<string, number>): Record<string, number> {
  let next = inventory;
  for (const goodId in bag) {
    next = removeGood(next, goodId, bag[goodId] ?? 0);
  }
  return next;
}

/** Adds every entry in `bag` to the inventory. The counterpart to removeAll(), used to refund a cancelled/reversed action. */
export function addAll(inventory: Record<string, number>, bag: Record<string, number>): Record<string, number> {
  let next = inventory;
  for (const goodId in bag) {
    next = addGood(next, goodId, bag[goodId] ?? 0);
  }
  return next;
}
