/**
 * Password hashing for toy locks.
 *
 * A toy lock is just for fun, but its passwords still verify against a
 * scrypt hash rather than a stored plaintext password -- that costs
 * nothing extra to do correctly, and "we stored your password in the
 * clear" is a bad sentence to ever have to write regardless of how low
 * the stakes are. This module never returns, logs, or otherwise exposes
 * the password itself; only hash-vs-hash comparison happens here.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

/** scrypt cost parameters. maxmem is set generously above scrypt's default
 * so N=16384 (a reasonable interactive-login cost) does not hit Node's
 * internal 32MB ceiling. */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const SALT_BYTES = 16;

export interface PasswordHash {
  algorithm: 'scrypt';
  saltHex: string;
  hashHex: string;
  keyLen: number;
  N: number;
  r: number;
  p: number;
}

async function deriveKey(
  password: string,
  salt: Buffer,
  keyLen: number,
  N: number,
  r: number,
  p: number,
): Promise<Buffer> {
  // Normalize so the same password typed on different keyboards/IMEs
  // produces the same bytes.
  return scrypt(password.normalize('NFKC'), salt, keyLen, { N, r, p, maxmem: SCRYPT_MAXMEM });
}

/** Hashes `password` with a fresh random salt. The result is what gets
 * persisted; the password itself is discarded the moment this returns. */
export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await deriveKey(password, salt, SCRYPT_KEY_LEN, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return {
    algorithm: 'scrypt',
    saltHex: salt.toString('hex'),
    hashHex: derived.toString('hex'),
    keyLen: SCRYPT_KEY_LEN,
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  };
}

/** Verifies `password` against a previously stored hash. Uses the cost
 * parameters recorded IN the hash (not the current module constants) so
 * an older hash keeps verifying correctly if the defaults ever change. */
export async function verifyPassword(password: string, hash: PasswordHash): Promise<boolean> {
  const salt = Buffer.from(hash.saltHex, 'hex');
  const stored = Buffer.from(hash.hashHex, 'hex');
  const derived = await deriveKey(password, salt, hash.keyLen, hash.N, hash.r, hash.p);
  if (derived.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(derived, stored);
}
