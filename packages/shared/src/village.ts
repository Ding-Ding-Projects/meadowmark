/**
 * Village: the co-op, and it is ENTIRELY LOCAL. Named offline villagers
 * post requests and "help" with tasks, plus a weekly local regatta with a
 * task list and score bar. This module makes NO network calls of any
 * kind - it is a single-player simulation of a co-op, not a co-op. The
 * honest user-facing copy below is surfaced verbatim by the UI wherever
 * the village screen is shown, so nobody mistakes it for a live service.
 */

import type { GameEvent, GameState, RegattaState, RegattaTask, Villager, VillageState, VillagerRequest } from "./types";
import type { RngState } from "./rng";
import { createRng, nextInt, pick, scopedRng, seedFromString } from "./rng";
import { HOUR_MS, MAX_OFFLINE_MS, boundariesElapsed, localWeekKey, isReady } from "./time";

export const LOCAL_ONLY_NOTICE =
  "This village is entirely local. The villagers here are offline characters built into the game, not other players - " +
  "nothing about this screen is sent anywhere, and no data about you or your farm ever leaves this device.";

const VILLAGER_NAMES = [
  "Adaeze", "Bram", "Chidi", "Delphine", "Esben", "Farah", "Greta", "Haruto",
  "Imani", "Jonas", "Kavi", "Lucienne", "Mateo", "Noor", "Otis", "Petra",
];

export function createVillagers(): Villager[] {
  return VILLAGER_NAMES.map((name, i) => ({ id: `villager-${i}`, name }));
}

export interface RegattaTaskTemplate {
  description: string;
  targetKind: string;
  minQuantity: number;
  maxQuantity: number;
  scoreValue: number;
}

export function rollRegatta(weekKey: string, templates: RegattaTaskTemplate[], scoreBarCap: number): RegattaState {
  const rng = createRng(seedFromString(`regatta:${weekKey}`));
  const tasks: RegattaTask[] = templates.map((template, i) => {
    const targetQuantity = nextInt(rng, template.minQuantity, template.maxQuantity);
    return {
      id: `regatta-${weekKey}-${i}`,
      description: template.description,
      targetKind: template.targetKind,
      targetQuantity,
      progress: 0,
      scoreValue: template.scoreValue,
    };
  });
  return { weekKey, tasks, score: 0, scoreBarCap, chestClaimed: false };
}

export function createInitialVillage(now: number, templates: RegattaTaskTemplate[], scoreBarCap: number): VillageState {
  return {
    villagers: createVillagers(),
    requests: [],
    regatta: rollRegatta(localWeekKey(now), templates, scoreBarCap),
    localOnlyNotice: LOCAL_ONLY_NOTICE,
    lastTopUpAt: now,
  };
}

export const VILLAGER_REQUEST_EXPIRY_MS = 6 * HOUR_MS;

/** Top-ups happen at most once per VILLAGER_REQUEST_EXPIRY_MS boundary, so the catch-up cap is the offline clamp expressed in that interval. */
export const VILLAGE_TOPUP_MAX_CATCHUP_BOUNDARIES = Math.floor(MAX_OFFLINE_MS / VILLAGER_REQUEST_EXPIRY_MS);

export function rollVillagerRequest(
  rng: RngState,
  villagers: Villager[],
  goodPool: { goodId: string; unlockLevel: number; baseValue: number }[],
  playerLevel: number,
  now: number,
): VillagerRequest | null {
  const eligible = goodPool.filter((g) => g.unlockLevel <= playerLevel);
  if (eligible.length === 0 || villagers.length === 0) return null;
  const villager = pick(rng, villagers);
  const good = pick(rng, eligible);
  const quantity = nextInt(rng, 1, 5);
  return {
    id: `request-${villager.id}-${now}`,
    villagerId: villager.id,
    goodId: good.goodId,
    quantity,
    rewardCoins: Math.round(good.baseValue * quantity * 1.2 + playerLevel * 2),
    fulfilled: false,
    expiresAt: now + VILLAGER_REQUEST_EXPIRY_MS,
  };
}

/**
 * Expires anything due by `atTime` and tops back up to 3 open requests,
 * rolling from a fresh RNG scoped to `atTime` (scopedRng(), NOT the
 * shared world RNG - see rng.ts for why: this boundary loop shares
 * tick() with mine.ts's regeneration and ship.ts's window reroll, and a
 * shared linear stream would make a round's content depend on how many
 * draws THOSE subsystems happened to consume first, which depends on how
 * the elapsed time was chunked into tick() calls). This is only ever
 * called at a specific boundary instant (see tickVillage below) - never
 * with a moving "now" mid-loop - so the same sequence of boundaries
 * always produces the same sequence of rolls.
 */
function expireAndTopUp(
  requests: VillagerRequest[],
  atTime: number,
  villagers: Villager[],
  goodPool: { goodId: string; unlockLevel: number; baseValue: number }[],
  playerLevel: number,
): VillagerRequest[] {
  const rng = scopedRng("village", atTime);
  let next = requests.filter((r) => !isReady(r.expiresAt, atTime));
  const maxOpenRequests = 3;
  while (next.length < maxOpenRequests) {
    const request = rollVillagerRequest(rng, villagers, goodPool, playerLevel, atTime);
    if (!request) break;
    next = [...next, request];
  }
  return next;
}

/**
 * Tops up to 3 open villager requests, at most once per
 * VILLAGER_REQUEST_EXPIRY_MS (6h) boundary actually crossed since the
 * last call - the boundary-crossing catch-up loop, same shape as
 * mine.ts's tickMine and ship.ts's tickShip. Fulfilled requests are
 * dropped every call regardless of boundaries, since "fulfilled" is a
 * player-set flag rather than time-based and removing them can never
 * diverge based on chunking.
 *
 * Each processed boundary calls expireAndTopUp() exactly once, anchored
 * at that boundary's own timestamp (not `now`), so the newly-rolled
 * requests in a batch all expire together at the NEXT boundary - which is
 * exactly when the next iteration (or the next tick() call, once enough
 * real time has passed) processes them. That alignment is what makes
 * tick(24h) once and 1440x tick(1min) draw identical RNG values in
 * identical order: both call expireAndTopUp() the same number of times,
 * for the same boundary timestamps, regardless of how the elapsed time
 * was chunked into tick() calls.
 *
 * Capped at VILLAGE_TOPUP_MAX_CATCHUP_BOUNDARIES (matching the 30-day
 * offline clamp): a save opened after a year processes at most that many
 * top-up rounds, then forfeits the rest and does one final round anchored
 * at `now`, jumping the cursor forward so they're never replayed. A clock
 * that moves backward (or hasn't crossed a boundary yet) does nothing;
 * the cursor is never rewound.
 */
export function tickVillage(
  state: GameState,
  goodPool: { goodId: string; unlockLevel: number; baseValue: number }[],
  templates: RegattaTaskTemplate[],
  scoreBarCap: number,
  now: number,
): { state: GameState; events: GameEvent[] } {
  // Fulfilled requests can be dropped immediately regardless of chunking -
  // "fulfilled" is set only by a player action, not derived from `now`.
  let requests = state.village.requests.filter((r) => !r.fulfilled);

  const cursor0 = state.village.lastTopUpAt;
  let cursor = cursor0;
  if (now > cursor0) {
    const { boundariesToProcess, forfeited } = boundariesElapsed(
      cursor0,
      now,
      VILLAGER_REQUEST_EXPIRY_MS,
      VILLAGE_TOPUP_MAX_CATCHUP_BOUNDARIES,
    );
    for (let i = 0; i < boundariesToProcess; i++) {
      cursor += VILLAGER_REQUEST_EXPIRY_MS;
      requests = expireAndTopUp(requests, cursor, state.village.villagers, goodPool, state.economy.level);
    }
    if (forfeited > 0) {
      requests = expireAndTopUp(requests, now, state.village.villagers, goodPool, state.economy.level);
      cursor = now;
    }
  }
  // else: clock moved backward or no boundary has elapsed yet - never
  // rewind the cursor, just leave requests as they are.

  const currentWeek = localWeekKey(now);
  let regatta = state.village.regatta;
  if (regatta.weekKey !== currentWeek) {
    regatta = rollRegatta(currentWeek, templates, scoreBarCap);
  }

  return {
    state: { ...state, village: { ...state.village, requests, regatta, lastTopUpAt: cursor } },
    events: [],
  };
}

export function fulfillVillagerRequest(
  state: GameState,
  requestId: string,
): { state: GameState; fulfilled: boolean; reason?: "missingGoods" | "notFound" } {
  const request = state.village.requests.find((r) => r.id === requestId);
  if (!request) return { state, fulfilled: false, reason: "notFound" };
  const held = state.inventory[request.goodId] ?? 0;
  if (held < request.quantity) return { state, fulfilled: false, reason: "missingGoods" };

  const requests = state.village.requests.map((r) => (r.id === requestId ? { ...r, fulfilled: true } : r));

  return {
    state: {
      ...state,
      inventory: { ...state.inventory, [request.goodId]: held - request.quantity },
      economy: { ...state.economy, coins: state.economy.coins + request.rewardCoins },
      village: { ...state.village, requests },
    },
    fulfilled: true,
  };
}

export function progressRegattaTask(state: GameState, targetKind: string, amount: number): GameState {
  let scoreDelta = 0;
  const tasks = state.village.regatta.tasks.map((task) => {
    if (task.targetKind !== targetKind || task.progress >= task.targetQuantity) return task;
    const progress = Math.min(task.targetQuantity, task.progress + amount);
    if (progress >= task.targetQuantity && task.progress < task.targetQuantity) {
      scoreDelta += task.scoreValue;
    }
    return { ...task, progress };
  });

  return {
    ...state,
    village: {
      ...state.village,
      regatta: {
        ...state.village.regatta,
        tasks,
        score: Math.min(state.village.regatta.scoreBarCap, state.village.regatta.score + scoreDelta),
      },
    },
  };
}

export function claimRegattaChest(state: GameState, rewardCoins: number, rewardCash: number): { state: GameState; claimed: boolean } {
  if (state.village.regatta.score < state.village.regatta.scoreBarCap || state.village.regatta.chestClaimed) {
    return { state, claimed: false };
  }
  return {
    state: {
      ...state,
      economy: { ...state.economy, coins: state.economy.coins + rewardCoins, cash: state.economy.cash + rewardCash },
      village: { ...state.village, regatta: { ...state.village.regatta, chestClaimed: true } },
    },
    claimed: true,
  };
}
