/**
 * Published RFC 4226 (HOTP) and RFC 6238 (TOTP) test vectors, carried as
 * constants and self-checked against this project's own hotp()/totp()
 * implementation. Every service that verifies a TOTP code trusts this
 * module's self-check to have run and passed; see
 * assertOtpImplementationIsCorrect() below and its call site in
 * auth-service.ts.
 *
 * A subtly wrong TOTP implementation is the worst kind of bug this
 * feature can ship with: it compiles, it "generates codes", and every
 * one of those codes is silently rejected by every real service the user
 * tries to use it with, with no error message anywhere pointing at why.
 * Pinning the RFC's own published vectors as an executable check is the
 * only way to rule that out with certainty rather than by inspection.
 */

import { hotp, totp, type OtpAlgorithm } from './otp.js';

export class OtpSelfCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpSelfCheckError';
  }
}

/**
 * RFC 4226 Appendix D: HOTP test values, ASCII secret "12345678901234567890"
 * (20 bytes), SHA-1, 6 digits, counters 0 through 9.
 */
export const HOTP_SHA1_SECRET_ASCII = '12345678901234567890';

export const RFC4226_HOTP_VECTORS: ReadonlyArray<{ counter: bigint; expected: string }> = [
  { counter: 0n, expected: '755224' },
  { counter: 1n, expected: '287082' },
  { counter: 2n, expected: '359152' },
  { counter: 3n, expected: '969429' },
  { counter: 4n, expected: '338314' },
  { counter: 5n, expected: '254676' },
  { counter: 6n, expected: '287922' },
  { counter: 7n, expected: '162583' },
  { counter: 8n, expected: '399871' },
  { counter: 9n, expected: '520489' },
];

/**
 * RFC 6238 Appendix B: TOTP test values. All three secrets are the ASCII
 * repetition of "1234567890" extended to the algorithm's natural key
 * length (20 bytes for SHA-1, 32 for SHA-256, 64 for SHA-512), 8 digits,
 * a 30-second period, T0 = 0.
 */
export const TOTP_SECRET_ASCII_SHA1 = '12345678901234567890';
export const TOTP_SECRET_ASCII_SHA256 = '12345678901234567890123456789012';
export const TOTP_SECRET_ASCII_SHA512 =
  '1234567890123456789012345678901234567890123456789012345678901234';

interface TotpVector {
  /** Unix time in seconds, as published in the RFC's test table. */
  unixTimeSeconds: number;
  algorithm: OtpAlgorithm;
  expected: string;
}

export const RFC6238_TOTP_VECTORS: readonly TotpVector[] = [
  // T = 59
  { unixTimeSeconds: 59, algorithm: 'SHA1', expected: '94287082' },
  { unixTimeSeconds: 59, algorithm: 'SHA256', expected: '46119246' },
  { unixTimeSeconds: 59, algorithm: 'SHA512', expected: '90693936' },
  // T = 1111111109
  { unixTimeSeconds: 1111111109, algorithm: 'SHA1', expected: '07081804' },
  { unixTimeSeconds: 1111111109, algorithm: 'SHA256', expected: '68084774' },
  { unixTimeSeconds: 1111111109, algorithm: 'SHA512', expected: '25091201' },
  // T = 1111111111
  { unixTimeSeconds: 1111111111, algorithm: 'SHA1', expected: '14050471' },
  { unixTimeSeconds: 1111111111, algorithm: 'SHA256', expected: '67062674' },
  { unixTimeSeconds: 1111111111, algorithm: 'SHA512', expected: '99943326' },
  // T = 1234567890
  { unixTimeSeconds: 1234567890, algorithm: 'SHA1', expected: '89005924' },
  { unixTimeSeconds: 1234567890, algorithm: 'SHA256', expected: '91819424' },
  { unixTimeSeconds: 1234567890, algorithm: 'SHA512', expected: '93441116' },
  // T = 2000000000
  { unixTimeSeconds: 2000000000, algorithm: 'SHA1', expected: '69279037' },
  { unixTimeSeconds: 2000000000, algorithm: 'SHA256', expected: '90698825' },
  { unixTimeSeconds: 2000000000, algorithm: 'SHA512', expected: '38618901' },
  // T = 20000000000
  { unixTimeSeconds: 20000000000, algorithm: 'SHA1', expected: '65353130' },
  { unixTimeSeconds: 20000000000, algorithm: 'SHA256', expected: '77737706' },
  { unixTimeSeconds: 20000000000, algorithm: 'SHA512', expected: '47863826' },
];

function secretFor(algorithm: OtpAlgorithm): Buffer {
  switch (algorithm) {
    case 'SHA1':
      return Buffer.from(TOTP_SECRET_ASCII_SHA1, 'ascii');
    case 'SHA256':
      return Buffer.from(TOTP_SECRET_ASCII_SHA256, 'ascii');
    case 'SHA512':
      return Buffer.from(TOTP_SECRET_ASCII_SHA512, 'ascii');
  }
}

/**
 * Runs every published vector above against this project's hotp()/totp()
 * and throws OtpSelfCheckError naming the exact vector that failed if
 * any single one does not match. Cheap (fewer than 30 HMAC calls) enough
 * to run unconditionally at startup rather than being treated as an
 * optional test — see auth-service.ts, which calls this before exposing
 * any TOTP functionality and fails closed (refuses to register or verify
 * any code) if it throws.
 */
export function assertOtpImplementationIsCorrect(): void {
  const hotpSecret = Buffer.from(HOTP_SHA1_SECRET_ASCII, 'ascii');
  for (const vector of RFC4226_HOTP_VECTORS) {
    const actual = hotp(hotpSecret, vector.counter, { algorithm: 'SHA1', digits: 6 });
    if (actual !== vector.expected) {
      throw new OtpSelfCheckError(
        `HOTP self-check failed for RFC 4226 counter ${vector.counter}: ` +
          `expected ${vector.expected}, got ${actual}.`,
      );
    }
  }

  for (const vector of RFC6238_TOTP_VECTORS) {
    const secret = secretFor(vector.algorithm);
    const actual = totp(secret, vector.unixTimeSeconds * 1000, {
      algorithm: vector.algorithm,
      digits: 8,
      period: 30,
    });
    if (actual !== vector.expected) {
      throw new OtpSelfCheckError(
        `TOTP self-check failed for RFC 6238 vector (T=${vector.unixTimeSeconds}s, ` +
          `${vector.algorithm}): expected ${vector.expected}, got ${actual}.`,
      );
    }
  }
}
