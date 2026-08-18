/**
 * Schema validation for a parsed personal-vocabulary payload.
 *
 * Takes the output of vocabulary-json-parser.ts (already free of
 * duplicate keys and within the nesting-depth bound) and checks it
 * against the exact schema in vocabulary-types.ts. Every check here is
 * complete-payload validation: the first failing check rejects the WHOLE
 * file, and no subset of entries is ever partially applied.
 *
 * Error detail strings never echo the user's actual key or value text —
 * only fixed, non-content-bearing descriptions and, where useful, a
 * position/count — so a caller that surfaces or logs a rejection reason
 * can never leak private vocabulary content through it.
 */

import {
  UNSAFE_KEYS,
  VOCABULARY_LIMITS,
  VOCABULARY_SCHEMA_VERSION,
  type PersonalVocabulary,
  type VocabularyValidationResult,
} from './vocabulary-types';

const ALLOWED_TOP_LEVEL_FIELDS: ReadonlySet<string> = new Set(['schemaVersion', 'entries']);

export function validateVocabularyPayload(parsed: unknown): VocabularyValidationResult {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'not-an-object', detail: 'Top-level JSON value must be an object.' };
  }

  const record = parsed as Record<string, unknown>;

  for (const field of Object.keys(record)) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.has(field)) {
      return {
        ok: false,
        reason: 'unexpected-field',
        detail: 'The file contains a field outside the supported schema.',
      };
    }
  }

  if (typeof record.schemaVersion !== 'number' || record.schemaVersion !== VOCABULARY_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'unsupported-schema-version',
      detail: `Only schema version ${VOCABULARY_SCHEMA_VERSION} is supported.`,
    };
  }

  if (!('entries' in record)) {
    return { ok: false, reason: 'missing-entries', detail: 'The file is missing its "entries" field.' };
  }

  const entriesValue = record.entries;
  if (
    typeof entriesValue !== 'object' ||
    entriesValue === null ||
    Array.isArray(entriesValue)
  ) {
    return {
      ok: false,
      reason: 'entries-not-an-object',
      detail: '"entries" must be a flat object of key/value strings.',
    };
  }

  const entriesRecord = entriesValue as Record<string, unknown>;
  const keys = Object.keys(entriesRecord);

  if (keys.length > VOCABULARY_LIMITS.maxEntryCount) {
    return {
      ok: false,
      reason: 'too-many-entries',
      detail: `"entries" has more than the maximum of ${VOCABULARY_LIMITS.maxEntryCount} allowed entries.`,
    };
  }

  const sanitizedEntries: Record<string, string> = {};

  for (const key of keys) {
    if (UNSAFE_KEYS.has(key)) {
      return { ok: false, reason: 'unsafe-key', detail: 'An entry key is not permitted.' };
    }
    if (key.length === 0 || key.length > VOCABULARY_LIMITS.maxKeyLength) {
      return {
        ok: false,
        reason: 'key-too-long',
        detail: `An entry key exceeds the maximum length of ${VOCABULARY_LIMITS.maxKeyLength} characters, or is empty.`,
      };
    }

    const value = entriesRecord[key];
    if (typeof value !== 'string') {
      return {
        ok: false,
        reason: 'value-not-a-string',
        detail: 'Every entry value must be a plain string.',
      };
    }
    if (value.length > VOCABULARY_LIMITS.maxValueLength) {
      return {
        ok: false,
        reason: 'value-too-long',
        detail: `An entry value exceeds the maximum length of ${VOCABULARY_LIMITS.maxValueLength} characters.`,
      };
    }

    sanitizedEntries[key] = value;
  }

  const vocabulary: PersonalVocabulary = {
    schemaVersion: VOCABULARY_SCHEMA_VERSION,
    entries: sanitizedEntries,
  };

  return { ok: true, vocabulary };
}
