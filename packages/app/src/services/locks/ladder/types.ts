/**
 * The unlock ladder: shared types.
 *
 * Five rules make the ladder safe rather than merely fun, and every one
 * of them has to survive contact with this module or the ladder becomes
 * a second, weaker password:
 *
 *  1. Winning clears the WAIT, never the CREDENTIAL. No rung mints a
 *     session, sets a flag the credential check reads, or otherwise lets
 *     a caller skip `LockService.attemptUnlock`. See ladder-service.ts's
 *     `won` handling: it calls `LockoutController.clearLockoutByLadder`
 *     and nothing else.
 *  2. It never refunds the attempt budget: clearing a lockout via the
 *     ladder and clearing it via natural expiry go through the exact
 *     same `expireLockout` code path in lockout.ts.
 *  3. It is budgeted: at most MAX_LADDER_SKIPS_PER_HOUR skips in a
 *     rolling hour, tracked globally (skip-budget.ts) and persisted so
 *     restarting the app cannot refill it.
 *  4. It never slows the escalation it skips: `consecutiveLockouts` is
 *     invisible to this whole module -- only lockout.ts ever touches it.
 *  5. Every challenge is generated and graded on the trusted (main
 *     process) side against a single-use nonce, consumed before grading
 *     (challenge-store.ts).
 */

export type LadderRung = 'dim-sum' | 'arithmetic' | 'whack-a-mole' | 'clock';

/**
 * The single source of truth for which rung a fresh ladder attempt
 * starts on. School mode requires every dim-sum capability to behave as
 * though it is not installed -- and the dim-sum rung IS a dim-sum
 * capability -- so under School mode it is ABSENT, not skipped with a
 * message that names it (which would itself reveal the hidden feature).
 * Every caller MUST go through this function rather than deciding
 * locally; that is the whole point of it existing.
 */
export function getStartingRung(schoolModeEnabled: boolean): LadderRung {
  return schoolModeEnabled ? 'arithmetic' : 'dim-sum';
}

/** Why the ladder is not being offered right now. */
export type LadderUnavailableReason =
  | 'not-locked-out'
  | 'budget-exhausted'
  | 'lost-this-lockout';

export interface LadderAvailability {
  available: boolean;
  reason?: LadderUnavailableReason;
  rung: LadderRung;
  /** How many of the current rolling hour's skips remain. Always 0 when
   * `reason === 'budget-exhausted'`. */
  budgetRemaining: number;
}

/** Outcome of grading one rung's answer(s). `wrong.rung` is the rung the
 * ladder is on AFTER this result -- the same rung (ask another dim-sum
 * question) or the next one (escalated past the wrong-answer cap). */
export type LadderStepResult =
  | { outcome: 'won'; clearedWaitAt: number }
  | { outcome: 'wrong'; rung: LadderRung }
  | { outcome: 'lost' }
  | { outcome: 'invalid'; reason: string };

/** Result of asking for a fresh challenge on a given rung: either the
 * challenge, or -- if the ladder is not actually available/on that rung
 * right now -- why not. */
export type LadderChallengeResult<TView> =
  | { ok: true; challenge: TView }
  | { ok: false; availability: LadderAvailability };
