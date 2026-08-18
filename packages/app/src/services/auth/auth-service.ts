/**
 * The built-in authenticator's application service: ties together the
 * RFC 6238 TOTP core (otp.ts), otpauth:// URI handling, the from-scratch
 * QR renderer, the safeStorage-backed secret vault, and the persisted
 * entry list into the single API surface the rest of the app (IPC,
 * renderer) is meant to call.
 *
 * Registration is a two-step, explicitly confirmed flow:
 *
 *   1. beginRegistration*() generates or accepts a secret and returns a
 *      QR code, the manual base32 secret, and a pending registration id.
 *      Nothing is persisted yet — the secret exists only in this
 *      process's memory, in the pending-registration map.
 *   2. confirmRegistration() requires the user to type back one CURRENT
 *      code. Only a match commits the secret to the vault and the entry
 *      to the persisted list; anything else leaves nothing on disk. This
 *      is deliberate: a mis-scanned QR or a mistyped manual secret must
 *      never silently become a "paired" entry that will simply never
 *      produce a code any real service accepts.
 *
 * Beyond that one-time reveal during an in-progress registration, no
 * method on this class ever returns a stored secret's value, length, or
 * composition — see getCurrentCode(), which returns computed codes, not
 * the secret they were computed from.
 */

import { randomUUID } from 'node:crypto';
import {
  DEFAULT_OTP_ALGORITHM,
  DEFAULT_OTP_DIGITS,
  DEFAULT_OTP_PERIOD_SECONDS,
  DEFAULT_SECRET_BYTES,
  OtpValidationError,
  generateSecret,
  secondsRemainingInStep,
  totp,
  validateOtpParams,
  verifyTotp,
  type OtpAlgorithm,
  type OtpParams,
} from './otp.js';
import { assertOtpImplementationIsCorrect, OtpSelfCheckError } from './otp-test-vectors.js';
import { base32Decode, base32Encode, formatBase32Grouped, Base32DecodeError } from './base32.js';
import { buildOtpAuthUri, parseOtpAuthUri, OtpAuthUriError } from './otpauth-uri.js';
import { encodeQrSvg } from './qrcode.js';
import {
  isVaultAvailable,
  removeSecret,
  retrieveSecret,
  storeSecret,
  VaultCorruptError,
  VaultUnavailableError,
} from './vault.js';
import { AuthEntriesStore, type AuthEntry, type AuthGroup } from './entries-store.js';
import { ClockMonitor, sharedClockMonitor, type ClockStatus } from './clock-monitor.js';

export class AuthServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthServiceUnavailableError';
  }
}

export class PendingRegistrationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PendingRegistrationNotFoundError';
  }
}

export class PairingNotConfirmedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PairingNotConfirmedError';
  }
}

/** How long a pending (unconfirmed) registration stays valid before it
 * must be re-started. Bounds how long a generated secret sits in memory
 * unconfirmed, and matches the QR/manual-secret display having a
 * sensible "this pairing session has expired" lifetime rather than
 * living forever. */
const PENDING_REGISTRATION_TTL_MS = 10 * 60 * 1000;

export interface PendingRegistrationSummary {
  pendingId: string;
  issuer: string;
  account: string;
  algorithm: OtpAlgorithm;
  digits: number;
  period: number;
  /** The manual-entry secret, grouped for readability (e.g. "ABCD EFGH
   * ..."). Present so pairing never depends on a working camera. */
  secretBase32Grouped: string;
  otpAuthUri: string;
  /** Self-contained SVG markup for the pairing QR code. */
  qrSvg: string;
  /** ISO-8601 timestamp after which this pending registration expires
   * and must be re-started with a fresh call to a beginRegistration*
   * method. */
  expiresAt: string;
}

export interface BeginRegistrationOptions {
  issuer?: string;
  account?: string;
  algorithm?: OtpAlgorithm;
  digits?: number;
  period?: number;
}

export interface BeginRegistrationFromSecretOptions extends BeginRegistrationOptions {
  /** Base32 secret text, with or without spaces/padding (see
   * base32Decode). */
  secretBase32: string;
}

export type CurrentCodeResult =
  | {
      state: 'ok';
      code: string;
      secondsRemaining: number;
      /** The code that will become active once the current one expires,
       * so a user never starts typing a code with only a second or two
       * left on the clock. */
      nextCode: string;
      periodSeconds: number;
      clockStatus: ClockStatus;
    }
  | { state: 'vault-unavailable'; message: string }
  | { state: 'secret-missing' }
  | { state: 'corrupt-secret'; message: string }
  | { state: 'entry-not-found' };

interface PendingRegistration {
  pendingId: string;
  issuer: string;
  account: string;
  secret: Buffer;
  params: OtpParams;
  createdAtMs: number;
}

/** Number of TOTP steps of tolerance (before and after the current one)
 * accepted when confirming a fresh pairing or verifying a typed code —
 * RFC 6238 section 5.2's own recommended allowance for clock drift and
 * typing delay. */
const PAIRING_WINDOW_STEPS = 1;

export class AuthService {
  private readonly entriesStore: AuthEntriesStore;
  private readonly clockMonitor: ClockMonitor;
  private readonly pendingRegistrations = new Map<string, PendingRegistration>();
  private readonly selfCheckError: Error | null;

  constructor(entriesStore = new AuthEntriesStore(), clockMonitor = sharedClockMonitor) {
    this.entriesStore = entriesStore;
    this.clockMonitor = clockMonitor;

    // Run the RFC 6238/4226 self-check once, at construction, and fail
    // every code-generating and code-verifying operation closed if it
    // does not pass. A subtly wrong OTP implementation must never be
    // allowed to silently register an entry or verify a code — see
    // otp-test-vectors.ts for what this proves and why it matters.
    try {
      assertOtpImplementationIsCorrect();
      this.selfCheckError = null;
    } catch (err) {
      this.selfCheckError =
        err instanceof OtpSelfCheckError
          ? err
          : new OtpSelfCheckError(err instanceof Error ? err.message : String(err));
    }
  }

  private ensureSelfCheckPassed(): void {
    if (this.selfCheckError) {
      throw new AuthServiceUnavailableError(
        `The authenticator is disabled because its RFC 6238/4226 self-check failed: ${this.selfCheckError.message}`,
      );
    }
  }

  isVaultAvailable(): boolean {
    return isVaultAvailable();
  }

  getClockStatus(): ClockStatus {
    this.clockMonitor.sample();
    return this.clockMonitor.status();
  }

  acknowledgeClockJump(): void {
    this.clockMonitor.acknowledgeJump();
  }

  // -------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------

  /** Begins a registration with a freshly, locally generated secret. */
  beginRegistration(options: BeginRegistrationOptions = {}): PendingRegistrationSummary {
    this.ensureSelfCheckPassed();
    const params = resolveParams(options);
    const secret = generateSecret(DEFAULT_SECRET_BYTES);
    return this.createPending(options.issuer ?? '', options.account ?? '', secret, params);
  }

  /** Begins a registration from a manually entered base32 secret and
   * explicit parameters. Every parameter the caller supplies is used
   * as given; only parameters the caller omits fall back to this
   * project's defaults (SHA-1, 6 digits, 30-second period). */
  beginRegistrationFromSecret(options: BeginRegistrationFromSecretOptions): PendingRegistrationSummary {
    this.ensureSelfCheckPassed();
    const params = resolveParams(options);

    let secret: Buffer;
    try {
      secret = base32Decode(options.secretBase32);
    } catch (err) {
      const reason = err instanceof Base32DecodeError ? err.message : String(err);
      throw new OtpValidationError(`Invalid manually entered secret: ${reason}`);
    }

    return this.createPending(options.issuer ?? '', options.account ?? '', secret, params);
  }

  /**
   * Begins a registration from a pasted or scanned otpauth:// URI. Every
   * parameter the URI carries (algorithm, digits, period, issuer) is
   * honored exactly as given, never overwritten with this project's
   * defaults. Only "totp" type URIs are accepted — this authenticator
   * generates time-based codes; a "hotp" (counter-based) URI is rejected
   * with a specific, honest reason rather than silently mismapped onto
   * TOTP semantics it does not have.
   */
  beginRegistrationFromUri(uriText: string): PendingRegistrationSummary {
    this.ensureSelfCheckPassed();

    const parsed = parseOtpAuthUri(uriText);
    if (parsed.type !== 'totp') {
      throw new OtpAuthUriError(
        'This authenticator supports time-based (TOTP) accounts only. ' +
          'The scanned or pasted code was for an HOTP (counter-based) account, which is not supported.',
      );
    }

    const params: OtpParams = {
      algorithm: parsed.algorithm,
      digits: parsed.digits,
      period: parsed.period ?? DEFAULT_OTP_PERIOD_SECONDS,
    };
    validateOtpParams(params);

    return this.createPending(parsed.issuer, parsed.account, parsed.secret, params);
  }

  private createPending(
    issuer: string,
    account: string,
    secret: Buffer,
    params: OtpParams,
  ): PendingRegistrationSummary {
    validateOtpParams(params);

    const pendingId = randomUUID();
    const createdAtMs = Date.now();
    this.pendingRegistrations.set(pendingId, {
      pendingId,
      issuer,
      account,
      secret,
      params,
      createdAtMs,
    });
    this.expireStalePendingRegistrations();

    return this.summarizePending({
      pendingId,
      issuer,
      account,
      secret,
      params,
      createdAtMs,
    });
  }

  private summarizePending(pending: PendingRegistration): PendingRegistrationSummary {
    const otpAuthUri = buildOtpAuthUri({
      type: 'totp',
      issuer: pending.issuer,
      account: pending.account,
      secret: pending.secret,
      algorithm: pending.params.algorithm,
      digits: pending.params.digits,
      period: pending.params.period,
    });

    return {
      pendingId: pending.pendingId,
      issuer: pending.issuer,
      account: pending.account,
      algorithm: pending.params.algorithm,
      digits: pending.params.digits,
      period: pending.params.period,
      secretBase32Grouped: formatBase32Grouped(base32Encode(pending.secret)),
      otpAuthUri,
      qrSvg: encodeQrSvg(otpAuthUri),
      expiresAt: new Date(pending.createdAtMs + PENDING_REGISTRATION_TTL_MS).toISOString(),
    };
  }

  /** Re-fetches the QR/manual-secret summary for an in-progress
   * registration, e.g. after the caller re-opens the pairing screen. */
  getPendingRegistration(pendingId: string): PendingRegistrationSummary {
    return this.summarizePending(this.requirePending(pendingId));
  }

  private requirePending(pendingId: string): PendingRegistration {
    this.expireStalePendingRegistrations();
    const pending = this.pendingRegistrations.get(pendingId);
    if (!pending) {
      throw new PendingRegistrationNotFoundError(
        `No in-progress registration ${JSON.stringify(pendingId)}. It may have already been confirmed, cancelled, or expired.`,
      );
    }
    return pending;
  }

  private expireStalePendingRegistrations(): void {
    const now = Date.now();
    for (const [id, pending] of this.pendingRegistrations) {
      if (now - pending.createdAtMs > PENDING_REGISTRATION_TTL_MS) {
        this.pendingRegistrations.delete(id);
      }
    }
  }

  /** Discards an in-progress registration without persisting anything. */
  cancelRegistration(pendingId: string): void {
    this.pendingRegistrations.delete(pendingId);
  }

  /**
   * Confirms an in-progress registration: the user types back one
   * CURRENT code from whatever authenticator UI they just paired
   * (this app's own pairing screen, having just displayed it, is itself
   * the thing being confirmed against). Only a match — within the
   * standard's recommended one-step drift window — commits the secret to
   * the vault and the entry to the persisted list. Throws
   * PairingNotConfirmedError otherwise, and nothing is written to disk.
   */
  async confirmRegistration(pendingId: string, typedCode: string): Promise<AuthEntry> {
    this.ensureSelfCheckPassed();
    const pending = this.requirePending(pendingId);

    this.clockMonitor.sample();
    const matchedOffset = verifyTotp(
      pending.secret,
      typedCode,
      Date.now(),
      pending.params,
      PAIRING_WINDOW_STEPS,
    );

    if (matchedOffset === null) {
      throw new PairingNotConfirmedError(
        'That code does not match. Double-check the code currently shown by your authenticator and try again.',
      );
    }

    if (!this.isVaultAvailable()) {
      throw new VaultUnavailableError(
        'Secure secret storage is not available on this machine right now, so this pairing cannot be saved. ' +
          'The code you entered was correct — try again once secure storage is available.',
      );
    }

    const entryId = randomUUID();
    await storeSecret(entryId, pending.secret);

    const existing = await this.entriesStore.listEntries();
    const entry: AuthEntry = {
      id: entryId,
      issuer: pending.issuer,
      account: pending.account,
      algorithm: pending.params.algorithm,
      digits: pending.params.digits,
      period: pending.params.period,
      order: existing.length,
      groupId: null,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.entriesStore.addEntry(entry);
    } catch (err) {
      // Never leave an orphaned secret in the vault with no
      // corresponding entry the app knows about.
      await removeSecret(entryId).catch(() => undefined);
      throw err;
    }

    this.pendingRegistrations.delete(pendingId);
    return entry;
  }

  // -------------------------------------------------------------------
  // Entry list
  // -------------------------------------------------------------------

  async listEntries(): Promise<AuthEntry[]> {
    return this.entriesStore.listEntries();
  }

  async listGroups(): Promise<AuthGroup[]> {
    return this.entriesStore.listGroups();
  }

  async renameEntry(entryId: string, patch: { issuer?: string; account?: string }): Promise<AuthEntry> {
    const updated = await this.entriesStore.updateEntry(entryId, patch);
    if (!updated) {
      throw new Error(`No authenticator entry with id ${JSON.stringify(entryId)}.`);
    }
    return updated;
  }

  async reorderEntries(orderedIds: readonly string[]): Promise<void> {
    await this.entriesStore.reorderEntries(orderedIds);
  }

  async assignEntryToGroup(entryId: string, groupId: string | null): Promise<AuthEntry> {
    const updated = await this.entriesStore.updateEntry(entryId, { groupId });
    if (!updated) {
      throw new Error(`No authenticator entry with id ${JSON.stringify(entryId)}.`);
    }
    return updated;
  }

  async removeEntry(entryId: string): Promise<void> {
    await removeSecret(entryId);
    await this.entriesStore.removeEntry(entryId);
  }

  async createGroup(name: string): Promise<AuthGroup> {
    const existing = await this.entriesStore.listGroups();
    const group: AuthGroup = { id: randomUUID(), name, order: existing.length };
    await this.entriesStore.addGroup(group);
    return group;
  }

  async renameGroup(groupId: string, name: string): Promise<AuthGroup> {
    const updated = await this.entriesStore.renameGroup(groupId, name);
    if (!updated) {
      throw new Error(`No authenticator group with id ${JSON.stringify(groupId)}.`);
    }
    return updated;
  }

  async removeGroup(groupId: string): Promise<void> {
    await this.entriesStore.removeGroup(groupId);
  }

  async reorderGroups(orderedIds: readonly string[]): Promise<void> {
    await this.entriesStore.reorderGroups(orderedIds);
  }

  // -------------------------------------------------------------------
  // Live codes
  // -------------------------------------------------------------------

  /**
   * Computes the entry's current code, the seconds remaining before it
   * changes, and the code that will replace it — never the stored
   * secret itself. Returns an explicit, honest failure state (rather
   * than throwing) for every way this can legitimately fail to produce
   * a code: the vault being unavailable, the secret having gone missing
   * or become undecryptable, or the entry not existing — so a caller
   * driving a UI can render a specific message instead of a generic
   * error.
   */
  async getCurrentCode(entryId: string): Promise<CurrentCodeResult> {
    this.ensureSelfCheckPassed();

    const entries = await this.entriesStore.listEntries();
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) {
      return { state: 'entry-not-found' };
    }

    let secret: Buffer | null;
    try {
      secret = await retrieveSecret(entryId);
    } catch (err) {
      if (err instanceof VaultUnavailableError) {
        return { state: 'vault-unavailable', message: err.message };
      }
      if (err instanceof VaultCorruptError) {
        return { state: 'corrupt-secret', message: err.message };
      }
      throw err;
    }

    if (!secret) {
      return { state: 'secret-missing' };
    }

    this.clockMonitor.sample();
    const nowMs = Date.now();
    const params: OtpParams = { algorithm: entry.algorithm, digits: entry.digits, period: entry.period };

    const code = totp(secret, nowMs, params);
    const secondsRemaining = secondsRemainingInStep(nowMs, entry.period);
    const nextCode = totp(secret, nowMs + entry.period * 1000, params);

    return {
      state: 'ok',
      code,
      secondsRemaining,
      nextCode,
      periodSeconds: entry.period,
      clockStatus: this.clockMonitor.status(),
    };
  }
}

function resolveParams(options: {
  algorithm?: OtpAlgorithm;
  digits?: number;
  period?: number;
}): OtpParams {
  return {
    algorithm: options.algorithm ?? DEFAULT_OTP_ALGORITHM,
    digits: options.digits ?? DEFAULT_OTP_DIGITS,
    period: options.period ?? DEFAULT_OTP_PERIOD_SECONDS,
  };
}
