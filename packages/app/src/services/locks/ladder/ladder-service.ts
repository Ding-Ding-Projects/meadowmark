/**
 * LadderService: orchestrates the four-rung unlock ladder on top of a
 * LockoutController and a persisted skip budget.
 *
 * See ladder/types.ts for the five safety rules this whole module exists
 * to uphold. The short version: winning a rung clears the WAIT (via
 * `LockoutController.clearLockoutByLadder`, which is byte-for-byte the
 * same code path as natural lockout expiry), never the credential; it
 * costs one of a hard-capped, persisted, rolling-hour skip budget; and
 * every challenge is generated and graded here, behind a single-use
 * nonce, never trusted from the caller.
 */

import { randomUUID } from 'node:crypto';
import type { LockoutController } from '../lockout-controller';
import { SkipBudget } from './skip-budget';
import { ChallengeStore } from './challenge-store';
import {
  DIM_SUM_CHALLENGE_TTL_MS,
  DIM_SUM_MAX_WRONG,
  gradeDimSumAnswer,
  generateDimSumChallenge,
  type DimSumAnswerState,
  type DimSumChallengeView,
} from './dim-sum-challenge';
import {
  ARITHMETIC_CHALLENGE_TTL_MS,
  gradeArithmeticAnswers,
  generateArithmeticChallenge,
  type ArithmeticAnswerInput,
  type ArithmeticAnswerState,
  type ArithmeticChallengeView,
} from './arithmetic-challenge';
import {
  didWinWhackRound,
  generateWhackRound,
  recordMoleHit as recordMoleHitPure,
  type MoleHitOutcome,
  type WhackAnswerState,
  type WhackRoundView,
} from './whack-a-mole-challenge';
import {
  getStartingRung,
  type LadderAvailability,
  type LadderChallengeResult,
  type LadderRung,
  type LadderStepResult,
} from './types';

interface LadderProgress {
  /** The lockoutUntil this progress belongs to. A new lockout (a
   * different lockoutUntil, whether from a fresh failure streak or a
   * clock that simply moved on) starts the ladder over from
   * `getStartingRung`. */
  lockoutUntil: number;
  rung: LadderRung;
  wrongDishCount: number;
  /** Set once the whack-a-mole rung is lost. Per spec, the ladder is not
   * offered again for the rest of THIS lockout once this is true. */
  finished: boolean;
}

export class LadderService {
  private readonly progress = new Map<string, LadderProgress>();
  private readonly dimSumChallenges = new ChallengeStore<DimSumAnswerState>();
  private readonly arithmeticChallenges = new ChallengeStore<ArithmeticAnswerState>();
  private readonly whackChallenges = new ChallengeStore<WhackAnswerState>();

  constructor(
    private readonly lockoutController: LockoutController,
    private readonly skipBudget: SkipBudget,
  ) {}

  async getAvailability(lockId: string, schoolModeEnabled: boolean): Promise<LadderAvailability> {
    const budgetRemaining = await this.skipBudget.remaining();
    const snapshot = await this.lockoutController.getLockoutSnapshot(lockId);

    if (!snapshot.isLockedOut || snapshot.lockoutUntil === null) {
      return { available: false, reason: 'not-locked-out', rung: 'clock', budgetRemaining };
    }

    const progress = this.getOrResetProgress(lockId, snapshot.lockoutUntil, schoolModeEnabled);

    if (progress.finished) {
      return { available: false, reason: 'lost-this-lockout', rung: 'clock', budgetRemaining };
    }
    if (budgetRemaining <= 0) {
      return { available: false, reason: 'budget-exhausted', rung: 'clock', budgetRemaining: 0 };
    }
    return { available: true, rung: progress.rung, budgetRemaining };
  }

  // ---- rung 1: dim sum ------------------------------------------------

  async startDimSumChallenge(
    lockId: string,
    schoolModeEnabled: boolean,
  ): Promise<LadderChallengeResult<DimSumChallengeView>> {
    const availability = await this.getAvailability(lockId, schoolModeEnabled);
    if (!availability.available || availability.rung !== 'dim-sum') {
      return { ok: false, availability };
    }
    const nonce = randomUUID();
    const { view, answerState } = generateDimSumChallenge(nonce);
    this.dimSumChallenges.put(nonce, lockId, answerState, DIM_SUM_CHALLENGE_TTL_MS);
    return { ok: true, challenge: view };
  }

  async gradeDimSumAnswer(
    lockId: string,
    nonce: string,
    chosenChoiceId: string,
    schoolModeEnabled: boolean,
  ): Promise<LadderStepResult> {
    const entry = this.dimSumChallenges.consume(nonce);
    if (!entry || entry.lockId !== lockId) {
      return { outcome: 'invalid', reason: 'unknown or expired dim-sum challenge' };
    }

    const availability = await this.getAvailability(lockId, schoolModeEnabled);
    if (!availability.available || availability.rung !== 'dim-sum') {
      // The ladder moved on (or was cleared entirely) between issuing and
      // grading this question. The consumed nonce is simply discarded --
      // no credit either way.
      return { outcome: 'invalid', reason: 'the ladder is no longer on the dim-sum rung' };
    }

    if (gradeDimSumAnswer(entry.state, chosenChoiceId)) {
      return this.win(lockId);
    }

    const progress = this.progress.get(lockId) as LadderProgress;
    progress.wrongDishCount += 1;
    if (progress.wrongDishCount >= DIM_SUM_MAX_WRONG) {
      progress.rung = 'arithmetic';
    }
    return { outcome: 'wrong', rung: progress.rung };
  }

  // ---- rung 2: arithmetic ----------------------------------------------

  async startArithmeticChallenge(
    lockId: string,
    schoolModeEnabled: boolean,
  ): Promise<LadderChallengeResult<ArithmeticChallengeView>> {
    const availability = await this.getAvailability(lockId, schoolModeEnabled);
    if (!availability.available || availability.rung !== 'arithmetic') {
      return { ok: false, availability };
    }
    const nonce = randomUUID();
    const { view, answerState } = generateArithmeticChallenge(nonce);
    this.arithmeticChallenges.put(nonce, lockId, answerState, ARITHMETIC_CHALLENGE_TTL_MS);
    return { ok: true, challenge: view };
  }

  async gradeArithmeticAnswers(
    lockId: string,
    nonce: string,
    answers: readonly ArithmeticAnswerInput[],
    schoolModeEnabled: boolean,
  ): Promise<LadderStepResult> {
    const entry = this.arithmeticChallenges.consume(nonce);
    if (!entry || entry.lockId !== lockId) {
      return { outcome: 'invalid', reason: 'unknown or expired arithmetic challenge' };
    }

    const availability = await this.getAvailability(lockId, schoolModeEnabled);
    if (!availability.available || availability.rung !== 'arithmetic') {
      return { outcome: 'invalid', reason: 'the ladder is no longer on the arithmetic rung' };
    }

    if (gradeArithmeticAnswers(entry.state, answers)) {
      return this.win(lockId);
    }

    // A single wrong sum fails the whole batch -- straight to
    // whack-a-mole, no retry of the sums rung.
    const progress = this.progress.get(lockId) as LadderProgress;
    progress.rung = 'whack-a-mole';
    return { outcome: 'wrong', rung: 'whack-a-mole' };
  }

  // ---- rung 3: whack-a-mole ---------------------------------------------

  async startWhackRound(
    lockId: string,
    schoolModeEnabled: boolean,
  ): Promise<LadderChallengeResult<WhackRoundView>> {
    const availability = await this.getAvailability(lockId, schoolModeEnabled);
    if (!availability.available || availability.rung !== 'whack-a-mole') {
      return { ok: false, availability };
    }
    const nonce = randomUUID();
    const { view, answerState } = generateWhackRound(nonce);
    this.whackChallenges.put(nonce, lockId, answerState, view.durationMs + 10_000);
    return { ok: true, challenge: view };
  }

  /**
   * Records one live tap during an active round. Timed and graded purely
   * against the server clock (never a client-supplied timestamp) and
   * against the round's own schedule; a mole can only ever be scored
   * once. Does NOT consume the challenge -- a round is graded once, at
   * `finishWhackRound`, after it has actually run its course.
   */
  recordMoleHit(lockId: string, nonce: string, moleId: string, cellIndex: number): MoleHitOutcome {
    const peeked = this.whackChallenges.peek(nonce);
    if (!peeked || peeked.lockId !== lockId) {
      return 'ignored-unknown-mole';
    }
    const elapsedMs = Date.now() - peeked.createdAt;
    let outcome: MoleHitOutcome = 'ignored-unknown-mole';
    this.whackChallenges.update(nonce, (state) => {
      outcome = recordMoleHitPure(state, moleId, cellIndex, elapsedMs);
    });
    return outcome;
  }

  async finishWhackRound(lockId: string, nonce: string, schoolModeEnabled: boolean): Promise<LadderStepResult> {
    const now = Date.now();
    const peeked = this.whackChallenges.peek(nonce, now);
    if (!peeked || peeked.lockId !== lockId) {
      return { outcome: 'invalid', reason: 'unknown or expired whack-a-mole round' };
    }

    // Reject a submission that arrives before the round's own duration
    // has actually elapsed on the server clock. Deliberately does NOT
    // consume the nonce here, so a client that is simply early (rather
    // than cheating) can call this again once real time has passed.
    if (now < peeked.createdAt + peeked.state.durationMs) {
      return { outcome: 'invalid', reason: 'the round has not finished yet' };
    }

    const entry = this.whackChallenges.consume(nonce, now);
    if (!entry) {
      return { outcome: 'invalid', reason: 'unknown or expired whack-a-mole round' };
    }

    const availability = await this.getAvailability(lockId, schoolModeEnabled);
    if (!availability.available || availability.rung !== 'whack-a-mole') {
      return { outcome: 'invalid', reason: 'the ladder is no longer on the whack-a-mole rung' };
    }

    if (didWinWhackRound(entry.state)) {
      return this.win(lockId);
    }

    // Lost the round: fall to the clock, and the ladder is not offered
    // again for the rest of this lockout.
    const progress = this.progress.get(lockId) as LadderProgress;
    progress.rung = 'clock';
    progress.finished = true;
    return { outcome: 'lost' };
  }

  // ---- shared -------------------------------------------------------------

  private getOrResetProgress(lockId: string, lockoutUntil: number, schoolModeEnabled: boolean): LadderProgress {
    const existing = this.progress.get(lockId);
    if (existing && existing.lockoutUntil === lockoutUntil) {
      return existing;
    }
    const fresh: LadderProgress = {
      lockoutUntil,
      rung: getStartingRung(schoolModeEnabled),
      wrongDishCount: 0,
      finished: false,
    };
    this.progress.set(lockId, fresh);
    return fresh;
  }

  private async win(lockId: string): Promise<LadderStepResult> {
    const spent = await this.skipBudget.trySpend();
    if (!spent) {
      // The budget ran out between issuing this challenge and grading it
      // (e.g. a different lock's ladder was won in the meantime). A
      // correct answer earned here still does not clear the wait --
      // honesty about the budget matters more than a free pass, and the
      // cap only means anything if it holds even in this race.
      return {
        outcome: 'invalid',
        reason: 'the unlock ladder skip budget was exhausted; only waiting clears this lockout now',
      };
    }
    await this.lockoutController.clearLockoutByLadder(lockId);
    const progress = this.progress.get(lockId);
    if (progress) {
      progress.finished = true;
    }
    return { outcome: 'won', clearedWaitAt: Date.now() };
  }
}
