/**
 * Personal-vocabulary loading, validation, and local caching.
 *
 * The user supplies a local JSON file (via a file picker the orchestrator
 * wires up elsewhere — this module only needs the resulting bytes or
 * path). Until a valid file is supplied, `getActiveVocabulary()` returns
 * null and every caller must render its ORIGINAL shipped wording. This
 * module ships no built-in mappings, samples, or templates.
 *
 * Everything here is local-only: no network request is ever made, and no
 * vocabulary term, payload, source path, or filename is written to a log,
 * export, history entry, or telemetry. The only thing persisted is the
 * validated cache file itself, under this app's own private data
 * directory, which the caller controls entirely through this module's
 * API (load / clear).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteJson } from '../../atomic-write';
import { dataDir } from '../../store';
import { StrictJsonError, parseStrictJson } from './vocabulary-json-parser';
import { validateVocabularyPayload } from './vocabulary-schema';
import {
  VOCABULARY_LIMITS,
  type PersonalVocabulary,
  type VocabularyState,
  type VocabularyValidationResult,
} from './vocabulary-types';

const CACHE_FILE_NAME = 'personal-vocabulary-cache.json';

/**
 * Validates raw candidate bytes/text against the full personal-vocabulary
 * schema: size bound, strict JSON parsing (with duplicate-key and
 * nesting-depth rejection), then the field-by-field schema checks. Pure
 * and side-effect-free — does not touch the cache — so callers that only
 * want to check a file without applying it can use this directly.
 */
export function validateVocabularySource(raw: Buffer | string): VocabularyValidationResult {
  const byteLength = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(raw, 'utf8');
  if (byteLength > VOCABULARY_LIMITS.maxFileSizeBytes) {
    return {
      ok: false,
      reason: 'file-too-large',
      detail: `File exceeds the maximum allowed size of ${VOCABULARY_LIMITS.maxFileSizeBytes} bytes.`,
    };
  }

  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;

  let parsed: unknown;
  try {
    parsed = parseStrictJson(text, { maxDepth: VOCABULARY_LIMITS.maxNestingDepth });
  } catch (err) {
    if (err instanceof StrictJsonError) {
      return { ok: false, reason: err.kind, detail: 'The file is not valid JSON under the supported schema.' };
    }
    return { ok: false, reason: 'invalid-json', detail: 'The file could not be parsed as JSON.' };
  }

  return validateVocabularyPayload(parsed);
}

export class PersonalVocabularyLoader {
  private readonly cachePath: string;

  constructor(cacheFileName: string = CACHE_FILE_NAME) {
    this.cachePath = path.join(dataDir(), cacheFileName);
  }

  /**
   * Validates candidate bytes and, only on success, atomically replaces
   * the local cache with them. On rejection, the cache is left
   * COMPLETELY UNTOUCHED — a rejected file never applies, not even
   * partially, and never disturbs a previously valid vocabulary that was
   * already active.
   */
  async loadFromSource(raw: Buffer | string): Promise<VocabularyValidationResult> {
    const result = validateVocabularySource(raw);
    if (!result.ok) {
      return result;
    }

    await atomicWriteJson(this.cachePath, result.vocabulary);
    return result;
  }

  /**
   * Returns the currently active vocabulary, or null when no valid
   * vocabulary is in effect (no file ever supplied, the cache is
   * missing, or it fails re-validation). The cache is re-validated
   * against the full schema on every call rather than trusted as
   * already-checked: a hand-edited or corrupted cache file must fail
   * closed to shipped wording, exactly like a rejected source file would.
   */
  async getActiveVocabulary(): Promise<PersonalVocabulary | null> {
    const raw = await this.readCacheBytes();
    if (raw === null) {
      return null;
    }
    const result = validateVocabularySource(raw);
    return result.ok ? result.vocabulary : null;
  }

  /** Full state for a settings/status surface: no file yet, an active
   * validated vocabulary (with its entry count, never its content), or a
   * cache that failed re-validation and why. */
  async getState(): Promise<VocabularyState> {
    const raw = await this.readCacheBytes();
    if (raw === null) {
      return { kind: 'no-file' };
    }

    const result = validateVocabularySource(raw);
    if (!result.ok) {
      return { kind: 'rejected', reason: result.reason, detail: result.detail };
    }

    return {
      kind: 'active',
      entryCount: Object.keys(result.vocabulary.entries).length,
      loadedFromCachePath: this.cachePath,
    };
  }

  /** Purges the cache and restores shipped wording immediately. Safe to
   * call when no cache exists. */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.cachePath);
    } catch (err) {
      if (isEnoent(err)) {
        return;
      }
      throw err;
    }
  }

  /** Reads the cache file's raw bytes, or null when it does not exist.
   * Re-thrown for any error other than "the file is absent", since a
   * permissions error is a real problem the caller should not silently
   * treat as "no vocabulary supplied". */
  private async readCacheBytes(): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.cachePath);
    } catch (err) {
      if (isEnoent(err)) {
        return null;
      }
      throw err;
    }
  }
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ENOENT';
}

/**
 * Applies an active vocabulary's replacement for `key`, or returns
 * `shippedText` unchanged when there is no active vocabulary or no entry
 * for that key. This is the whole "apply" surface: callers look up their
 * own stable key and pass their own shipped English text as the fallback,
 * so a surface with no personal-vocabulary entry renders its unaltered
 * original wording, exactly per the fail-closed default.
 */
export function resolveVocabularyText(
  vocabulary: PersonalVocabulary | null,
  key: string,
  shippedText: string,
): string {
  if (vocabulary === null) {
    return shippedText;
  }
  const replacement = vocabulary.entries[key];
  return typeof replacement === 'string' ? replacement : shippedText;
}
