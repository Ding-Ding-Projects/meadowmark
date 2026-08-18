/**
 * Types for the personal-vocabulary feature: a local JSON file the user
 * supplies that remaps user-facing wording. See vocabulary-loader.ts for
 * the validation and caching behavior, and vocabulary-json-parser.ts for
 * the strict parser that enforces the schema below.
 *
 * The file format is deliberately narrow — a flat map of string key to
 * string replacement, under a versioned envelope:
 *
 *   { "schemaVersion": 1, "entries": { "some.key": "Replacement text" } }
 *
 * Until the user supplies a file that passes every check in
 * vocabulary-loader.ts, every surface renders its ORIGINAL shipped
 * wording, unchanged. This module ships no built-in mappings, samples, or
 * templates: there is nothing here for a surface to fall back to except
 * the wording it already had.
 */

export const VOCABULARY_SCHEMA_VERSION = 1;

/** Hard bounds enforced during validation. Exceeding any of these rejects
 * the whole file — never a partial application of the entries that did
 * fit within the bound. */
export const VOCABULARY_LIMITS = {
  /** Maximum accepted file size, in bytes, before any parsing is
   * attempted. */
  maxFileSizeBytes: 256 * 1024,
  /** Maximum JSON object/array nesting depth. The schema itself only
   * needs depth 2 (root object, then the entries object) — this bound is
   * intentionally a little more generous than that so a well-formed file
   * is never rejected on a technicality, while still refusing a
   * pathologically deep payload designed to exhaust the parser's stack. */
  maxNestingDepth: 4,
  /** Maximum number of entries in the `entries` map. */
  maxEntryCount: 2000,
  /** Maximum length, in UTF-16 code units, of an entry key. */
  maxKeyLength: 200,
  /** Maximum length, in UTF-16 code units, of an entry's replacement
   * value. */
  maxValueLength: 500,
} as const;

/** Object keys that must never be accepted anywhere in the payload, since
 * they could otherwise be used to reach or pollute a prototype when the
 * parsed data is later merged into a plain object. */
export const UNSAFE_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

/** The validated, in-memory shape of a personal-vocabulary file. Plain
 * data only — no methods, no prototype beyond Object's own, so it is safe
 * to hold in memory and to read from repeatedly without re-validating
 * every access (the cache still gets revalidated before every LOAD, per
 * vocabulary-loader.ts). */
export interface PersonalVocabulary {
  schemaVersion: number;
  /** key -> replacement text. Both are user-supplied strings; callers
   * applying them at a text boundary should treat them as plain text, not
   * as markup or code. */
  entries: Readonly<Record<string, string>>;
}

/** Why a candidate file was rejected, without ever including the file's
 * own content, path, or byte size verbatim in a way that could leak
 * private wording into logs — see vocabulary-loader.ts for how these are
 * surfaced. Each reason is a fixed, non-content-bearing code. */
export type VocabularyRejectionReason =
  | 'file-too-large'
  | 'invalid-json'
  | 'not-an-object'
  | 'unsupported-schema-version'
  | 'missing-entries'
  | 'entries-not-an-object'
  | 'too-many-entries'
  | 'duplicate-key'
  | 'unsafe-key'
  | 'key-too-long'
  | 'value-not-a-string'
  | 'value-too-long'
  | 'nesting-too-deep'
  | 'unexpected-field';

export type VocabularyValidationResult =
  | { ok: true; vocabulary: PersonalVocabulary }
  | { ok: false; reason: VocabularyRejectionReason; detail: string };

/** The current state a caller (e.g. a settings screen) should render.
 * `active` is only ever true when a validated file's entries are actually
 * in effect; every other state means shipped wording is in effect. */
export type VocabularyState =
  | { kind: 'no-file' }
  | { kind: 'active'; entryCount: number; loadedFromCachePath: string }
  | { kind: 'rejected'; reason: VocabularyRejectionReason; detail: string };
