/**
 * Destination storage-capacity preflight. Checked before a queue starts
 * writing (when the caller can supply an estimate) so a batch fails
 * closed with a clear message instead of filling the destination volume
 * and failing partway through with a confusing ENOSPC on some arbitrary
 * file.
 */

import { promises as fsp } from 'node:fs';

export interface DestinationCapacityResult {
  /** False when this runtime/platform could not report free space at
   * all (fail-closed information, not a guess). */
  checked: boolean;
  availableBytes?: number;
  sufficient?: boolean;
  reason?: string;
}

interface StatfsLike {
  bavail: number;
  bsize: number;
}

export async function checkDestinationCapacity(destinationDir: string, estimatedBytes: number): Promise<DestinationCapacityResult> {
  const statfsFn = (fsp as unknown as { statfs?: (p: string) => Promise<StatfsLike> }).statfs;
  if (typeof statfsFn !== 'function') {
    return {
      checked: false,
      reason: 'This runtime does not expose filesystem free-space statistics (fs.promises.statfs is unavailable), so free space could not be checked.',
    };
  }
  try {
    const stats = await statfsFn(destinationDir);
    const availableBytes = stats.bavail * stats.bsize;
    return { checked: true, availableBytes, sufficient: availableBytes >= estimatedBytes };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { checked: false, reason: `Could not determine free disk space at "${destinationDir}": ${reason}` };
  }
}
