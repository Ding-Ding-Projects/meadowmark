/**
 * Consecutive-failure lockout state machine, shared by every toy lock.
 *
 * Pure functions over `LockoutState` (see types.ts) so the whole thing is
 * trivially testable and so lock-service.ts and the unlock ladder can both
 * reason about it without duplicating the rules.
 *
 * Two invariants the unlock ladder depends on and must never violate:
 *
 *  - `expireLockout` is called BOTH when time naturally elapses AND when
 *    the ladder is won. The two paths must be indistinguishable in their
 *    effect on this state, or the ladder would be a second, weaker
 *    password: it grants exactly the fresh attempt budget natural expiry
 *    would have granted, no more.
 *  - `expireLockout` never touches `consecutiveLockouts`. That field only
 *    resets on an ACTUAL successful credential unlock
 *    (`recordSuccessfulUnlock`). Skipping the wait via the ladder must
 *    never shorten how long the NEXT lockout will be.
 */

import type { LockoutState } from './types';

/** Wrong attempts allowed before a lockout begins. */
export const ATTEMPTS_BEFORE_LOCKOUT = 5;

const BASE_LOCKOUT_MS = 30_000; // 30s
const MAX_LOCKOUT_MS = 30 * 60_000; // 30 min cap

export function initialLockoutState(): LockoutState {
  return { failedAttempts: 0, consecutiveLockouts: 0, lockoutUntil: null };
}

/** Exponential backoff, capped, keyed by how many lockouts in a row this
 * lock has entered since its last successful unlock. */
export function computeLockoutDurationMs(consecutiveLockouts: number): number {
  const n = Math.max(1, consecutiveLockouts);
  const raw = BASE_LOCKOUT_MS * 2 ** (n - 1);
  return Math.min(raw, MAX_LOCKOUT_MS);
}

export function isLockedOut(state: LockoutState, now: number = Date.now()): boolean {
  return state.lockoutUntil !== null && state.lockoutUntil > now;
}

/** Wrong attempts left before the NEXT lockout begins. 0 while already
 * locked out (failedAttempts sits at the threshold until the lockout is
 * explicitly expired). */
export function attemptsRemaining(state: LockoutState): number {
  return Math.max(0, ATTEMPTS_BEFORE_LOCKOUT - state.failedAttempts);
}

/** If a persisted lockout's timer has actually elapsed, resolve it to the
 * expired state so callers see a fresh attempt budget. A no-op otherwise.
 * Call this before checking `isLockedOut` on any state read from disk. */
export function resolveNaturalExpiry(state: LockoutState, now: number = Date.now()): LockoutState {
  if (state.lockoutUntil !== null && state.lockoutUntil <= now) {
    return expireLockout(state);
  }
  return state;
}

/** Records one wrong credential attempt. Caller must have already
 * confirmed `!isLockedOut(state)` -- this never re-extends an active
 * lockout, it only ever begins a new one from a not-locked state. */
export function recordFailedAttempt(state: LockoutState, now: number = Date.now()): LockoutState {
  const failedAttempts = state.failedAttempts + 1;
  if (failedAttempts < ATTEMPTS_BEFORE_LOCKOUT) {
    return { ...state, failedAttempts };
  }
  const consecutiveLockouts = state.consecutiveLockouts + 1;
  const lockoutUntil = now + computeLockoutDurationMs(consecutiveLockouts);
  // failedAttempts is left AT the threshold on purpose: attemptsRemaining()
  // reads 0 for the whole duration of the lockout. It only drops back to 0
  // when the lockout itself ends, via expireLockout.
  return { failedAttempts, consecutiveLockouts, lockoutUntil };
}

/** A real, successful credential unlock: full reset, including the
 * consecutive-lockout escalation. This is the ONLY path that resets
 * consecutiveLockouts -- neither natural expiry nor the ladder may. */
export function recordSuccessfulUnlock(): LockoutState {
  return initialLockoutState();
}

/** Ends the current lockout: grants a fresh attempt budget but leaves
 * `consecutiveLockouts` untouched. Called for natural time expiry AND for
 * a won unlock-ladder rung -- see the module doc comment above. */
export function expireLockout(state: LockoutState): LockoutState {
  return { failedAttempts: 0, consecutiveLockouts: state.consecutiveLockouts, lockoutUntil: null };
}
