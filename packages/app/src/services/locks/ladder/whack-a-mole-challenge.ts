/**
 * Ladder rung 3: one round of whack-a-mole.
 *
 * The full schedule (which mole appears in which cell, and when) is
 * generated here, on the trusted side, and handed to the caller so the
 * UI can render it -- there is nothing secret about a mole's appearance
 * time, only about whether a given hit actually counts. Two rules make a
 * "hit" mean something rather than "send enough taps":
 *
 *  - Each mole can be graded ONCE. A second hit on a mole that already
 *    scored is silently ignored, not double-counted.
 *  - A hit only counts if it lands on the RIGHT cell while that
 *    specific mole is genuinely visible there, judged against SERVER
 *    elapsed time (createdAt tracked by the challenge store, never a
 *    client-supplied timestamp).
 *
 * Separately, ladder-service.ts is responsible for rejecting the FINAL
 * "grade me" call if it arrives before the round's own duration has
 * actually elapsed on the server clock -- that is what stops a script
 * from requesting a round and claiming a perfect score instantly.
 */

import { randomInt, randomUUID } from 'node:crypto';

export const WHACK_CELL_COUNT = 9;
export const WHACK_ROUND_DURATION_MS = 15_000;
export const WHACK_MOLE_COUNT = 12;
export const WHACK_VISIBLE_MS = 1_000;
/** Hits needed out of WHACK_MOLE_COUNT to pass the round. */
export const WHACK_PASS_COUNT = 8;

export interface MoleScheduleEntry {
  moleId: string;
  cellIndex: number;
  /** Both relative to the round's own createdAt, in ms. */
  appearsAtMs: number;
  hidesAtMs: number;
}

export interface WhackRoundView {
  nonce: string;
  cellCount: number;
  durationMs: number;
  schedule: MoleScheduleEntry[];
  expiresAt: number;
}

export interface WhackAnswerState {
  schedule: MoleScheduleEntry[];
  durationMs: number;
  /** Moles that have already scored a valid hit; a mole can appear here
   * at most once, ever, for this round. */
  hitMoleIds: Set<string>;
}

export function generateWhackRound(nonce: string, now: number = Date.now()): {
  view: WhackRoundView;
  answerState: WhackAnswerState;
} {
  const slotMs = WHACK_ROUND_DURATION_MS / WHACK_MOLE_COUNT;
  const jitterRange = Math.max(0, slotMs - WHACK_VISIBLE_MS);
  const schedule: MoleScheduleEntry[] = [];

  for (let i = 0; i < WHACK_MOLE_COUNT; i += 1) {
    const slotStart = i * slotMs;
    const jitter = jitterRange > 0 ? randomInt(jitterRange) : 0;
    const appearsAtMs = Math.round(slotStart + jitter);
    const hidesAtMs = Math.min(appearsAtMs + WHACK_VISIBLE_MS, WHACK_ROUND_DURATION_MS);
    schedule.push({ moleId: randomUUID(), cellIndex: randomInt(WHACK_CELL_COUNT), appearsAtMs, hidesAtMs });
  }

  return {
    view: {
      nonce,
      cellCount: WHACK_CELL_COUNT,
      durationMs: WHACK_ROUND_DURATION_MS,
      schedule,
      // A little grace beyond the round's own duration so a slow client
      // still has time to deliver the final "grade me" call.
      expiresAt: now + WHACK_ROUND_DURATION_MS + 10_000,
    },
    answerState: { schedule, durationMs: WHACK_ROUND_DURATION_MS, hitMoleIds: new Set() },
  };
}

export type MoleHitOutcome = 'scored' | 'ignored-unknown-mole' | 'ignored-wrong-cell' | 'ignored-not-visible' | 'ignored-already-scored';

/**
 * Records one live hit attempt. `elapsedMs` MUST be computed by the
 * caller as `serverNow - challengeCreatedAt`, never taken from anything
 * the client sends -- see the module doc comment.
 */
export function recordMoleHit(
  state: WhackAnswerState,
  moleId: string,
  cellIndex: number,
  elapsedMs: number,
): MoleHitOutcome {
  const entry = state.schedule.find((e) => e.moleId === moleId);
  if (!entry) {
    return 'ignored-unknown-mole';
  }
  if (state.hitMoleIds.has(moleId)) {
    return 'ignored-already-scored';
  }
  if (entry.cellIndex !== cellIndex) {
    return 'ignored-wrong-cell';
  }
  if (elapsedMs < entry.appearsAtMs || elapsedMs > entry.hidesAtMs) {
    return 'ignored-not-visible';
  }
  state.hitMoleIds.add(moleId);
  return 'scored';
}

/** Whether the round has been played enough to pass, purely by hit
 * count. Does NOT check timing -- that is ladder-service.ts's job,
 * against the challenge store's own createdAt, before this is called. */
export function didWinWhackRound(state: WhackAnswerState): boolean {
  return state.hitMoleIds.size >= WHACK_PASS_COUNT;
}
