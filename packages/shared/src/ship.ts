/**
 * Ship: dock unlocks at level 18. 6 crates x 3 distinct goods, 24-hour
 * window. Each crate pays coins+xp individually; filling all six opens a
 * chest with cash, animal cards, and expansion permits.
 */

import type { GameEvent, GameState, GoodId, ShipCrate, ShipState } from "./types";
import type { RngState } from "./rng";
import { nextInt } from "./rng";
import { removeGood } from "./economy";
import { DAY_MS, isReady } from "./time";

export const SHIP_UNLOCK_LEVEL = 18;
export const SHIP_CRATE_COUNT = 6;
export const SHIP_WINDOW_MS = DAY_MS;

export interface ShippableGood {
  goodId: GoodId;
  unlockLevel: number;
  baseValue: number;
}

export function createEmptyShip(): ShipState {
  return { unlocked: false, crates: [], windowStartedAt: null, windowEndsAt: null, chestReady: false };
}

export function maybeUnlockShip(state: GameState): GameState {
  if (state.ship.unlocked || state.economy.level < SHIP_UNLOCK_LEVEL) return state;
  return { ...state, ship: { ...state.ship, unlocked: true } };
}

export function rollShipWindow(
  rng: RngState,
  availableGoods: ShippableGood[],
  playerLevel: number,
  now: number,
): ShipState {
  const eligible = availableGoods.filter((g) => g.unlockLevel <= playerLevel);
  const distinctCount = Math.min(3, eligible.length);
  const pool = [...eligible];
  const distinct: ShippableGood[] = [];
  for (let i = 0; i < distinctCount && pool.length > 0; i++) {
    const idx = nextInt(rng, 0, pool.length - 1);
    distinct.push(pool[idx]);
    pool.splice(idx, 1);
  }

  const crates: ShipCrate[] = [];
  for (let i = 0; i < SHIP_CRATE_COUNT; i++) {
    const good = distinct[i % distinct.length];
    const quantityNeeded = nextInt(rng, 4, 14);
    crates.push({
      id: `crate-${i}`,
      goodId: good.goodId,
      quantityNeeded,
      quantityLoaded: 0,
      rewardCoins: Math.round(good.baseValue * quantityNeeded * 1.3 + playerLevel * 5),
      rewardXp: Math.round(good.baseValue * quantityNeeded * 0.3 + playerLevel * 3),
    });
  }

  return { unlocked: true, crates, windowStartedAt: now, windowEndsAt: now + SHIP_WINDOW_MS, chestReady: false };
}

export function loadCrate(state: GameState, crateId: string, quantity: number): { state: GameState; loaded: number } {
  const crate = state.ship.crates.find((c) => c.id === crateId);
  if (!crate) return { state, loaded: 0 };
  const room = crate.quantityNeeded - crate.quantityLoaded;
  const available = state.inventory[crate.goodId] ?? 0;
  const toLoad = Math.max(0, Math.min(quantity, room, available));
  if (toLoad === 0) return { state, loaded: 0 };

  const crates = state.ship.crates.map((c) => (c.id === crateId ? { ...c, quantityLoaded: c.quantityLoaded + toLoad } : c));

  return { state: { ...state, inventory: removeGood(state.inventory, crate.goodId, toLoad), ship: { ...state.ship, crates } }, loaded: toLoad };
}

/** Collects a fully-loaded crate's coin/xp reward and removes it from the board (it stays empty until the next window rolls). */
export function collectCrate(
  state: GameState,
  crateId: string,
  now: number,
): { state: GameState; collected: boolean; events: GameEvent[]; reason?: "notFull" } {
  const crate = state.ship.crates.find((c) => c.id === crateId);
  if (!crate || crate.quantityLoaded < crate.quantityNeeded) return { state, collected: false, events: [], reason: "notFull" };

  const crates = state.ship.crates.filter((c) => c.id !== crateId);
  const events: GameEvent[] = [];
  let chestReady = state.ship.chestReady;
  if (crates.length === 0 && !chestReady) {
    chestReady = true;
    events.push({ type: "shipChestReady", at: now });
  }

  return {
    state: {
      ...state,
      economy: { ...state.economy, coins: state.economy.coins + crate.rewardCoins, xp: state.economy.xp + crate.rewardXp },
      ship: { ...state.ship, crates, chestReady },
    },
    collected: true,
    events,
  };
}

export interface ShipChestReward {
  cash: number;
  expansionPermits: number;
  animalCards: Record<string, number>;
}

export function openShipChest(state: GameState, reward: ShipChestReward): GameState {
  if (!state.ship.chestReady) return state;
  return {
    ...state,
    economy: { ...state.economy, cash: state.economy.cash + reward.cash },
    expansions: { ...state.expansions, permits: state.expansions.permits + reward.expansionPermits },
    ship: { ...state.ship, chestReady: false },
  };
}

/** Rolls a fresh window if the current one has expired or never started (and the dock is unlocked). */
export function tickShip(
  state: GameState,
  rng: RngState,
  availableGoods: ShippableGood[],
  now: number,
): { state: GameState; events: GameEvent[] } {
  let next = maybeUnlockShip(state);
  if (!next.ship.unlocked) return { state: next, events: [] };

  if (next.ship.windowEndsAt === null || isReady(next.ship.windowEndsAt, now)) {
    const rolled = rollShipWindow(rng, availableGoods, next.economy.level, now);
    next = { ...next, ship: rolled };
  }
  return { state: next, events: [] };
}
