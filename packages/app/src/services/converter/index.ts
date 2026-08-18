/**
 * Public API surface of the universal file converter subsystem.
 *
 * This module is the only thing the rest of the app (IPC handlers, main
 * process wiring) should import from — everything else under
 * services/converter/ is an implementation detail reached through here.
 */

import { promises as fsp } from 'node:fs';
import { createResourceBudget } from './resource-budget';
import { findEntry } from './registry';
import { writeConversionOutput } from './output';
import { ConverterError, ResourceLimitExceededError, UnavailableAdapterError } from './errors';
import type { ConversionContext, ExtractedEntry, RegistryEntry } from './types';

// ---- registry / detection --------------------------------------------
export {
  getConverterRegistry,
  listCategories,
  listEntriesForCategory,
  findEntry,
  getTargetsForSource,
  getEnabledTargetsForSource,
  searchRegistry,
} from './registry';

export { detectSourceFile, detectFromBytes, readBoundedPrefix, readBoundedSuffix } from './detect';

// ---- output / preflight -------------------------------------------------
export { writeConversionOutput } from './output';
export { checkDestinationCapacity } from './preflight';
export type { WriteConversionOutputOptions } from './output';
export type { DestinationCapacityResult } from './preflight';

// ---- queue ----------------------------------------------------------------
export { ConversionQueue } from './queue';
export type {
  ConversionQueueOptions,
  DiscoverSourcesFn,
  QueueItemOutcome,
  QueueItemState,
  QueueProgressEvent,
  QueueSourceItem,
  QueueSummary,
  SourceDiscoveryPage,
} from './queue';

// ---- types ------------------------------------------------------------------
export type {
  AdapterOutputValidation,
  ByteSignature,
  ConversionContext,
  ConverterCategory,
  ConvertFn,
  DetectionCandidate,
  ExtractedEntry,
  ExtractFn,
  FormatId,
  LossDisclosureItem,
  RegistryEntry,
  ResourceBudget,
  ResourceLimits,
} from './types';
export { CONVERTER_CATEGORIES } from './types';

// ---- errors -----------------------------------------------------------------
export {
  CancelledError,
  ConverterError,
  DestinationExistsError,
  EncryptedInputError,
  InsufficientDiskSpaceError,
  MalformedInputError,
  ResourceLimitExceededError,
  UnavailableAdapterError,
  UnknownFormatError,
  UnsupportedConstructError,
} from './errors';

export type { StructuredValue } from './structured/model';

// ---- single-file convenience API -------------------------------------------

export interface ConvertFileResult {
  entry: RegistryEntry;
  bytesWritten: number;
}

export interface ConvertFileOptions {
  confirmOverwrite?: boolean;
  signal?: AbortSignal;
}

/**
 * Runs one 'byte-to-byte' adapter end to end: reads the source file
 * (rejecting it up front if larger than the adapter's declared limit),
 * runs the conversion under a fresh bounded resource budget, validates
 * the output if the adapter declares a validator, and writes it via
 * output.ts (atomic write, confirm-overwrite gate). The source file is
 * never modified.
 *
 * For batches, unbounded-length source lists, or anything needing
 * pause/resume/crash-recovery, use ConversionQueue instead — this
 * function is the simple one-shot path.
 */
export async function convertFile(sourcePath: string, entryId: string, destinationPath: string, options: ConvertFileOptions = {}): Promise<ConvertFileResult> {
  const entry = findEntry(entryId);
  if (!entry) {
    throw new UnavailableAdapterError(entryId, `No such converter adapter "${entryId}".`);
  }
  if (!entry.bundled || entry.convert === undefined) {
    throw new UnavailableAdapterError(entry.unavailableReason ?? entryId, `"${entry.userFacingName}" is not available in this build: ${entry.unavailableReason ?? 'missing dependency'}`);
  }

  const stat = await fsp.stat(sourcePath);
  if (stat.size > entry.limits.maxInputBytes) {
    throw new ResourceLimitExceededError('input-bytes', entry.limits.maxInputBytes, `"${sourcePath}" is ${stat.size} bytes, over this adapter's ${entry.limits.maxInputBytes}-byte limit.`);
  }

  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const budget = createResourceBudget(entry.limits, controller.signal);
  const ctx: ConversionContext = { signal: controller.signal, budget };

  const sourceBuffer = await fsp.readFile(sourcePath);
  const inputBytes = new Uint8Array(sourceBuffer.buffer, sourceBuffer.byteOffset, sourceBuffer.byteLength);

  const output = await entry.convert(inputBytes, ctx);

  if (entry.validateOutput) {
    const validation = entry.validateOutput(output);
    if (!validation.ok) {
      throw new ConverterError('output-validation-failed', validation.reason ?? `"${entry.userFacingName}" produced output that failed its own validator.`);
    }
  }

  await writeConversionOutput({ destinationPath, data: output, confirmOverwrite: options.confirmOverwrite });
  return { entry, bytesWritten: output.byteLength };
}

export interface ExtractArchiveResult {
  entry: RegistryEntry;
  entries: ExtractedEntry[];
}

/** Runs one 'extract-to-directory' adapter (e.g. ZIP extraction) end to
 * end against a single archive file and destination directory. */
export async function extractArchive(sourcePath: string, entryId: string, destinationDir: string, options: ConvertFileOptions = {}): Promise<ExtractArchiveResult> {
  const entry = findEntry(entryId);
  if (!entry) {
    throw new UnavailableAdapterError(entryId, `No such converter adapter "${entryId}".`);
  }
  if (!entry.bundled || entry.extractToDirectory === undefined) {
    throw new UnavailableAdapterError(entry.unavailableReason ?? entryId, `"${entry.userFacingName}" is not available in this build: ${entry.unavailableReason ?? 'missing dependency'}`);
  }

  const stat = await fsp.stat(sourcePath);
  if (stat.size > entry.limits.maxInputBytes) {
    throw new ResourceLimitExceededError('input-bytes', entry.limits.maxInputBytes, `"${sourcePath}" is ${stat.size} bytes, over this adapter's ${entry.limits.maxInputBytes}-byte limit.`);
  }

  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const budget = createResourceBudget(entry.limits, controller.signal);
  const ctx: ConversionContext = { signal: controller.signal, budget };

  await fsp.mkdir(destinationDir, { recursive: true });
  const sourceBuffer = await fsp.readFile(sourcePath);
  const inputBytes = new Uint8Array(sourceBuffer.buffer, sourceBuffer.byteOffset, sourceBuffer.byteLength);
  const entries = await entry.extractToDirectory(inputBytes, destinationDir, ctx);
  return { entry, entries };
}
