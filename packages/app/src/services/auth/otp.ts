/**
 * RFC 4226 HOTP and RFC 6238 TOTP, implemented from scratch against the
 * published specifications using only node:crypto's HMAC primitive.
 *
 * This is deliberately NOT layered on any third-party TOTP package: a
 * subtly wrong implementation produces codes that every real-world
 * authenticator-consuming service rejects, with no error message telling
 * anyone why — the codes just never work. otp-test-vectors.ts carries the
 * RFC 6238 published test vectors and a self-check function that proves
 * this file against them; see auth-service.ts for where that self-check
 * is invoked.
 */

import { createHmac, randomBytes } from 'node:crypto';

export type OtpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

/** Node's crypto.createHmac() algorithm names for each supported OTP
 * algorithm. Lower-case, as node:crypto expects. */
const HMAC_ALGORITHM_NAMES: Record<OtpAlgorithm, string> = {
  SHA1: 'sha1',
  SHA256: 'sha256',
  SHA512: 'sha512',
};

export const OTP_ALGORITHMS: readonly OtpAlgorithm[] = ['SHA1', 'SHA256', 'SHA512'];

/** 6 to 8 digits, per this project's contract (RFC 4226 permits 6+; the
 * de facto ecosystem ceiling most services actually issue is 8). */
export const MIN_OTP_DIGITS = 6;
export const MAX_OTP_DIGITS = 8;

/** Defaults: SHA-1, 6 digits, a 30-second period — this is what the vast
 * majority of real-world issuers (and every otpauth:// URI that omits
 * these parameters) actually mean. Never used to override a value an
 * otpauth:// URI or a manual entry explicitly supplied. */
export const DEFAULT_OTP_ALGORITHM: OtpAlgorithm = 'SHA1';
export const DEFAULT_OTP_DIGITS = 6;
export const DEFAULT_OTP_PERIOD_SECONDS = 30;

/** Recommended raw secret length in bytes for a freshly generated
 * secret. 20 bytes (160 bits) is the RFC 4226 recommended HOTP secret
 * length and matches what most issuers generate for SHA-1; algorithms
 * with a larger block size (SHA-256, SHA-512) can use more, but 20 bytes
 * of real entropy is already well beyond what a 6-8 digit code can leak
 * through brute force in practice, and stays compatible with SHA-1
 * verifiers that assume it.
 */
export const DEFAULT_SECRET_BYTES = 20;

export class OtpValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpValidationError';
  }
}

export interface OtpParams {
  algorithm: OtpAlgorithm;
  /** Number of digits in the emitted code, 6-8 inclusive. */
  digits: number;
  /** TOTP time step in seconds. Ignored for HOTP. Must be a positive
   * integer; the RFC does not mandate 30, and honoring an issuer's own
   * period (an otpauth:// URI parameter) is required by this project's
   * contract even when it differs from the common default. */
  period: number;
}

export const DEFAULT_OTP_PARAMS: OtpParams = {
  algorithm: DEFAULT_OTP_ALGORITHM,
  digits: DEFAULT_OTP_DIGITS,
  period: DEFAULT_OTP_PERIOD_SECONDS,
};

/** Validates params that came from outside this module (a parsed
 * otpauth:// URI, manual entry, or a stored entry read back off disk).
 * Throws OtpValidationError naming exactly what is wrong, rather than
 * silently clamping a bad value into something that will quietly produce
 * codes a real issuer will reject. */
export function validateOtpParams(params: OtpParams): void {
  if (!OTP_ALGORITHMS.includes(params.algorithm)) {
    throw new OtpValidationError(
      `Unsupported OTP algorithm: ${JSON.stringify(params.algorithm)}. Supported: ${OTP_ALGORITHMS.join(', ')}.`,
    );
  }
  if (
    !Number.isInteger(params.digits) ||
    params.digits < MIN_OTP_DIGITS ||
    params.digits > MAX_OTP_DIGITS
  ) {
    throw new OtpValidationError(
      `Digit count must be an integer between ${MIN_OTP_DIGITS} and ${MAX_OTP_DIGITS}, got ${params.digits}.`,
    );
  }
  if (!Number.isInteger(params.period) || params.period <= 0) {
    throw new OtpValidationError(
      `Period must be a positive integer number of seconds, got ${params.period}.`,
    );
  }
}

/**
 * RFC 4226 HOTP: HOTP(K, C) = Truncate(HMAC-Alg(K, C)) mod 10^digits.
 *
 * `counter` is a non-negative integer moving factor. Accepts a bigint so
 * TOTP (below) can hand it counters derived from real Unix time without
 * ever going through a lossy float.
 */
export function hotp(
  secret: Buffer,
  counter: bigint,
  params: Pick<OtpParams, 'algorithm' | 'digits'> = DEFAULT_OTP_PARAMS,
): string {
  if (counter < 0n) {
    throw new OtpValidationError(`HOTP counter must be non-negative, got ${counter}.`);
  }

  // RFC 4226 section 5.2: the moving factor is an 8-byte, big-endian
  // unsigned integer.
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const hmac = createHmac(HMAC_ALGORITHM_NAMES[params.algorithm], secret);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  // Dynamic truncation (RFC 4226 section 5.3).
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff);

  const modulus = 10 ** params.digits;
  const otpValue = binary % modulus;

  return otpValue.toString(10).padStart(params.digits, '0');
}

/**
 * RFC 6238 TOTP: TOTP = HOTP(K, T) where T = floor((unixTimeSeconds -
 * T0) / period), T0 = 0 per the RFC's own default and this project's
 * contract (no otpauth:// parameter for a nonzero T0 is supported by any
 * real issuer this app needs to interoperate with).
 *
 * `timeMs` is milliseconds since the Unix epoch (i.e. Date.now()'s
 * units), so every call site reasons in the same units the rest of the
 * platform already uses.
 */
export function totp(
  secret: Buffer,
  timeMs: number,
  params: OtpParams = DEFAULT_OTP_PARAMS,
): string {
  const counter = totpCounter(timeMs, params.period);
  return hotp(secret, counter, params);
}

/** The RFC 6238 time-counter T for a given wall-clock time and period. */
export function totpCounter(timeMs: number, periodSeconds: number): bigint {
  const timeSeconds = Math.floor(timeMs / 1000);
  return BigInt(Math.floor(timeSeconds / periodSeconds));
}

/** Seconds remaining in the current TOTP time step, in the half-open
 * range (0, periodSeconds]. Used to drive the countdown in the code
 * display and to decide when to compute the next code. */
export function secondsRemainingInStep(timeMs: number, periodSeconds: number): number {
  const timeSeconds = Math.floor(timeMs / 1000);
  const elapsedInStep = timeSeconds % periodSeconds;
  return periodSeconds - elapsedInStep;
}

/**
 * Verifies a user-supplied TOTP code against the secret, accepting the
 * current time step and up to `windowSteps` steps on either side. A
 * window of 1 (the default) tolerates roughly one period of clock drift
 * or typing delay between the code being generated on the authenticator
 * being paired and the user finishing typing it in — the same tolerance
 * RFC 6238 section 5.2 recommends. Returns the matched step offset (0 for
 * the current step, negative for past, positive for future) so a caller
 * can log or reason about drift, or null when no step in the window
 * matches.
 */
export function verifyTotp(
  secret: Buffer,
  candidateCode: string,
  timeMs: number,
  params: OtpParams = DEFAULT_OTP_PARAMS,
  windowSteps = 1,
): number | null {
  const trimmed = candidateCode.trim();
  if (!/^\d+$/.test(trimmed) || trimmed.length !== params.digits) {
    return null;
  }

  const centerCounter = totpCounter(timeMs, params.period);

  for (let offset = -windowSteps; offset <= windowSteps; offset += 1) {
    const counter = centerCounter + BigInt(offset);
    if (counter < 0n) {
      continue;
    }
    const expected = hotp(secret, counter, params);
    if (timingSafeEqualStrings(expected, trimmed)) {
      return offset;
    }
  }

  return null;
}

/**
 * Generates a fresh random secret locally, using node:crypto's CSPRNG.
 * Never touches the network — a generated secret exists only in this
 * process's memory until the caller explicitly persists it (see
 * vault.ts), and the whole point of generating it locally is that no
 * third party, including this app's own developers, ever sees it.
 */
export function generateSecret(byteLength: number = DEFAULT_SECRET_BYTES): Buffer {
  if (!Number.isInteger(byteLength) || byteLength < 10) {
    throw new OtpValidationError(
      `Secret length must be an integer of at least 10 bytes (80 bits), got ${byteLength}.`,
    );
  }
  return randomBytes(byteLength);
}

/** Constant-time string comparison for equal-length digit strings, so
 * code verification does not leak timing information about which digit
 * of a guess was wrong. Falls back to ordinary inequality when lengths
 * differ (never reached by verifyTotp, which pre-checks length, but kept
 * safe for any other caller). */
function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
