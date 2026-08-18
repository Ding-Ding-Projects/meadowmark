/**
 * Validation for the relative "record path" identifiers callers use to
 * name a tracked record (e.g. "saves/riverside-farm.json",
 * "settings.json"). These become real file paths inside the isolated
 * history repository, so they must never be allowed to escape it.
 */

import path from 'node:path';

const WINDOWS_DRIVE_RE = /^[a-zA-Z]:/;

/**
 * Normalizes and validates a caller-supplied record path. Returns the
 * sanitized, forward-slash relative path on success, or throws a plain
 * Error with a human-readable reason on rejection. Never touches the
 * filesystem — this is pure string validation.
 *
 * Rejects: empty/whitespace-only input, absolute paths (POSIX or
 * Windows-drive-letter), backslashes (Windows separators are normalized
 * to forward slashes instead of accepted as-is, so a record path is
 * portable and unambiguous), and any path whose normalized form escapes
 * the repository root via `..` segments.
 */
export function sanitizeRecordPath(recordPath: string): string {
  if (typeof recordPath !== 'string' || recordPath.trim().length === 0) {
    throw new Error('recordPath must be a non-empty string.');
  }

  const forwardSlashed = recordPath.replace(/\\/g, '/');

  if (WINDOWS_DRIVE_RE.test(forwardSlashed)) {
    throw new Error(`recordPath must be relative, but got "${recordPath}".`);
  }

  if (forwardSlashed.startsWith('/')) {
    throw new Error(`recordPath must be relative, but got "${recordPath}".`);
  }

  const normalized = path.posix.normalize(forwardSlashed);

  if (normalized === '.' || normalized === '') {
    throw new Error(`recordPath must name a file, but got "${recordPath}".`);
  }

  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(
      `recordPath must stay inside the history repository, but got "${recordPath}".`,
    );
  }

  return normalized;
}
