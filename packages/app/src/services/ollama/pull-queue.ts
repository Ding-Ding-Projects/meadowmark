/**
 * Batch model pulls. This is the "cart" the top-level requirements refer
 * to, and it means exactly one thing: a bounded-concurrency queue of local
 * downloads through Ollama's own /api/pull. There is no price, no
 * purchase, no checkout, no account, no subscription anywhere near this
 * module - "adding to the batch" schedules a pull, nothing else.
 *
 * State is durable (persisted through JsonStore) so a batch can be resumed
 * after the app restarts, reconciled against whatever Ollama actually has
 * installed by the time it resumes, rather than blindly re-downloading
 * models that already completed.
 */

import crypto from 'node:crypto';
import { JsonStore } from '../../store';
import { LoopbackClient, OllamaClientError } from './loopback-client';
import { listInstalledModels } from './models';
import type {
  CatalogTag,
  HardwareSnapshot,
  InstalledModel,
  PullBatchEstimate,
  PullBatchItem,
  PullBatchState,
  PullItemState,
} from './types';

const DEFAULT_PARALLELISM = 2;
const MAX_PARALLELISM = 6;
/** Ollama stores the raw blob plus a manifest plus transient extraction
 * space; this conservative multiplier is disclosed to the user rather than
 * silently assumed. */
const DISK_HEADROOM_MULTIPLIER = 1.15;

interface PullProgressLine {
  status?: unknown;
  digest?: unknown;
  total?: unknown;
  completed?: unknown;
  error?: unknown;
}

function newId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Estimate (preflight, shown before anything starts)
// ---------------------------------------------------------------------------

export function estimateBatch(
  references: string[],
  sizeByReference: Map<string, number>,
  installed: InstalledModel[],
  hardware: HardwareSnapshot | null,
): PullBatchEstimate {
  const installedSet = new Set(installed.map((m) => m.name));
  const items = references.map((reference) => {
    const alreadyInstalled = installedSet.has(reference);
    const estimatedSizeBytes = sizeByReference.get(reference) ?? null;
    return { reference, estimatedSizeBytes, alreadyInstalled };
  });

  const aggregateEstimatedBytes = items.reduce((sum, item) => {
    if (item.alreadyInstalled || item.estimatedSizeBytes === null) return sum;
    return sum + item.estimatedSizeBytes;
  }, 0);

  const conservativeAdditionalDiskBytes = Math.round(
    aggregateEstimatedBytes * DISK_HEADROOM_MULTIPLIER,
  );

  const currentFreeDiskBytes = hardware?.freeDiskBytes ?? null;
  let fitsOnDisk: 'yes' | 'no' | 'unknown' = 'unknown';
  if (currentFreeDiskBytes !== null) {
    fitsOnDisk = currentFreeDiskBytes >= conservativeAdditionalDiskBytes ? 'yes' : 'no';
  }

  return {
    items,
    aggregateEstimatedBytes,
    conservativeAdditionalDiskBytes,
    currentFreeDiskBytes,
    fitsOnDisk,
  };
}

/** Convenience for building the `sizeByReference` map estimateBatch needs
 * from a flat list of catalogue tags. */
export function sizeMapFromCatalogTags(tags: CatalogTag[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const tag of tags) {
    if (tag.sizeBytes !== undefined) map.set(tag.fullReference, tag.sizeBytes);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface PullQueueStoreShape {
  /** Most recent batches, newest first, bounded below. */
  batches: PullBatchState[];
}

const MAX_STORED_BATCHES = 20;

class PullQueueStore {
  private readonly store: JsonStore<PullQueueStoreShape>;

  constructor() {
    this.store = new JsonStore<PullQueueStoreShape>({
      fileName: 'ollama-pull-batches.json',
      schemaVersion: 1,
      defaultValue: () => ({ batches: [] }),
    });
  }

  async list(): Promise<PullBatchState[]> {
    return (await this.store.load()).batches;
  }

  async get(batchId: string): Promise<PullBatchState | null> {
    const batches = await this.list();
    return batches.find((b) => b.id === batchId) ?? null;
  }

  async upsert(batch: PullBatchState): Promise<void> {
    const batches = await this.list();
    const idx = batches.findIndex((b) => b.id === batch.id);
    if (idx >= 0) {
      batches[idx] = batch;
    } else {
      batches.unshift(batch);
    }
    await this.store.save({ batches: batches.slice(0, MAX_STORED_BATCHES) });
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export class PullQueueManager {
  private readonly store = new PullQueueStore();
  private readonly abortControllers = new Map<string, AbortController>();
  /** batchId -> true while a run loop is actively driving it, so a caller
   * cannot accidentally start the same batch twice concurrently. */
  private readonly activeRuns = new Set<string>();

  async listBatches(): Promise<PullBatchState[]> {
    return this.store.list();
  }

  async getBatch(batchId: string): Promise<PullBatchState | null> {
    return this.store.get(batchId);
  }

  async createBatch(
    references: string[],
    parallelism: number = DEFAULT_PARALLELISM,
  ): Promise<PullBatchState> {
    const now = new Date().toISOString();
    const clampedParallelism = Math.max(1, Math.min(MAX_PARALLELISM, Math.floor(parallelism)));
    const uniqueReferences = Array.from(new Set(references));
    const batch: PullBatchState = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      parallelism: clampedParallelism,
      cancelled: false,
      items: uniqueReferences.map((reference) => ({
        id: newId(),
        reference,
        state: 'queued',
        downloadedBytes: 0,
        totalBytes: null,
        estimatedSizeBytes: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        attempts: 0,
      })),
    };
    await this.store.upsert(batch);
    return batch;
  }

  cancelBatch(batchId: string): void {
    const controller = this.abortControllers.get(batchId);
    controller?.abort();
  }

  /**
   * Runs (or resumes) a batch. Reconciles against Ollama's current
   * installed set first, so anything already present is marked 'skipped'
   * rather than re-downloaded - safe to call again after a restart.
   * `onProgress` is invoked after every state change so a caller can drive
   * a live UI; it is never required for correctness.
   */
  async run(
    batchId: string,
    client: LoopbackClient,
    onProgress?: (batch: PullBatchState) => void,
  ): Promise<PullBatchState> {
    if (this.activeRuns.has(batchId)) {
      throw new Error(`Pull batch ${batchId} is already running.`);
    }
    const loaded = await this.store.get(batchId);
    if (!loaded) {
      throw new Error(`Pull batch ${batchId} does not exist.`);
    }
    // Bound to a distinct non-nullable name so every read below is
    // unambiguous, including inside the nested closures further down -
    // `loaded`/`current` are never reassigned to null after this point.
    const current: PullBatchState = loaded;

    this.activeRuns.add(batchId);
    const controller = new AbortController();
    this.abortControllers.set(batchId, controller);

    // Writes to the durable store are serialized through this promise
    // chain so that a burst of per-item progress updates (each of which
    // reads-then-writes the whole batch file) can never race and clobber
    // one another - every persist() call waits for the previous one.
    let persistChain: Promise<void> = Promise.resolve();
    const persistAndNotify = (): void => {
      persistChain = persistChain.then(async () => {
        await this.persist(current);
        onProgress?.(current);
      });
    };

    try {
      const installed = await listInstalledModels(client).catch(() => [] as InstalledModel[]);
      const installedSet = new Set(installed.map((m) => m.name));
      for (const item of current.items) {
        if (item.state === 'complete') continue;
        if (installedSet.has(item.reference) && item.state === 'queued') {
          item.state = 'skipped';
          item.finishedAt = new Date().toISOString();
        }
      }
      await this.persist(current);
      onProgress?.(current);

      const pending = current.items.filter(
        (item) => item.state === 'queued' || item.state === 'failed',
      );
      let cursor = 0;
      const workers: Promise<void>[] = [];
      const runNext = async (): Promise<void> => {
        for (;;) {
          if (controller.signal.aborted) return;
          const index = cursor;
          cursor += 1;
          const item = pending[index];
          if (!item) return;
          await this.runOne(item, client, controller.signal, persistAndNotify);
        }
      };
      for (let i = 0; i < current.parallelism; i++) {
        workers.push(runNext());
      }
      await Promise.all(workers);
      await persistChain;

      if (controller.signal.aborted) {
        current.cancelled = true;
        for (const item of current.items) {
          if (item.state === 'queued' || item.state === 'downloading' || item.state === 'verifying') {
            item.state = 'cancelled';
            item.finishedAt = new Date().toISOString();
          }
        }
      }
      await this.persist(current);
      onProgress?.(current);
      return current;
    } finally {
      this.activeRuns.delete(batchId);
      this.abortControllers.delete(batchId);
    }
  }

  private async persist(batch: PullBatchState): Promise<PullBatchState> {
    batch.updatedAt = new Date().toISOString();
    await this.store.upsert(batch);
    return batch;
  }

  private async runOne(
    item: PullBatchItem,
    client: LoopbackClient,
    signal: AbortSignal,
    onChange: () => void,
  ): Promise<void> {
    item.state = 'downloading';
    item.startedAt = new Date().toISOString();
    item.error = null;
    item.attempts += 1;
    onChange();

    try {
      await client.requestStream<PullProgressLine>(
        'POST',
        '/api/pull',
        { model: item.reference, stream: true },
        (line) => {
          if (typeof line.error === 'string' && line.error.length > 0) {
            throw new OllamaClientError(line.error, 'bad-payload');
          }
          if (typeof line.total === 'number') item.totalBytes = line.total;
          if (typeof line.completed === 'number') item.downloadedBytes = line.completed;
          if (typeof line.status === 'string' && line.status.includes('verifying')) {
            item.state = 'verifying';
          }
          onChange();
        },
        signal,
      );
      item.state = 'complete';
      item.finishedAt = new Date().toISOString();
    } catch (err) {
      if (signal.aborted) {
        item.state = 'cancelled';
      } else {
        item.state = 'failed';
        item.error = err instanceof Error ? err.message : String(err);
      }
      item.finishedAt = new Date().toISOString();
    }
    onChange();
  }
}
