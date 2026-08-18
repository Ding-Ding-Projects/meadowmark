/**
 * Dailies: 5 rotating tasks seeded from the LOCAL calendar date, so the
 * same day always produces the same tasks (reloading, or two machines on
 * the same save, never gets a different roll for "today"). Completing all
 * five opens a chest; a streak counter tracks consecutive completed days.
 */

import type { DailiesState, DailyTask, GameEvent, GameState } from "./types";
import { createRng, nextInt, seedFromString } from "./rng";
import { localDateKey } from "./time";

export const DAILY_TASK_COUNT = 5;

export interface DailyTaskTemplate {
  targetKind: string;
  describe: (quantity: number, targetId: string | null) => string;
  targetIdPool: string[] | null; // null = no target id needed (e.g. "harvest any 10 crops")
  minQuantity: number;
  maxQuantity: number;
}

/**
 * Generates today's 5 tasks deterministically from the local date string.
 * Two calls with the same dateKey and the same template pool always
 * produce byte-identical tasks.
 */
export function generateDailyTasks(dateKey: string, templates: DailyTaskTemplate[]): DailyTask[] {
  const rng = createRng(seedFromString(`dailies:${dateKey}`));
  const tasks: DailyTask[] = [];
  const pool = [...templates];

  for (let i = 0; i < DAILY_TASK_COUNT && pool.length > 0; i++) {
    const idx = nextInt(rng, 0, pool.length - 1);
    const template = pool[idx];
    if (template === undefined) {
      // Cannot actually happen: idx is constructed above to be within
      // [0, pool.length - 1], so this lookup can never miss. Skip rather
      // than throw so one impossible-in-practice miss degrades to fewer
      // daily tasks instead of crashing the whole tick.
      continue;
    }
    pool.splice(idx, 1);

    let targetId: string | null = null;
    if (template.targetIdPool && template.targetIdPool.length > 0) {
      const pickIndex = nextInt(rng, 0, template.targetIdPool.length - 1);
      // Same reasoning as above: pickIndex is bounded to the pool's own
      // length, so this can't miss either - `?? null` is just the honest
      // fallback if that invariant is ever violated by a future edit.
      targetId = template.targetIdPool[pickIndex] ?? null;
    }
    const targetQuantity = nextInt(rng, template.minQuantity, template.maxQuantity);

    tasks.push({
      id: `daily-${dateKey}-${i}`,
      description: template.describe(targetQuantity, targetId),
      targetKind: template.targetKind,
      targetId,
      targetQuantity,
      progress: 0,
      completed: false,
    });
  }

  return tasks;
}

export function createInitialDailies(now: number, templates: DailyTaskTemplate[]): DailiesState {
  const dateKey = localDateKey(now);
  return {
    dateKey,
    tasks: generateDailyTasks(dateKey, templates),
    chestClaimed: false,
    streak: 0,
    lastCompletedDateKey: null,
  };
}

/**
 * Rolls over to a fresh set of tasks when the local date has changed, tracking whether yesterday's streak survives (all 5 tasks must have been completed and claimed) or resets.
 *
 * Task CONTENT is safe from chunk-size effects: generateDailyTasks() seeds
 * its own local RNG from the date string alone, so "today"'s tasks are the
 * same regardless of how many tick() calls it took to get there, and it
 * never touches the shared world RNG.
 *
 * KNOWN CHUNK-INVARIANCE GAP in the STREAK, though: this only compares
 * `state.dailies.dateKey` (the last day we actually rolled over) against
 * `today`, i.e. one boundary check per call, not once per day actually
 * elapsed. Concretely: if the chest was claimed right before an offline
 * span that crosses more than one calendar day, N * tick(1 day) rolls
 * over once per day - day0->day1 sees chestClaimed=true and increments
 * the streak, then day1->day2 (chestClaimed now false, offline) resets it
 * straight back to 0 - ending at streak=0. A single tick() covering the
 * same span jumps day0 straight to the final day, sees chestClaimed=true
 * from day0, and increments once with no intervening reset - ending at
 * streak=oldStreak+1. Same wall-clock elapsed time, different streak.
 * This is a real player-visible bug, not just an RNG-stream curiosity;
 * fixing it means looping "once per calendar day actually crossed" here
 * too. See village.ts's tickVillage for the RNG-stream-divergence variant
 * of the same root cause.
 */
export function tickDailies(
  state: GameState,
  templates: DailyTaskTemplate[],
  now: number,
): { state: GameState; events: GameEvent[] } {
  const today = localDateKey(now);
  if (state.dailies.dateKey === today) return { state, events: [] };

  const yesterdayCompleted = state.dailies.chestClaimed;
  const streak = yesterdayCompleted ? state.dailies.streak + 1 : 0;

  return {
    state: {
      ...state,
      dailies: {
        dateKey: today,
        tasks: generateDailyTasks(today, templates),
        chestClaimed: false,
        streak,
        lastCompletedDateKey: yesterdayCompleted ? state.dailies.dateKey : state.dailies.lastCompletedDateKey,
      },
    },
    events: [],
  };
}

/** Reports progress toward a task by kind/targetId, marking it completed once the quantity is met. Call this from the app layer whenever a relevant gameplay action occurs (harvest, order fulfilled, etc). */
export function progressDailyTask(
  state: GameState,
  targetKind: string,
  targetId: string | null,
  amount: number,
  now: number,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const tasks = state.dailies.tasks.map((task) => {
    if (task.completed || task.targetKind !== targetKind) return task;
    if (task.targetId !== null && task.targetId !== targetId) return task;
    const progress = Math.min(task.targetQuantity, task.progress + amount);
    const completed = progress >= task.targetQuantity;
    if (completed) events.push({ type: "dailyTaskCompleted", taskId: task.id, at: now });
    return { ...task, progress, completed };
  });

  let chestReadyEvent: GameEvent | null = null;
  const chestReady = tasks.every((t) => t.completed);
  if (chestReady && !state.dailies.chestClaimed) {
    chestReadyEvent = { type: "dailyChestReady", at: now };
  }

  return {
    state: { ...state, dailies: { ...state.dailies, tasks } },
    events: chestReadyEvent ? [...events, chestReadyEvent] : events,
  };
}

export function claimDailyChest(state: GameState, rewardCoins: number, rewardCash: number): { state: GameState; claimed: boolean } {
  const allComplete = state.dailies.tasks.every((t) => t.completed);
  if (!allComplete || state.dailies.chestClaimed) return { state, claimed: false };
  return {
    state: {
      ...state,
      economy: { ...state.economy, coins: state.economy.coins + rewardCoins, cash: state.economy.cash + rewardCash },
      dailies: { ...state.dailies, chestClaimed: true },
    },
    claimed: true,
  };
}
