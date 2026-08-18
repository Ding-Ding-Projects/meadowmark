/**
 * Train: 3 outbound wagons wanting goods; returns building materials
 * (planks, bricks, nails, glass, slabs, paint, screws) on a 20-60 minute
 * round trip. Round trip length and reward materials are rolled with the
 * seeded RNG at departure time so they are fully deterministic on replay.
 */

import type { GameEvent, GameState, GoodId, ResourceBag, TrainState, TrainWagon } from "./types";
import type { RngState } from "./rng";
import { nextInt, pickWeighted } from "./rng";
import { hasAll, removeAll } from "./economy";
import { MINUTE_MS, isReady } from "./time";

export const TRAIN_WAGON_COUNT = 3;
export const TRAIN_MIN_ROUND_TRIP_MS = 20 * MINUTE_MS;
export const TRAIN_MAX_ROUND_TRIP_MS = 60 * MINUTE_MS;

export const TRAIN_MATERIALS: GoodId[] = ["planks", "bricks", "nails", "glass", "slabs", "paint", "screws"];

export interface TrainRequestGood {
  goodId: GoodId;
  unlockLevel: number;
}

export function createEmptyTrain(): TrainState {
  const wagons: TrainWagon[] = [];
  for (let i = 0; i < TRAIN_WAGON_COUNT; i++) {
    wagons.push({ id: `wagon-${i}`, requests: [], departedAt: null, returnsAt: null, rewardMaterials: {} });
  }
  return { wagons };
}

export function rollWagonRequests(
  rng: RngState,
  availableGoods: TrainRequestGood[],
  playerLevel: number,
): TrainWagon["requests"] {
  const eligible = availableGoods.filter((g) => g.unlockLevel <= playerLevel);
  const count = nextInt(rng, 1, Math.min(2, Math.max(1, eligible.length)));
  const chosen: TrainRequestGood[] = [];
  const pool = [...eligible];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = nextInt(rng, 0, pool.length - 1);
    const picked = pool[idx];
    if (picked === undefined) {
      // Cannot actually happen: idx is bounded to [0, pool.length - 1] by
      // construction. Skip rather than throw so a broken invariant
      // degrades to fewer wagon requests instead of crashing the tick.
      continue;
    }
    chosen.push(picked);
    pool.splice(idx, 1);
  }
  return chosen.map((g) => ({ goodId: g.goodId, quantityNeeded: nextInt(rng, 3, 12), quantityLoaded: 0 }));
}

/** Loads a good into a wagon's matching request, up to what's needed. Returns how much was actually loaded. */
export function loadWagon(state: GameState, wagonId: string, goodId: GoodId, quantity: number): { state: GameState; loaded: number } {
  const wagon = state.train.wagons.find((w) => w.id === wagonId);
  if (!wagon || wagon.departedAt !== null) return { state, loaded: 0 };
  const request = wagon.requests.find((r) => r.goodId === goodId);
  if (!request) return { state, loaded: 0 };

  const room = request.quantityNeeded - request.quantityLoaded;
  const available = state.inventory[goodId] ?? 0;
  const toLoad = Math.max(0, Math.min(quantity, room, available));
  if (toLoad === 0) return { state, loaded: 0 };

  const wagons = state.train.wagons.map((w) =>
    w.id === wagonId
      ? { ...w, requests: w.requests.map((r) => (r.goodId === goodId ? { ...r, quantityLoaded: r.quantityLoaded + toLoad } : r)) }
      : w,
  );

  return {
    state: { ...state, inventory: removeAll(state.inventory, { [goodId]: toLoad }), train: { wagons } },
    loaded: toLoad,
  };
}

/** Departs a fully-loaded wagon, rolling its round-trip duration and reward materials. */
export function departWagon(
  state: GameState,
  rng: RngState,
  wagonId: string,
  now: number,
): { state: GameState; departed: boolean; reason?: "notFullyLoaded" | "alreadyDeparted" } {
  const wagon = state.train.wagons.find((w) => w.id === wagonId);
  if (!wagon) return { state, departed: false, reason: "notFullyLoaded" };
  if (wagon.departedAt !== null) return { state, departed: false, reason: "alreadyDeparted" };
  const fullyLoaded = wagon.requests.every((r) => r.quantityLoaded >= r.quantityNeeded);
  if (!fullyLoaded) return { state, departed: false, reason: "notFullyLoaded" };

  const roundTripMs = nextInt(rng, TRAIN_MIN_ROUND_TRIP_MS, TRAIN_MAX_ROUND_TRIP_MS);
  const materialCount = nextInt(rng, 2, 4);
  const rewardMaterials: ResourceBag = {};
  for (let i = 0; i < materialCount; i++) {
    const materialId = pickWeighted(rng, TRAIN_MATERIALS, TRAIN_MATERIALS.map((_, idx) => TRAIN_MATERIALS.length - idx));
    rewardMaterials[materialId] = (rewardMaterials[materialId] ?? 0) + nextInt(rng, 2, 8);
  }

  const wagons = state.train.wagons.map((w) =>
    w.id === wagonId ? { ...w, departedAt: now, returnsAt: now + roundTripMs, rewardMaterials } : w,
  );

  return { state: { ...state, train: { wagons } }, departed: true };
}

/** Collects a returned wagon's materials and resets it with a fresh set of requests. */
export function collectWagon(
  state: GameState,
  rng: RngState,
  wagonId: string,
  availableGoods: TrainRequestGood[],
  now: number,
): { state: GameState; collected: boolean; reason?: "notReturned" } {
  const wagon = state.train.wagons.find((w) => w.id === wagonId);
  if (!wagon || wagon.returnsAt === null || !isReady(wagon.returnsAt, now)) {
    return { state, collected: false, reason: "notReturned" };
  }

  let inventory = state.inventory;
  for (const goodId in wagon.rewardMaterials) {
    // rewardMaterials[goodId] always exists here since goodId came from its
    // own keys; the ?? 0 satisfies noUncheckedIndexedAccess's static
    // widening rather than covering a real missing-entry case.
    const amount = wagon.rewardMaterials[goodId] ?? 0;
    inventory = { ...inventory, [goodId]: (inventory[goodId] ?? 0) + amount };
  }

  const freshRequests = rollWagonRequests(rng, availableGoods, state.economy.level);
  const wagons = state.train.wagons.map((w) =>
    w.id === wagonId
      ? { ...w, departedAt: null, returnsAt: null, rewardMaterials: {}, requests: freshRequests }
      : w,
  );

  return { state: { ...state, inventory, train: { wagons } }, collected: true };
}

export function tickTrain(state: GameState, now: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const wagon of state.train.wagons) {
    if (wagon.returnsAt !== null && isReady(wagon.returnsAt, now)) {
      events.push({ type: "trainArrived", wagonId: wagon.id, rewardMaterials: wagon.rewardMaterials, at: wagon.returnsAt });
    }
  }
  // Arrival is surfaced as an event here for the UI/offline summary, but the
  // actual materials transfer happens in collectWagon() (an explicit player
  // or offline-summary action), so the same event never double-applies.
  return { state, events };
}

export function hasAllForWagon(state: GameState, wagonId: string): boolean {
  const wagon = state.train.wagons.find((w) => w.id === wagonId);
  if (!wagon) return false;
  const bag: Record<string, number> = {};
  for (const r of wagon.requests) bag[r.goodId] = (bag[r.goodId] ?? 0) + Math.max(0, r.quantityNeeded - r.quantityLoaded);
  return hasAll(state.inventory, bag);
}
