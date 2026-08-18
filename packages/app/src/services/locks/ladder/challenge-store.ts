/**
 * In-memory, single-use, expiring challenge storage for the unlock
 * ladder.
 *
 * Every challenge (a dim-sum question, an arithmetic batch, a
 * whack-a-mole round) is generated and graded on THIS side, keyed by a
 * random nonce. Grading always CONSUMES the nonce -- deletes it from the
 * map -- BEFORE comparing the caller's answer, so:
 *
 *  - a wrong answer can never be retried against the same question
 *    (the question is gone; the caller must ask for a new one, which
 *    costs another rung-appropriate wrong-answer count), and
 *  - a right answer can never be replayed (the same nonce graded twice
 *    finds nothing the second time).
 *
 * Deliberately in-memory rather than persisted: a challenge is scoped to
 * one live attempt at one rung, expires in seconds, and losing it to an
 * app restart mid-challenge is an entirely reasonable outcome (the user
 * just asks for a new one).
 */

export interface StoredChallenge<TAnswerState> {
  lockId: string;
  createdAt: number;
  expiresAt: number;
  state: TAnswerState;
}

export class ChallengeStore<TAnswerState> {
  private readonly challenges = new Map<string, StoredChallenge<TAnswerState>>();

  /** Stores a fresh challenge and returns its nonce. Also opportunistically
   * sweeps expired entries so the map cannot grow without bound across a
   * long session. */
  put(nonce: string, lockId: string, state: TAnswerState, ttlMs: number, now: number = Date.now()): void {
    this.sweep(now);
    this.challenges.set(nonce, { lockId, createdAt: now, expiresAt: now + ttlMs, state });
  }

  /** Reads a challenge WITHOUT consuming it. Use only for read-only
   * checks (e.g. "has this round's duration elapsed yet?") that must not
   * themselves count as grading. */
  peek(nonce: string, now: number = Date.now()): StoredChallenge<TAnswerState> | undefined {
    const entry = this.challenges.get(nonce);
    if (!entry || entry.expiresAt <= now) {
      return undefined;
    }
    return entry;
  }

  /** Consumes (deletes) a challenge and returns what it held, or
   * `undefined` if it never existed, already expired, or was already
   * consumed. Callers MUST call this before evaluating an answer -- never
   * grade first and consume after, or a losing answer becomes retryable. */
  consume(nonce: string, now: number = Date.now()): StoredChallenge<TAnswerState> | undefined {
    const entry = this.challenges.get(nonce);
    this.challenges.delete(nonce);
    if (!entry || entry.expiresAt <= now) {
      return undefined;
    }
    return entry;
  }

  /** Mutates a live, not-yet-consumed challenge's state in place, WITHOUT
   * consuming it -- used for whack-a-mole's per-mole hit recording, which
   * happens many times during one round, before the round is finally
   * graded (and consumed) once at the end. Returns `false` if the
   * challenge does not exist or has expired, in which case the update
   * function was not called. */
  update(nonce: string, updater: (state: TAnswerState) => void, now: number = Date.now()): boolean {
    const entry = this.challenges.get(nonce);
    if (!entry || entry.expiresAt <= now) {
      return false;
    }
    updater(entry.state);
    return true;
  }

  private sweep(now: number): void {
    for (const [nonce, entry] of this.challenges) {
      if (entry.expiresAt <= now) {
        this.challenges.delete(nonce);
      }
    }
  }
}
