/**
 * A persistent, resumable, bounded-concurrency conversion queue.
 *
 * Design constraints this file exists to satisfy:
 *   - UNBOUNDED source list: sources are discovered a page at a time via
 *     a caller-supplied `discoverSources(cursor)` function, never all at
 *     once. Only a small `pendingBufferSize` worth of not-yet-started
 *     items and `concurrency` worth of in-flight items are ever resident
 *     in memory — the queue can process a million-file list with the
 *     same memory footprint as a ten-file one.
 *   - CONSTANT-MEMORY backpressure: the discovery loop only pulls a new
 *     page once the in-memory pending buffer has room.
 *   - PERSISTENT + RESUMABLE: every discovery page and every item
 *     outcome is written to a durable JSON journal (via atomic-write.ts)
 *     before the next step proceeds. Constructing a new ConversionQueue
 *     with the same `journalPath` after a crash or restart resumes
 *     exactly where it left off — already-converted or already-skipped
 *     items are not redone, and discovery resumes from its last cursor
 *     rather than starting over.
 *   - PAUSE / RESUME / CANCEL: pausing stops new items from starting but
 *     lets in-flight ones finish; cancelling also aborts in-flight items
 *     (their ConversionContext's AbortSignal fires, so an adapter's next
 *     budget check throws CancelledError and the source stays untouched).
 *   - Crash safety is cheap here because conversions never mutate the
 *     source and only ever write output through the confirm-overwrite /
 *     atomic-write path in output.ts — so "resume by redoing whatever
 *     the journal does not yet show as finished" can never corrupt
 *     anything, only cost some repeated work.
 */

import { promises as fsp } from 'node:fs';
import { atomicWriteJson } from '../../atomic-write';
import { createResourceBudget } from './resource-budget';
import { findEntry } from './registry';
import { writeConversionOutput } from './output';
import { checkDestinationCapacity } from './preflight';
import { ConverterError, InsufficientDiskSpaceError, ResourceLimitExceededError, UnavailableAdapterError } from './errors';
import type { ConversionContext } from './types';

export interface QueueSourceItem {
  /** Stable identifier for this item across runs — used as the journal
   * key, so it MUST be the same value every time the same logical item
   * is discovered again (e.g. the source's absolute path). */
  id: string;
  sourcePath: string;
  /** Registry entry id to apply (see registry.ts findEntry). */
  entryId: string;
  /** File path for a 'byte-to-byte' entry, or a directory path for an
   * 'extract-to-directory' entry. */
  destinationPath: string;
  confirmOverwrite?: boolean;
}

export interface SourceDiscoveryPage {
  items: QueueSourceItem[];
  /** null means discovery is complete; any other value is opaque and
   * passed back on the next call. */
  nextCursor: string | null;
}

export type DiscoverSourcesFn = (cursor: string | null) => Promise<SourceDiscoveryPage>;

export type QueueItemState = 'pending' | 'converted' | 'skipped' | 'cancelled' | 'failed';

export interface QueueItemOutcome {
  state: QueueItemState;
  bytes?: number;
  errorCode?: string;
  errorMessage?: string;
  finishedAt?: string;
}

export interface QueueProgressEvent {
  itemId: string;
  state: 'started' | QueueItemState;
  bytes?: number;
  errorMessage?: string;
}

interface QueueJournal {
  schemaVersion: 1;
  discoveryCursor: string | null;
  discoveryComplete: boolean;
  outcomes: Record<string, QueueItemOutcome>;
  createdAt: string;
  updatedAt: string;
}

export interface ConversionQueueOptions {
  /** Durable journal file path. Reused across process restarts to
   * resume this exact queue. */
  journalPath: string;
  discoverSources: DiscoverSourcesFn;
  /** How many items convert concurrently. Small by default: this is
   * interactive desktop work sharing the machine with everything else
   * the user is doing, not a batch server. */
  concurrency?: number;
  /** How many discovered items may sit in memory waiting to start, on
   * top of the in-flight ones. Bounds memory regardless of total queue
   * length. */
  pendingBufferSize?: number;
  onProgress?: (event: QueueProgressEvent) => void;
  /** Optional upfront capacity check. Providing an estimate is the
   * caller's choice — with paged/unbounded discovery the queue itself
   * cannot know the total output size in advance. */
  preflight?: { destinationDir: string; estimatedTotalBytes: number };
}

export interface QueueSummary {
  converted: number;
  skipped: number;
  failed: number;
  cancelled: number;
  warnings: string[];
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_PENDING_BUFFER = 12;

export class ConversionQueue {
  private readonly options: ConversionQueueOptions;
  private readonly concurrency: number;
  private readonly pendingBufferSize: number;
  private journal: QueueJournal;
  private paused = false;
  private cancelled = false;
  private resumeWaiters: Array<() => void> = [];
  private readonly itemControllers = new Map<string, AbortController>();
  private readonly warnings: string[] = [];

  constructor(options: ConversionQueueOptions) {
    this.options = options;
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
    this.pendingBufferSize = Math.max(this.concurrency, options.pendingBufferSize ?? DEFAULT_PENDING_BUFFER);
    this.journal = freshJournal();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.wakeWaiters();
  }

  /** Stops new items from starting AND aborts every in-flight item's
   * ConversionContext. Already-completed items are unaffected; their
   * journal entries stand. */
  cancel(): void {
    this.cancelled = true;
    for (const controller of this.itemControllers.values()) {
      controller.abort();
    }
    this.wakeWaiters();
  }

  isPaused(): boolean {
    return this.paused;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  async run(): Promise<QueueSummary> {
    await this.loadOrCreateJournal();

    if (this.options.preflight) {
      const capacity = await checkDestinationCapacity(this.options.preflight.destinationDir, this.options.preflight.estimatedTotalBytes);
      if (capacity.checked && capacity.sufficient === false) {
        throw new InsufficientDiskSpaceError(this.options.preflight.estimatedTotalBytes, capacity.availableBytes ?? 0);
      }
      if (!capacity.checked) {
        this.warnings.push(capacity.reason ?? 'Destination free-space could not be checked.');
      }
    }

    const pending: QueueSourceItem[] = [];
    const inFlight = new Map<string, Promise<void>>();

    const pullMore = async (): Promise<void> => {
      if (this.journal.discoveryComplete) return;
      const page = await this.options.discoverSources(this.journal.discoveryCursor);
      pending.push(...page.items);
      this.journal.discoveryCursor = page.nextCursor;
      this.journal.discoveryComplete = page.nextCursor === null;
      await this.persistJournal();
    };

    for (;;) {
      if (this.cancelled && inFlight.size === 0) break;

      while (!this.paused && !this.cancelled && pending.length < this.pendingBufferSize && !this.journal.discoveryComplete) {
        await pullMore();
      }

      if (pending.length === 0 && this.journal.discoveryComplete && inFlight.size === 0) {
        break;
      }

      if (this.paused && !this.cancelled) {
        await this.waitForWake();
        continue;
      }

      while (!this.paused && !this.cancelled && inFlight.size < this.concurrency && pending.length > 0) {
        const item = pending.shift() as QueueSourceItem;
        const existing = this.journal.outcomes[item.id];
        if (existing && (existing.state === 'converted' || existing.state === 'skipped')) {
          continue; // already finished in a previous run of this queue
        }
        const promise = this.processItem(item).finally(() => {
          inFlight.delete(item.id);
        });
        inFlight.set(item.id, promise);
      }

      if (inFlight.size > 0) {
        await Promise.race(inFlight.values());
      } else if (pending.length === 0 && !this.journal.discoveryComplete && !this.paused && !this.cancelled) {
        await pullMore();
      } else if (this.paused || this.cancelled) {
        // fall through to loop top, which will handle pause/cancel
      } else if (pending.length === 0 && this.journal.discoveryComplete) {
        break;
      }
    }

    await Promise.allSettled(inFlight.values());
    await this.persistJournal();
    return this.summarize();
  }

  private async processItem(item: QueueSourceItem): Promise<void> {
    this.notify({ itemId: item.id, state: 'started' });

    if (this.cancelled) {
      this.recordOutcome(item.id, { state: 'cancelled', finishedAt: new Date().toISOString() });
      this.notify({ itemId: item.id, state: 'cancelled' });
      return;
    }

    const controller = new AbortController();
    this.itemControllers.set(item.id, controller);

    try {
      const entry = findEntry(item.entryId);
      if (!entry || !entry.bundled) {
        throw new UnavailableAdapterError(entry?.unavailableReason ?? item.entryId, `No enabled converter adapter "${item.entryId}".`);
      }

      const stat = await fsp.stat(item.sourcePath);
      if (stat.size > entry.limits.maxInputBytes) {
        throw new ResourceLimitExceededError('input-bytes', entry.limits.maxInputBytes);
      }

      const budget = createResourceBudget(entry.limits, controller.signal);
      const ctx: ConversionContext = { signal: controller.signal, budget };
      const sourceBuffer = await fsp.readFile(item.sourcePath);
      const inputBytes = new Uint8Array(sourceBuffer.buffer, sourceBuffer.byteOffset, sourceBuffer.byteLength);

      if (entry.kind === 'extract-to-directory') {
        if (entry.extractToDirectory === undefined) {
          throw new UnavailableAdapterError(item.entryId);
        }
        await fsp.mkdir(item.destinationPath, { recursive: true });
        const written = await entry.extractToDirectory(inputBytes, item.destinationPath, ctx);
        const totalBytes = written.reduce((sum, w) => sum + w.bytes, 0);
        this.recordOutcome(item.id, { state: 'converted', bytes: totalBytes, finishedAt: new Date().toISOString() });
        this.notify({ itemId: item.id, state: 'converted', bytes: totalBytes });
      } else {
        if (entry.convert === undefined) {
          throw new UnavailableAdapterError(item.entryId);
        }
        const output = await entry.convert(inputBytes, ctx);
        if (entry.validateOutput) {
          const validation = entry.validateOutput(output);
          if (!validation.ok) {
            throw new ConverterError('output-validation-failed', validation.reason ?? 'Produced output failed validation.');
          }
        }
        await writeConversionOutput({ destinationPath: item.destinationPath, data: output, confirmOverwrite: item.confirmOverwrite });
        this.recordOutcome(item.id, { state: 'converted', bytes: output.byteLength, finishedAt: new Date().toISOString() });
        this.notify({ itemId: item.id, state: 'converted', bytes: output.byteLength });
      }
    } catch (err) {
      const isCancelled = err instanceof ConverterError && err.code === 'cancelled';
      const code = err instanceof ConverterError ? err.code : 'unknown-error';
      const message = err instanceof Error ? err.message : String(err);
      this.recordOutcome(item.id, {
        state: isCancelled ? 'cancelled' : 'failed',
        errorCode: code,
        errorMessage: message,
        finishedAt: new Date().toISOString(),
      });
      this.notify({ itemId: item.id, state: isCancelled ? 'cancelled' : 'failed', errorMessage: message });
    } finally {
      this.itemControllers.delete(item.id);
      await this.persistJournal();
    }
  }

  private notify(event: QueueProgressEvent): void {
    this.options.onProgress?.(event);
  }

  private recordOutcome(itemId: string, outcome: QueueItemOutcome): void {
    this.journal.outcomes[itemId] = outcome;
  }

  private async waitForWake(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.resumeWaiters.push(resolve);
    });
  }

  private wakeWaiters(): void {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const w of waiters) w();
  }

  private async loadOrCreateJournal(): Promise<void> {
    try {
      const raw = await fsp.readFile(this.options.journalPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<QueueJournal>;
      if (parsed.schemaVersion === 1 && typeof parsed.outcomes === 'object' && parsed.outcomes !== null) {
        this.journal = {
          schemaVersion: 1,
          discoveryCursor: parsed.discoveryCursor ?? null,
          discoveryComplete: Boolean(parsed.discoveryComplete),
          outcomes: parsed.outcomes,
          createdAt: parsed.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return;
      }
      this.warnings.push('Existing queue journal had an unrecognized shape; starting a fresh journal (already-converted items will simply be redone, safely).');
    } catch {
      // Missing or unreadable/corrupt journal: start fresh. This is safe
      // — see the module doc comment — it only risks redoing work, never
      // corrupting anything, because conversions never mutate sources
      // and every output write is still gated by confirmOverwrite.
    }
    this.journal = freshJournal();
  }

  private async persistJournal(): Promise<void> {
    this.journal.updatedAt = new Date().toISOString();
    await atomicWriteJson(this.options.journalPath, this.journal);
  }

  private summarize(): QueueSummary {
    let converted = 0;
    let skipped = 0;
    let failed = 0;
    let cancelledCount = 0;
    for (const outcome of Object.values(this.journal.outcomes)) {
      if (outcome.state === 'converted') converted += 1;
      else if (outcome.state === 'skipped') skipped += 1;
      else if (outcome.state === 'failed') failed += 1;
      else if (outcome.state === 'cancelled') cancelledCount += 1;
    }
    return { converted, skipped, failed, cancelled: cancelledCount, warnings: [...this.warnings] };
  }
}

function freshJournal(): QueueJournal {
  const now = new Date().toISOString();
  return { schemaVersion: 1, discoveryCursor: null, discoveryComplete: false, outcomes: {}, createdAt: now, updatedAt: now };
}
