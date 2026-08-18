import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../../atomic-write.js';

/**
 * A small on-disk marker recording "we just told the OS-level Squirrel
 * installer to apply version X". It is written immediately before
 * {@link UpdaterService.applyUpdate} hands off to Squirrel, and checked
 * on the following app startup by
 * {@link UpdaterService.checkPendingInstallOnStartup}.
 *
 * This is how rollback is detected honestly, without needing to hook
 * into Squirrel's own install machinery: if the marker says "expected
 * version X" and the app that started up reports a different
 * `app.getVersion()`, Squirrel did not apply the update (or applied it
 * and then rolled it back), and the caller is told exactly that rather
 * than nothing at all.
 */

export interface PendingInstallMarker {
  readonly expectedVersion: string;
  readonly requestedAt: string;
}

const MARKER_FILE_NAME = 'pending-install.json';

function markerPath(stagingDir: string): string {
  return path.join(stagingDir, MARKER_FILE_NAME);
}

/** Records that an install to `expectedVersion` was just requested. */
export async function writePendingInstallMarker(stagingDir: string, expectedVersion: string): Promise<void> {
  const marker: PendingInstallMarker = { expectedVersion, requestedAt: new Date().toISOString() };
  await fs.mkdir(stagingDir, { recursive: true });
  await atomicWriteJson(markerPath(stagingDir), marker);
}

/** Reads a previously written marker, or null when none exists or it is unreadable/malformed. */
export async function readPendingInstallMarker(stagingDir: string): Promise<PendingInstallMarker | null> {
  try {
    const raw = await fs.readFile(markerPath(stagingDir), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PendingInstallMarker>;
    if (typeof parsed.expectedVersion !== 'string' || typeof parsed.requestedAt !== 'string') {
      return null;
    }
    return { expectedVersion: parsed.expectedVersion, requestedAt: parsed.requestedAt };
  } catch {
    return null;
  }
}

/** Removes the marker once it has been consulted, successfully or not. */
export async function clearPendingInstallMarker(stagingDir: string): Promise<void> {
  try {
    await fs.unlink(markerPath(stagingDir));
  } catch {
    // Already gone; nothing to clean up.
  }
}
