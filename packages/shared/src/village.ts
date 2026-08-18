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
import { createRng, nextInt, pick, seedFromString } from "./rng";
import { HOUR_MS, localWeekKey, isReady } from "./time";

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
  };
}

export const VILLAGER_REQUEST_EXPIRY_MS = 6 * HOUR_MS;

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

/** Removes expired requests and rolls a fresh one if fewer than 3 are currently open. */
export function tickVillage(
  state: GameState,
  rng: RngState,
  goodPool: { goodId: string; unlockLevel: number; baseValue: number }[],
  templates: RegattaTaskTemplate[],
  scoreBarCap: number,
  now: number,
): { state: GameState; events: GameEvent[] } {
  let requests = state.village.requests.filter((r) => !r.fulfilled && !isReady(r.expiresAt, now));

  const maxOpenRequests = 3;
  while (requests.length < maxOpenRequests) {
    const request = rollVillagerRequest(rng, state.village.villagers, goodPool, state.economy.level, now);
    if (!request) break;
    requests = [...requests, request];
  }

  const currentWeek = localWeekKey(now);
  let regatta = state.village.regatta;
  if (regatta.weekKey !== currentWeek) {
    regatta = rollRegatta(currentWeek, templates, scoreBarCap);
  }

  return { state: { ...state, village: { ...state.village, requests, regatta } }, events: [] };
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
