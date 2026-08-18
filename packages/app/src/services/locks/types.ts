/**
 * Toy locks: shared types.
 *
 * A toy lock is JUST FOR FUN. It is a self-imposed speed bump on one
 * rendered element -- never security, never encryption, never protection
 * from anyone else who has access to this machine. Nothing in this
 * subsystem may describe it otherwise. See recovery.ts for the exact
 * user-facing disclaimer text every caller should surface alongside it.
 *
 * EVERY lock carries its OWN credential, independently created, changed,
 * and removed. There is no master credential and no implicit inheritance
 * between locks: unlocking one element never unlocks another, even when
 * both happen to use the same password chosen by the user.
 */

import type { PasswordHash } from './password';

/** What is being locked. Opaque to this module: the UI layer decides what
 * `elementId` means (a tab, a setting, a font-size control, a whole
 * panel) and supplies a human-readable label for the lock list. */
export interface LockTarget {
  /** Stable identifier for the locked element, chosen by the caller. */
  elementId: string;
  /** Human-readable label shown in the lock list and unlock prompt, e.g.
   * "Font size (Settings > Appearance)". */
  label: string;
}

export type LockMethod = 'password' | 'totp';

/** How long a successful unlock stays in effect. All three are the
 * user's own choice; none of them survive an app restart on their own --
 * "locked on launch" is the default for every lock regardless of this
 * setting, because the unlocked state itself lives only in memory. */
export type UnlockDuration =
  | { kind: 'this-surface-only' }
  | { kind: 'minutes'; minutes: number }
  | { kind: 'until-app-closes' };

/** Consecutive-failure lockout bookkeeping for one lock. Persisted
 * alongside the lock record so a restart does not silently reset it.
 * See lockout.ts for the state machine that reads and writes this. */
export interface LockoutState {
  /** Wrong attempts since the last successful unlock or lockout expiry. */
  failedAttempts: number;
  /** How many lockouts in a row this lock has entered since the last
   * SUCCESSFUL credential unlock. Drives the exponential (capped) backoff
   * and is deliberately untouched by the unlock ladder -- see
   * ladder/ladder-service.ts. */
  consecutiveLockouts: number;
  /** Epoch ms the current lockout ends, or null when not locked out. */
  lockoutUntil: number | null;
}

/** A persisted toy lock. Never sent to the renderer as-is: see
 * `toLockSummary` in lock-service.ts for the redacted view that strips
 * the credential material before it crosses IPC. */
export interface LockRecord {
  id: string;
  target: LockTarget;
  method: LockMethod;
  /** Present only when method === 'password'. A scrypt hash -- never the
   * password itself. */
  passwordHash?: PasswordHash;
  /** Present only when method === 'totp'. An opaque reference into the
   * authenticator service's own entry list; this module never sees, and
   * never stores, the underlying TOTP secret. */
  totpEntryId?: string;
  unlockDuration: UnlockDuration;
  /** Whether this lock starts locked every time the app launches. The
   * unlocked state lives only in memory, so in practice every lock is
   * "locked on launch" regardless of this flag; the flag exists so the
   * lock list and its editor have something concrete to display and so a
   * future in-session "stay unlocked across a reload" affordance has a
   * place to read from without changing this contract. */
  lockedOnLaunch: boolean;
  createdAt: number;
  updatedAt: number;
  lockout: LockoutState;
}

/** The redacted, IPC-safe view of a lock: everything a lock list or
 * editor needs, nothing that could reveal or help brute-force the
 * credential. */
export interface LockSummary {
  id: string;
  target: LockTarget;
  method: LockMethod;
  unlockDuration: UnlockDuration;
  lockedOnLaunch: boolean;
  createdAt: number;
  updatedAt: number;
  /** True while a lockout is currently in effect (as of the moment this
   * summary was produced -- callers polling a live UI should re-fetch
   * rather than trust this for more than a moment). */
  isLockedOut: boolean;
  /** Epoch ms the current lockout ends, or null. */
  lockoutUntil: number | null;
}

export type NewCredential =
  | { method: 'password'; password: string }
  | {
      method: 'totp';
      /** Opaque id of an existing authenticator entry the user already
       * paired. */
      totpEntryId: string;
      /** A current live code from that entry, required to prove the
       * caller actually controls it before the lock arms -- the same
       * "confirm before it arms" rule the authenticator's own pairing
       * flow uses. */
      confirmationCode: string;
    };

export type UnlockInput =
  | { method: 'password'; password: string }
  | { method: 'totp'; code: string };

export type UnlockFailureReason =
  | 'not-found'
  | 'locked-out'
  | 'wrong-credential'
  | 'totp-entry-missing';

export interface UnlockResultOk {
  ok: true;
  unlockedUntil: number | 'this-surface-only' | 'until-app-closes';
}

export interface UnlockResultFail {
  ok: false;
  reason: UnlockFailureReason;
  /** Attempts left before the NEXT lockout begins. 0 while already
   * locked out. */
  attemptsRemaining: number;
  /** Epoch ms the lockout (existing or just-triggered) ends, if any. */
  lockoutUntil: number | null;
  /** Always present: never security, never encryption, never
   * protection -- and where to go to recover. */
  disclaimer: string;
  recoveryFolderPath: string;
}

export type UnlockResult = UnlockResultOk | UnlockResultFail;

/** A narrow, one-directional dependency this module needs from the
 * authenticator service, wired in by the orchestrator. Deliberately does
 * not import anything from that service: this is the whole contract. */
export interface TotpVerifier {
  /** True if `code` matches the live TOTP code for `entryId` within the
   * standard verification window. Must never resolve with anything that
   * reveals the underlying secret -- true/false only. */
  verifyCode(entryId: string, code: string): Promise<boolean>;
  /** True if the referenced authenticator entry still exists. A lock can
   * outlive the entry it was bound to (the user deleted it from the
   * authenticator surface); when that happens the lock becomes
   * permanently unopenable by credential, and callers should say so
   * plainly rather than let the user burn attempts on an impossible
   * check. */
  entryExists(entryId: string): Promise<boolean>;
}
