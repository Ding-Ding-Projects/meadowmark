/**
 * Atomic file writes for Windows.
 *
 * The naive pattern — write a temp file, then rename it over the target —
 * is correct on POSIX, where rename(2) unconditionally replaces the
 * destination. On Windows it is NOT sufficient by itself, for two
 * independent reasons this module exists to fix:
 *
 * 1. A FIXED temp file name (e.g. `${target}.tmp`) is shared by every
 *    concurrent writer of that target. Two saves racing each other can
 *    each open, write, and rename that same temp path, so one writer's
 *    rename can publish the OTHER writer's half-written bytes, or the temp
 *    file can vanish out from under a writer mid-write. We give every call
 *    a unique temp name instead.
 *
 * 2. `fs.rename` on Windows goes through `MoveFileEx`, which fails with a
 *    sharing violation whenever the DESTINATION happens to be open by
 *    anyone at that instant — not held open, just opened, even briefly.
 *    Ordinary background processes do this constantly: Windows Defender's
 *    real-time scanner opens a just-written file to scan it, the search
 *    indexer does the same, a sync client (OneDrive is nearly always
 *    running against the user profile) holds a read handle, and the app's
 *    own concurrent writers can race two renames onto one destination.
 *    Node surfaces this as EPERM, and sometimes EACCES or EBUSY. Without a
 *    retry, a save intermittently throws and the user's data is lost — and
 *    it happens *more* often on the best-protected machines, because their
 *    antivirus is the one opening the file.
 *
 * The rename itself is still one indivisible filesystem operation, so
 * retrying it cannot tear a write: either it fails and the destination is
 * untouched, or it succeeds and the destination is the new bytes, in full.
 *
 * This module does NOT branch on platform. The retry path runs everywhere,
 * so the behaviour under test is the behaviour shipped to every user.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Error codes worth retrying: the destination was momentarily open by
 * something else. Retrying just waits for that something else to let go. */
const RETRYABLE_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

/** Error codes that will never be fixed by retrying. */
const NON_RETRYABLE_CODES = new Set(['ENOENT', 'ENOSPC']);

export interface AtomicWriteOptions {
  /** Maximum rename attempts before giving up. Default 6. */
  maxAttempts?: number;
  /** Base delay in ms between attempts (grows with a small backoff). Default 40ms. */
  baseDelayMs?: number;
  /** File mode for the written file. Default 0o644. */
  mode?: number;
}

let tempCounter = 0;

function uniqueTempPath(targetPath: string): string {
  // pid + a monotonically increasing per-process counter + a small random
  // suffix: unique per call, even across two writers in the same process
  // racing the same target in the same millisecond.
  tempCounter = (tempCounter + 1) % Number.MAX_SAFE_INTEGER;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${targetPath}.${process.pid}.${tempCounter}.${rand}.tmp`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

async function renameWithRetry(
  tempPath: string,
  targetPath: string,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rename(tempPath, targetPath);
      return;
    } catch (err) {
      lastError = err;
      const code = errorCode(err);

      if (code && NON_RETRYABLE_CODES.has(code)) {
        // ENOENT means the temp file is gone (a caller bug elsewhere);
        // ENOSPC means the disk is full. Retrying cannot help either, and
        // retrying ENOENT would only delay a clearer error.
        break;
      }

      const isRetryable = code !== undefined && RETRYABLE_CODES.has(code);
      const isLastAttempt = attempt === maxAttempts;

      if (!isRetryable || isLastAttempt) {
        break;
      }

      // Small linear backoff: Defender/indexer/OneDrive hold the handle
      // for milliseconds, not seconds, so a handful of short waits over
      // roughly 300ms clears the vast majority of collisions.
      await sleep(baseDelayMs * attempt);
    }
  }

  // Never swallow the final error: callers commonly have a
  // did-it-persist contract, and a save that eventually lands is worth
  // more than one that silently doesn't.
  throw lastError;
}

/**
 * Writes `data` to `targetPath` atomically: write to a unique temp file
 * beside the target, then rename it into place, retrying the rename on
 * transient Windows sharing violations. On success, readers of
 * `targetPath` see either the previous complete contents or the new
 * complete contents — never a partial write.
 */
export async function atomicWriteFile(
  targetPath: string,
  data: string | Buffer,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const { maxAttempts = 6, baseDelayMs = 40, mode = 0o644 } = options;

  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });

  const tempPath = uniqueTempPath(targetPath);

  try {
    await fs.writeFile(tempPath, data, { mode });
  } catch (err) {
    await cleanupTemp(tempPath);
    throw err;
  }

  try {
    await renameWithRetry(tempPath, targetPath, maxAttempts, baseDelayMs);
  } catch (err) {
    await cleanupTemp(tempPath);
    throw err;
  }
}

/**
 * Convenience wrapper: JSON-serializes `value` and writes it atomically.
 * Pretty-printed so a corrupt/hand-inspected save file is at least
 * readable.
 */
export async function atomicWriteJson(
  targetPath: string,
  value: unknown,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const json = JSON.stringify(value, null, 2);
  await atomicWriteFile(targetPath, json, options);
}

async function cleanupTemp(tempPath: string): Promise<void> {
  try {
    await fs.unlink(tempPath);
  } catch {
    // Best-effort: if the temp file is already gone, or something else is
    // holding it, there's nothing more we can safely do here. The unique
    // per-call temp name means a leaked file here never collides with a
    // later write.
  }
}
