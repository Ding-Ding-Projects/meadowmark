/**
 * Dailies: 5 rotating tasks seeded from the LOCAL calendar date, so the
 * same day always produces the same tasks (reloading, or two machines on
 * the same save, never gets a different roll for "today"). Completing all
 * five opens a chest; a streak counter tracks consecutive completed days.
 */

import type { DailiesState, DailyTask, GameEvent, GameState } from "./types.js";
import { createRng, nextInt, seedFromString } from "./rng.js";
import { DAY_MS, MAX_OFFLINE_MS, localDateKey, nextLocalDayBoundary } from "./time.js";

export const DAILY_TASK_COUNT = 5;

/** Rollover is daily, so the catch-up cap is just the offline clamp expressed in days (30). */
export const DAILY_MAX_CATCHUP_BOUNDARIES = Math.floor(MAX_OFFLINE_MS / DAY_MS);

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
    lastBoundaryAt: now,
  };
}

/**
 * Rolls over to a fresh set of tasks for every local-calendar-day boundary
 * actually crossed since `lastBoundaryAt`, evaluating and updating the
 * streak once per day - never collapsing a multi-day gap into a single
 * transition.
 *
 * Task CONTENT was already safe from chunk-size effects before this fix:
 * generateDailyTasks() seeds its own local RNG from the date string alone,
 * so "today"'s tasks are the same regardless of how many tick() calls it
 * took to get there, and it never touches the shared world RNG.
 *
 * The STREAK needed the fix, though, and this is the one place in the
 * package where the correct behaviour was already what fine-grained
 * ticking produced - N * tick(1 day) rolls over once per day, so an
 * offline span with no player action correctly resets the streak to 0 on
 * the first day nobody was there to claim the chest. Iterating day by day
 * here (rather than jumping `dateKey` straight to today in one step)
 * makes a single big tick() reach that same correct answer, matching the
 * chunked behaviour rather than the other way round.
 *
 * Capped at DAILY_MAX_CATCHUP_BOUNDARIES (30, matching the offline
 * clamp): a save opened after a year evaluates the streak through at most
 * 30 days, then forfeits the rest and jumps straight to today - the
 * streak has already reached 0 well before the cap in any realistic
 * offline-without-claiming scenario, so the forfeited days cannot change
 * the outcome. A clock that moves backward (or hasn't crossed a day
 * boundary yet) does nothing; the cursor is never rewound.
 */
export function tickDailies(
  state: GameState,
  templates: DailyTaskTemplate[],
  now: number,
): { state: GameState; events: GameEvent[] } {
  const cursor0 = state.dailies.lastBoundaryAt;
  if (now <= cursor0) return { state, events: [] };

  let dateKey = state.dailies.dateKey;
  let tasks = state.dailies.tasks;
  let chestClaimed = state.dailies.chestClaimed;
  let streak = state.dailies.streak;
  let lastCompletedDateKey = state.dailies.lastCompletedDateKey;
  let cursor = cursor0;
  let processed = 0;

  const rollOverOneDay = (boundary: number) => {
    const yesterdayCompleted = chestClaimed;
    streak = yesterdayCompleted ? streak + 1 : 0;
    lastCompletedDateKey = yesterdayCompleted ? dateKey : lastCompletedDateKey;
    dateKey = localDateKey(boundary);
    tasks = generateDailyTasks(dateKey, templates);
    chestClaimed = false;
  };

  while (processed < DAILY_MAX_CATCHUP_BOUNDARIES) {
    const boundary = nextLocalDayBoundary(cursor);
    if (boundary > now) break;
    rollOverOneDay(boundary);
    cursor = boundary;
    processed += 1;
  }

  if (nextLocalDayBoundary(cursor) <= now) {
    // Cap hit with more days still pending: forfeit them deliberately
    // (documented, matches MAX_OFFLINE_MS elsewhere). By this point the
    // streak has already been evaluated (and almost certainly reset to 0,
    // since nothing offline can re-claim the chest) at least
    // DAILY_MAX_CATCHUP_BOUNDARIES times, so one more rollover to "today"
    // is enough - no further days need individual evaluation.
    rollOverOneDay(now);
    cursor = now;
  }

  return {
    state: {
      ...state,
      dailies: { dateKey, tasks, chestClaimed, streak, lastCompletedDateKey, lastBoundaryAt: cursor },
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
