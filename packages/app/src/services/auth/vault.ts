/**
 * Secret storage for authenticator entries.
 *
 * A TOTP/HOTP secret is stored ONLY through Electron's safeStorage API,
 * which on Windows encrypts through DPAPI bound to the current OS user
 * account. safeStorage itself only encrypts/decrypts strings in memory —
 * it does not persist anything — so this module writes the resulting
 * ciphertext to a per-entry file under the app's data directory via
 * atomicWriteFile, keyed by a stable per-entry id. The secret is NEVER
 * written to the entries metadata store, a settings file, an export, a
 * log, or local version history: every one of those only ever sees the
 * entry id, issuer, and account name.
 *
 * This module fails CLOSED and honestly when the OS-level protection
 * safeStorage depends on is unavailable (e.g. no keyring on a bare Linux
 * session, or a Windows profile whose DPAPI store is broken): callers
 * must check isVaultAvailable() and surface that state plainly rather
 * than falling back to storing a secret unencrypted.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import { atomicWriteFile } from '../../atomic-write.js';
import { dataDir } from '../../store.js';

export class VaultUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultUnavailableError';
  }
}

export class VaultCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultCorruptError';
  }
}

/** A conservative allowlist for entry ids used as file names: this app
 * always generates ids itself (see auth-service.ts, crypto.randomUUID),
 * so this is a defensive check against a future caller ever passing
 * something path-like through, not a format users are expected to type. */
const SAFE_ENTRY_ID = /^[A-Za-z0-9-]{1,128}$/;

function assertSafeEntryId(entryId: string): void {
  if (!SAFE_ENTRY_ID.test(entryId)) {
    throw new VaultUnavailableError(`Invalid entry id: ${JSON.stringify(entryId)}.`);
  }
}

function secretsDir(): string {
  return path.join(dataDir(), 'auth', 'secrets');
}

function secretFilePath(entryId: string): string {
  return path.join(secretsDir(), `${entryId}.bin`);
}

/**
 * True when the OS-backed encryption safeStorage needs is actually
 * available on this machine right now. Every registration and every
 * code-generation path must check this first and expose an explicit
 * "the vault is unavailable, and here is why" state rather than silently
 * failing or, worse, silently storing a secret without OS protection.
 */
export function isVaultAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    // Electron's own docs note this can throw before the app is ready,
    // or in unusual sandboxing configurations. Treat any failure to even
    // ask the question as "not available" — never assume availability.
    return false;
  }
}

function requireVaultAvailable(): void {
  if (!isVaultAvailable()) {
    throw new VaultUnavailableError(
      'Secure secret storage is not available on this machine right now. ' +
        'This usually means the OS-level credential protection Electron relies on ' +
        '(DPAPI on Windows) could not be reached. No secret can be safely stored or read until this is resolved.',
    );
  }
}

/**
 * Encrypts `secretBytes` via safeStorage and writes it atomically to this
 * entry's secret file, creating the secrets directory if needed. Throws
 * VaultUnavailableError if OS-backed encryption is not available — the
 * caller must not fall back to an unencrypted write.
 */
export async function storeSecret(entryId: string, secretBytes: Buffer): Promise<void> {
  assertSafeEntryId(entryId);
  requireVaultAvailable();

  // safeStorage only encrypts/decrypts strings; round-trip the raw
  // secret bytes through base64 so no encoding assumption is made about
  // the secret's byte content.
  const base64Secret = secretBytes.toString('base64');
  const encrypted = safeStorage.encryptString(base64Secret);

  await fs.mkdir(secretsDir(), { recursive: true });
  await atomicWriteFile(secretFilePath(entryId), encrypted);
}

/**
 * Reads and decrypts the secret for `entryId`. Returns null when no
 * secret file exists for this entry (a normal outcome — the entry may
 * have been removed, or never confirmed). Throws VaultUnavailableError
 * when OS-backed decryption is not available, and VaultCorruptError when
 * a secret file exists but cannot be decrypted (e.g. it was encrypted
 * under a different OS user account, or the file is damaged) — both are
 * distinct, explicit failure states a caller must surface rather than
 * silently treat as "no secret".
 */
export async function retrieveSecret(entryId: string): Promise<Buffer | null> {
  assertSafeEntryId(entryId);

  let encrypted: Buffer;
  try {
    encrypted = await fs.readFile(secretFilePath(entryId));
  } catch (err) {
    if (isEnoent(err)) {
      return null;
    }
    throw err;
  }

  requireVaultAvailable();

  let base64Secret: string;
  try {
    base64Secret = safeStorage.decryptString(encrypted);
  } catch (err) {
    throw new VaultCorruptError(
      `Could not decrypt the stored secret for this entry: ${err instanceof Error ? err.message : String(err)}.`,
    );
  }

  return Buffer.from(base64Secret, 'base64');
}

/** Removes the secret file for `entryId`, if present. Never throws for a
 * secret that is already gone. */
export async function removeSecret(entryId: string): Promise<void> {
  assertSafeEntryId(entryId);
  try {
    await fs.unlink(secretFilePath(entryId));
  } catch (err) {
    if (!isEnoent(err)) {
      throw err;
    }
  }
}

function isEnoent(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: unknown }).code === 'ENOENT');
}
