/**
 * The narrow view of a lock's lockout state that the unlock ladder is
 * allowed to see and act on.
 *
 * This is the ONLY seam between "toy locks" (lock-service.ts) and "the
 * unlock ladder" (ladder/ladder-service.ts). Deliberately tiny: the
 * ladder can find out whether a lock is currently locked out, and it can
 * clear that lockout exactly the way natural time expiry would -- and
 * nothing else. It cannot read or verify a credential, cannot see
 * attempt counts, and cannot touch the escalation counter. That is what
 * keeps "winning the ladder" from ever becoming a second, weaker
 * password.
 */

export interface LockoutSnapshot {
  isLockedOut: boolean;
  /** Epoch ms the current lockout ends, or null when not locked out. A
   * change in this value (for the same lock) between two calls is how the
   * ladder recognizes "this is a new lockout, start the ladder over" --
   * it never trusts wall-clock time alone for that, since a lockout could
   * naturally expire and a fresh one begin within the same poll window. */
  lockoutUntil: number | null;
}

export interface LockoutController {
  getLockoutSnapshot(lockId: string): Promise<LockoutSnapshot>;
  /**
   * Ends the current lockout for `lockId` exactly as if its timer had
   * naturally run out: grants a fresh attempt budget, leaves the
   * consecutive-lockout escalation counter untouched, mints no session,
   * and verifies no credential. A no-op if the lock is not currently
   * locked out (e.g. it expired or was cleared a moment earlier).
   */
  clearLockoutByLadder(lockId: string): Promise<void>;
}
