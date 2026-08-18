/**
 * Ship: dock unlocks at level 18. 6 crates x 3 distinct goods, 24-hour
 * window. Each crate pays coins+xp individually; filling all six opens a
 * chest with cash, animal cards, and expansion permits.
 */

import type { GameEvent, GameState, GoodId, ShipCrate, ShipState } from "./types";
import type { RngState } from "./rng";
import { nextInt, scopedRng } from "./rng";
import { addXp, removeGood } from "./economy";
import { DAY_MS, MAX_OFFLINE_MS } from "./time";

export const SHIP_UNLOCK_LEVEL = 18;
export const SHIP_CRATE_COUNT = 6;
export const SHIP_WINDOW_MS = DAY_MS;

/** Windows are fixed 24h intervals, so the catch-up cap is just the offline clamp expressed in windows (30). */
export const SHIP_MAX_CATCHUP_BOUNDARIES = Math.floor(MAX_OFFLINE_MS / SHIP_WINDOW_MS);

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
    const picked = pool[idx];
    if (picked === undefined) {
      // Cannot actually happen: idx is bounded to [0, pool.length - 1] by
      // construction. Skip rather than throw so a future edit that somehow
      // broke that invariant degrades to fewer distinct goods, not a crash.
      continue;
    }
    distinct.push(picked);
    pool.splice(idx, 1);
  }

  // If the player is too low-level (or the content pool is misconfigured)
  // to have any shippable good at all, roll an empty window rather than
  // dividing by a zero-length `distinct` array below - the dock just has
  // nothing to offer this cycle, which is a real, handleable state rather
  // than an invariant violation.
  if (distinct.length === 0) {
    return { unlocked: true, crates: [], windowStartedAt: now, windowEndsAt: now + SHIP_WINDOW_MS, chestReady: false };
  }

  const crates: ShipCrate[] = [];
  for (let i = 0; i < SHIP_CRATE_COUNT; i++) {
    const good = distinct[i % distinct.length];
    if (good === undefined) {
      // Cannot actually happen: i % distinct.length is always within
      // [0, distinct.length - 1], and distinct.length > 0 was just checked.
      continue;
    }
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
  const xpResult = addXp(state.economy, crate.rewardXp, now);
  const events: GameEvent[] = [...xpResult.events];
  let chestReady = state.ship.chestReady;
  if (crates.length === 0 && !chestReady) {
    chestReady = true;
    events.push({ type: "shipChestReady", at: now });
  }

  return {
    state: {
      ...state,
      economy: { ...xpResult.economy, coins: xpResult.economy.coins + crate.rewardCoins },
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

/**
 * Rolls a fresh window for every 24h boundary actually crossed since the
 * last one, up to SHIP_MAX_CATCHUP_BOUNDARIES (and rolls the very first
 * window, anchored at `now`, the moment the dock unlocks).
 *
 * `ship.windowEndsAt` doubles as the boundary cursor here - no separate
 * field needed. Each window is rolled from a fresh RNG scoped to its own
 * boundary timestamp (scopedRng(), NOT the shared world RNG - see rng.ts
 * for why: this loop's iteration count varies with elapsed time, and it
 * shares tick() with mine.ts's regeneration and village.ts's request
 * top-up, so drawing from one linear stream would make a window's
 * content depend on how many draws those OTHER subsystems happened to
 * consume first - which itself depends on how the elapsed time was
 * chunked into tick() calls). With scoped RNGs, tick(30 days) once and
 * tick(1 day) applied 30 times roll the exact same 30 windows in the
 * exact same order, full stop.
 *
 * If the elapsed span would cross more windows than the cap allows (a
 * save opened after a year, or a forward clock jump), the remaining
 * windows are deliberately forfeited - one final window is rolled
 * anchored at `now` instead, and the player simply sees "today's" window
 * rather than a year of replayed history.
 */
export function tickShip(
  state: GameState,
  availableGoods: ShippableGood[],
  now: number,
): { state: GameState; events: GameEvent[] } {
  let next = maybeUnlockShip(state);
  if (!next.ship.unlocked) return { state: next, events: [] };

  if (next.ship.windowEndsAt === null) {
    // First window since unlocking - nothing to catch up on yet.
    next = { ...next, ship: rollShipWindow(scopedRng("ship", now), availableGoods, next.economy.level, now) };
    return { state: next, events: [] };
  }

  let ship = next.ship;
  let processed = 0;
  while (processed < SHIP_MAX_CATCHUP_BOUNDARIES && ship.windowEndsAt !== null && ship.windowEndsAt <= now) {
    const boundary = ship.windowEndsAt;
    ship = rollShipWindow(scopedRng("ship", boundary), availableGoods, next.economy.level, boundary);
    processed += 1;
  }

  if (ship.windowEndsAt !== null && ship.windowEndsAt <= now) {
    // Cap hit with more windows still pending: forfeit them (documented,
    // matches MAX_OFFLINE_MS) and roll one final window anchored at `now`
    // so the cursor doesn't trail forever.
    ship = rollShipWindow(scopedRng("ship", now), availableGoods, next.economy.level, now);
  }

  return { state: { ...next, ship }, events: [] };
}
