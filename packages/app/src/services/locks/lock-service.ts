/**
 * LockService: create, verify, edit, remove, and enumerate toy locks.
 *
 * Persistence is one JsonStore file holding every lock record (metadata
 * plus, for password locks, a scrypt hash -- never a plaintext password,
 * and never a raw TOTP secret; TOTP locks store only an opaque reference
 * into the authenticator service). The unlocked-state itself is kept
 * ONLY in memory: every lock is locked again on the next app launch,
 * regardless of its `lockedOnLaunch` display setting, because there is
 * nowhere durable that state is allowed to live without turning "locked
 * on launch" into a lie the next time the app starts.
 *
 * This is a toy lock. Nothing here is security, encryption, or
 * protection from anyone else with access to this machine -- see
 * recovery.ts for the disclaimer text every result carries.
 */

import { randomUUID } from 'node:crypto';
import type { JsonStore } from '../../store';
import { hashPassword, verifyPassword } from './password';
import {
  ATTEMPTS_BEFORE_LOCKOUT,
  attemptsRemaining,
  expireLockout,
  initialLockoutState,
  isLockedOut,
  recordFailedAttempt,
  recordSuccessfulUnlock,
  resolveNaturalExpiry,
} from './lockout';
import { getRecoveryInfo, TOY_LOCK_DISCLAIMER } from './recovery';
import type { LockoutController, LockoutSnapshot } from './lockout-controller';
import type {
  LockRecord,
  LockSummary,
  LockTarget,
  NewCredential,
  TotpVerifier,
  UnlockDuration,
  UnlockInput,
  UnlockResult,
} from './types';

export interface LockRegistryFile {
  locks: LockRecord[];
}

export const LOCK_REGISTRY_SCHEMA_VERSION = 1;

export function emptyLockRegistry(): LockRegistryFile {
  return { locks: [] };
}

type UnlockScope =
  | { kind: 'this-surface-only'; surfaceId: string }
  | { kind: 'until'; until: number }
  | { kind: 'until-app-closes' };

export class LockService implements LockoutController {
  private readonly registry: JsonStore<LockRegistryFile>;
  private readonly totp: TotpVerifier;
  /** In-memory only, by design: the unlocked state must never survive a
   * restart, or "locked on launch" would stop being true. */
  private readonly unlocked = new Map<string, UnlockScope>();

  constructor(registry: JsonStore<LockRegistryFile>, totp: TotpVerifier) {
    this.registry = registry;
    this.totp = totp;
  }

  // ---- listing, search, recovery -----------------------------------

  async listLocks(): Promise<LockSummary[]> {
    const file = await this.registry.load();
    const now = Date.now();
    return file.locks.map((lock) => toSummary(lock, now));
  }

  recoveryInfo() {
    return getRecoveryInfo();
  }

  // ---- create / edit / remove ---------------------------------------

  async createLock(
    target: LockTarget,
    credential: NewCredential,
    options: { unlockDuration?: UnlockDuration; lockedOnLaunch?: boolean } = {},
  ): Promise<LockSummary> {
    const now = Date.now();
    const record: LockRecord = {
      id: randomUUID(),
      target,
      ...(await this.materializeCredential(credential)),
      unlockDuration: options.unlockDuration ?? { kind: 'until-app-closes' },
      lockedOnLaunch: options.lockedOnLaunch ?? true,
      createdAt: now,
      updatedAt: now,
      lockout: initialLockoutState(),
    };

    const file = await this.registry.load();
    file.locks.push(record);
    await this.registry.save(file);
    return toSummary(record, now);
  }

  /** Replaces a lock's credential. Independent of every other lock's
   * credential -- there is no shared secret to rotate. */
  async changeCredential(lockId: string, credential: NewCredential): Promise<LockSummary> {
    const file = await this.registry.load();
    const lock = findLockOrThrow(file, lockId);
    const patch = await this.materializeCredential(credential);
    lock.method = patch.method;
    lock.passwordHash = patch.passwordHash;
    lock.totpEntryId = patch.totpEntryId;
    lock.updatedAt = Date.now();
    await this.registry.save(file);
    return toSummary(lock, Date.now());
  }

  async setUnlockDuration(lockId: string, unlockDuration: UnlockDuration): Promise<LockSummary> {
    const file = await this.registry.load();
    const lock = findLockOrThrow(file, lockId);
    lock.unlockDuration = unlockDuration;
    lock.updatedAt = Date.now();
    await this.registry.save(file);
    return toSummary(lock, Date.now());
  }

  async setLockedOnLaunch(lockId: string, lockedOnLaunch: boolean): Promise<LockSummary> {
    const file = await this.registry.load();
    const lock = findLockOrThrow(file, lockId);
    lock.lockedOnLaunch = lockedOnLaunch;
    lock.updatedAt = Date.now();
    await this.registry.save(file);
    return toSummary(lock, Date.now());
  }

  async removeLock(lockId: string): Promise<boolean> {
    const file = await this.registry.load();
    const before = file.locks.length;
    file.locks = file.locks.filter((lock) => lock.id !== lockId);
    if (file.locks.length === before) {
      return false;
    }
    this.unlocked.delete(lockId);
    await this.registry.save(file);
    return true;
  }

  /** Bulk removal. Reports exactly which ids were removed and which were
   * not found, rather than silently ignoring a stale id -- an app-wide
   * rule for every bulk action, not special to locks. */
  async removeLocks(lockIds: readonly string[]): Promise<{ removed: string[]; notFound: string[] }> {
    const file = await this.registry.load();
    const existing = new Set(file.locks.map((lock) => lock.id));
    const removed: string[] = [];
    const notFound: string[] = [];
    for (const id of lockIds) {
      (existing.has(id) ? removed : notFound).push(id);
    }
    const removedSet = new Set(removed);
    file.locks = file.locks.filter((lock) => !removedSet.has(lock.id));
    for (const id of removed) {
      this.unlocked.delete(id);
    }
    await this.registry.save(file);
    return { removed, notFound };
  }

  // ---- unlocking -------------------------------------------------------

  isUnlocked(lockId: string, surfaceId?: string): boolean {
    const scope = this.unlocked.get(lockId);
    if (!scope) {
      return false;
    }
    switch (scope.kind) {
      case 'this-surface-only':
        return surfaceId !== undefined && scope.surfaceId === surfaceId;
      case 'until':
        return Date.now() < scope.until;
      case 'until-app-closes':
        return true;
    }
  }

  /** Re-locks a lock the user had unlocked, without touching its
   * lockout/attempt state -- this is a deliberate re-lock action, not a
   * failure. */
  relock(lockId: string): void {
    this.unlocked.delete(lockId);
  }

  async attemptUnlock(lockId: string, input: UnlockInput, surfaceId?: string): Promise<UnlockResult> {
    const file = await this.registry.load();
    const lock = file.locks.find((l) => l.id === lockId);
    const recovery = getRecoveryInfo();

    if (!lock) {
      return {
        ok: false,
        reason: 'not-found',
        attemptsRemaining: 0,
        lockoutUntil: null,
        disclaimer: TOY_LOCK_DISCLAIMER,
        recoveryFolderPath: recovery.folderPath,
      };
    }

    const now = Date.now();
    lock.lockout = resolveNaturalExpiry(lock.lockout, now);

    if (isLockedOut(lock.lockout, now)) {
      await this.registry.save(file);
      return {
        ok: false,
        reason: 'locked-out',
        attemptsRemaining: 0,
        lockoutUntil: lock.lockout.lockoutUntil,
        disclaimer: TOY_LOCK_DISCLAIMER,
        recoveryFolderPath: recovery.folderPath,
      };
    }

    if (lock.method === 'totp' && !(await this.totp.entryExists(lock.totpEntryId as string))) {
      // The bound authenticator entry no longer exists. This will never
      // be able to succeed by credential, and it is not the user's
      // fault, so we say so plainly rather than silently burn one of
      // their attempts on a check that can never pass.
      await this.registry.save(file);
      return {
        ok: false,
        reason: 'totp-entry-missing',
        attemptsRemaining: attemptsRemaining(lock.lockout),
        lockoutUntil: lock.lockout.lockoutUntil,
        disclaimer: TOY_LOCK_DISCLAIMER,
        recoveryFolderPath: recovery.folderPath,
      };
    }

    const credentialOk = await this.verifyCredential(lock, input);

    if (credentialOk) {
      lock.lockout = recordSuccessfulUnlock();
      lock.updatedAt = now;
      await this.registry.save(file);
      this.grantUnlock(lock, now, surfaceId);
      return { ok: true, unlockedUntil: unlockedUntilView(lock.unlockDuration, now) };
    }

    lock.lockout = recordFailedAttempt(lock.lockout, now);
    await this.registry.save(file);
    return {
      ok: false,
      reason: isLockedOut(lock.lockout, now) ? 'locked-out' : 'wrong-credential',
      attemptsRemaining: attemptsRemaining(lock.lockout),
      lockoutUntil: lock.lockout.lockoutUntil,
      disclaimer: TOY_LOCK_DISCLAIMER,
      recoveryFolderPath: recovery.folderPath,
    };
  }

  // ---- LockoutController: the ladder's ONLY window into this class -----

  async getLockoutSnapshot(lockId: string): Promise<LockoutSnapshot> {
    const file = await this.registry.load();
    const lock = file.locks.find((l) => l.id === lockId);
    if (!lock) {
      return { isLockedOut: false, lockoutUntil: null };
    }
    const now = Date.now();
    const resolved = resolveNaturalExpiry(lock.lockout, now);
    if (resolved !== lock.lockout) {
      lock.lockout = resolved;
      await this.registry.save(file);
    }
    return { isLockedOut: isLockedOut(resolved, now), lockoutUntil: resolved.lockoutUntil };
  }

  async clearLockoutByLadder(lockId: string): Promise<void> {
    const file = await this.registry.load();
    const lock = file.locks.find((l) => l.id === lockId);
    if (!lock) {
      return;
    }
    const now = Date.now();
    if (!isLockedOut(resolveNaturalExpiry(lock.lockout, now), now)) {
      return; // already not locked out; nothing to clear
    }
    // Identical effect to natural time expiry: fresh attempt budget,
    // consecutiveLockouts left untouched, no credential verified, no
    // session minted. See lockout.ts's module doc comment.
    lock.lockout = expireLockout(lock.lockout);
    lock.updatedAt = now;
    await this.registry.save(file);
  }

  // ---- internal helpers -------------------------------------------------

  private grantUnlock(lock: LockRecord, now: number, surfaceId?: string): void {
    switch (lock.unlockDuration.kind) {
      case 'this-surface-only':
        this.unlocked.set(
          lock.id,
          surfaceId !== undefined
            ? { kind: 'this-surface-only', surfaceId }
            : { kind: 'until-app-closes' }, // no surface context supplied by the caller: scope the unlock to the process lifetime instead, rather than to a surface nobody named
        );
        return;
      case 'minutes':
        this.unlocked.set(lock.id, { kind: 'until', until: now + lock.unlockDuration.minutes * 60_000 });
        return;
      case 'until-app-closes':
        this.unlocked.set(lock.id, { kind: 'until-app-closes' });
        return;
    }
  }

  private async materializeCredential(
    credential: NewCredential,
  ): Promise<Pick<LockRecord, 'method' | 'passwordHash' | 'totpEntryId'>> {
    if (credential.method === 'password') {
      return { method: 'password', passwordHash: await hashPassword(credential.password), totpEntryId: undefined };
    }
    const confirmed = await this.totp.verifyCode(credential.totpEntryId, credential.confirmationCode);
    if (!confirmed) {
      throw new Error('TOTP confirmation code did not match; the lock was not created or changed.');
    }
    return { method: 'totp', passwordHash: undefined, totpEntryId: credential.totpEntryId };
  }

  private async verifyCredential(lock: LockRecord, input: UnlockInput): Promise<boolean> {
    if (lock.method === 'password') {
      if (input.method !== 'password' || !lock.passwordHash) {
        return false;
      }
      return verifyPassword(input.password, lock.passwordHash);
    }
    if (input.method !== 'totp' || !lock.totpEntryId) {
      return false;
    }
    return this.totp.verifyCode(lock.totpEntryId, input.code);
  }
}

function findLockOrThrow(file: LockRegistryFile, lockId: string): LockRecord {
  const lock = file.locks.find((l) => l.id === lockId);
  if (!lock) {
    throw new Error(`No toy lock with id ${lockId}`);
  }
  return lock;
}

function toSummary(lock: LockRecord, now: number): LockSummary {
  const resolved = resolveNaturalExpiry(lock.lockout, now);
  return {
    id: lock.id,
    target: lock.target,
    method: lock.method,
    unlockDuration: lock.unlockDuration,
    lockedOnLaunch: lock.lockedOnLaunch,
    createdAt: lock.createdAt,
    updatedAt: lock.updatedAt,
    isLockedOut: isLockedOut(resolved, now),
    lockoutUntil: resolved.lockoutUntil,
  };
}

function unlockedUntilView(
  duration: UnlockDuration,
  now: number,
): number | 'this-surface-only' | 'until-app-closes' {
  switch (duration.kind) {
    case 'this-surface-only':
      return 'this-surface-only';
    case 'minutes':
      return now + duration.minutes * 60_000;
    case 'until-app-closes':
      return 'until-app-closes';
  }
}

export { ATTEMPTS_BEFORE_LOCKOUT };
