/**
 * SettingsStore: a versioned settings document with schema migration,
 * per-field validation, atomic persistence, and per-field provenance.
 *
 * Persistence model
 * ------------------
 * The on-disk document (see schema.ts) stores ONLY the keys the user has
 * actually changed. A key's absence from the persisted `values` object
 * means "not set" - the effective value falls back to DEFAULT_SETTINGS,
 * and that fact (plus the real default value, never the bare word
 * "default") is exactly what getProvenance() reports.
 *
 * This store never persists a scheduled override as a base value. The
 * scheduled-settings engine (scheduled-engine.ts) computes overrides
 * purely at read time from getBase() + the active rules; it never calls
 * set()/setMany() on this store. That is what keeps the base recoverable
 * once a temporary override's window ends - there is nothing to recover
 * from, because the base was never touched.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { atomicWriteJson } from '../../atomic-write.js';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  SETTINGS_SCHEMA_VERSION,
  type PersistedSettingsDocument,
  type SettingsKey,
  type SettingsValues,
} from './schema.js';
import type { FieldProvenance, SettingsProvenance } from './provenance.js';

// ---------------------------------------------------------------------
// Per-field validation
// ---------------------------------------------------------------------

type Validator<K extends SettingsKey> = (value: unknown) => value is SettingsValues[K];

function isFiniteNumberInRange(min: number, max: number) {
  return (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isOneOf<T extends string>(...allowed: readonly T[]) {
  return (value: unknown): value is T =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

const HEX_COLOR_RE = /^[0-9a-fA-F]{6}$/;
const FONT_FAMILY_RE = /^[A-Za-z0-9 ,_.'"-]{1,120}$/;
const DISPLAY_NAME_RE = /^.{1,80}$/u;

/** One validator per SettingsValues key. A completeness test asserts this
 * object's keys exactly equal SETTINGS_KEYS, so a field can never be added
 * to the schema without also gaining a validator here. */
export const FIELD_VALIDATORS: { [K in SettingsKey]: Validator<K> } = {
  languageMode: isOneOf('en', 'yue', 'bilingual'),
  funnyLevelEnglish: isFiniteNumberInRange(1, 5),
  funnyLevelCantonese: isFiniteNumberInRange(1, 5),
  showEmojiInDialogs: (v): v is boolean => typeof v === 'boolean',
  theme: isOneOf('light', 'dark', 'system'),
  density: isOneOf('comfortable', 'compact', 'spacious'),
  accentColorHex: (v): v is string => typeof v === 'string' && HEX_COLOR_RE.test(v),
  uiFontFamily: (v): v is string => typeof v === 'string' && FONT_FAMILY_RE.test(v),
  uiFontSizeScale: isFiniteNumberInRange(0.5, 3),
  displayName: (v): v is string | null =>
    v === null || (typeof v === 'string' && DISPLAY_NAME_RE.test(v)),
  narratorEnabled: (v): v is boolean => typeof v === 'boolean',
  narratorLanguage: isOneOf('en', 'yue', 'both'),
};

export function validateSettingValue<K extends SettingsKey>(
  key: K,
  value: unknown,
): value is SettingsValues[K] {
  return FIELD_VALIDATORS[key](value);
}

/** Validates and sanitizes an arbitrary partial object read from disk (or
 * supplied by a caller). Unknown keys are dropped; invalid values for a
 * known key are dropped (never coerced silently to something the caller
 * did not ask for) and reported in `warnings` so a load failure is never
 * silent. The result contains only keys that passed validation. */
export function sanitizePartialSettings(
  raw: unknown,
): { values: Partial<SettingsValues>; warnings: string[] } {
  const warnings: string[] = [];
  const out: Partial<SettingsValues> = {};
  if (raw === null || typeof raw !== 'object') {
    if (raw !== undefined) {
      warnings.push(`Expected an object of settings values, got ${typeof raw}.`);
    }
    return { values: out, warnings };
  }
  const record = raw as Record<string, unknown>;
  for (const key of SETTINGS_KEYS) {
    if (!(key in record)) continue;
    const candidate = record[key];
    if (validateSettingValue(key, candidate)) {
      (out as Record<SettingsKey, unknown>)[key] = candidate;
    } else {
      warnings.push(`Discarded invalid value for "${key}": ${JSON.stringify(candidate)}`);
    }
  }
  return { values: out, warnings };
}

// ---------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------

/**
 * Migration steps, keyed by the version they migrate FROM. Each step
 * takes the raw (untyped) parsed JSON at that version and returns the raw
 * JSON at version+1. Steps are applied in sequence starting from whatever
 * version the file on disk declares, until SETTINGS_SCHEMA_VERSION is
 * reached. There is currently only version 1, so this map is empty; add
 * an entry here (never mutate an existing one) the day version 2 exists.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

/** Runs a raw parsed JSON document through migrations, then validation,
 * and returns a clean Partial<SettingsValues> plus any warnings produced
 * along the way. Never throws: a document that cannot be understood at
 * all degrades to an empty partial (i.e. "nothing was ever set", which
 * falls back entirely to defaults) with the reason recorded in warnings. */
export function migrateAndValidate(
  rawDocument: unknown,
): { values: Partial<SettingsValues>; warnings: string[] } {
  const warnings: string[] = [];
  if (rawDocument === null || typeof rawDocument !== 'object') {
    if (rawDocument !== undefined) {
      warnings.push('Settings file did not contain a JSON object; falling back to defaults.');
    }
    return { values: {}, warnings };
  }
  let doc = rawDocument as Record<string, unknown>;
  let version = typeof doc.version === 'number' && Number.isInteger(doc.version) ? doc.version : 0;
  if (version < 1) {
    warnings.push('Settings file had no valid version field; treating stored values as unset.');
    return { values: {}, warnings };
  }
  let guardCounter = 0;
  while (version < SETTINGS_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      warnings.push(
        `No migration registered from settings version ${version}; falling back to defaults.`,
      );
      return { values: {}, warnings };
    }
    doc = step(doc);
    version += 1;
    guardCounter += 1;
    if (guardCounter > 1000) {
      warnings.push('Migration step chain exceeded a sane bound; aborting to avoid an infinite loop.');
      return { values: {}, warnings };
    }
  }
  const sanitized = sanitizePartialSettings(doc.values);
  return { values: sanitized.values, warnings: [...warnings, ...sanitized.warnings] };
}

// ---------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------

export interface SettingsLoadResult {
  /** True if the file existed and was at least partially readable. False
   * on a fresh install (no file yet) - not an error. */
  fileExisted: boolean;
  /** Non-fatal problems encountered while loading (invalid values
   * dropped, unreadable file, failed migration, etc). Loading always
   * succeeds in the sense that the store ends up in a valid state
   * (falling back to defaults for anything it could not use); this array
   * is how that fallback gets reported instead of staying silent. */
  warnings: string[];
}

/**
 * Owns one versioned settings document on disk. Holds only BASE
 * (user-set) values in memory; scheduled overrides are computed
 * elsewhere, at read time, and never flow back into this store.
 */
export class SettingsStore {
  private readonly filePath: string;
  /** Only user-set keys live here. Everything else is implicitly
   * DEFAULT_SETTINGS[key]. */
  private userValues: Partial<SettingsValues> = {};
  private loaded = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /** Loads the document from disk, migrating and validating it. Safe to
   * call once at startup. Never throws for a missing or corrupt file -
   * both fall back to "nothing set" (pure defaults) and are reported via
   * the returned warnings, per the fail-closed-and-honestly rule. */
  async load(): Promise<SettingsLoadResult> {
    let fileExisted = true;
    let raw: unknown;
    try {
      const text = await fs.readFile(this.filePath, 'utf8');
      raw = JSON.parse(text);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: unknown }).code
          : undefined;
      if (code === 'ENOENT') {
        fileExisted = false;
        raw = undefined;
      } else {
        this.userValues = {};
        this.loaded = true;
        return {
          fileExisted: true,
          warnings: [
            `Could not read or parse settings file at "${this.filePath}": ${
              err instanceof Error ? err.message : String(err)
            }. Falling back to defaults.`,
          ],
        };
      }
    }
    const { values, warnings } = migrateAndValidate(raw);
    this.userValues = values;
    this.loaded = true;
    return { fileExisted, warnings };
  }

  private assertLoaded(): void {
    if (!this.loaded) {
      throw new Error('SettingsStore.load() must be called before reading or writing settings.');
    }
  }

  /** The persisted base settings, with scheduled overrides NOT applied.
   * This is what a scheduled override falls back to once its window
   * ends - nothing more than reading this again, because nothing was
   * ever written on top of it. */
  getBase(): SettingsValues {
    this.assertLoaded();
    return { ...DEFAULT_SETTINGS, ...this.userValues };
  }

  /** Provenance for every base (non-scheduled) setting: whether the user
   * set it, and the real default value it would otherwise fall back to. */
  getBaseProvenance(): SettingsProvenance {
    this.assertLoaded();
    const result = {} as SettingsProvenance;
    for (const key of SETTINGS_KEYS) {
      (result as Record<SettingsKey, FieldProvenance>)[key] = this.getBaseFieldProvenance(key);
    }
    return result;
  }

  getBaseFieldProvenance<K extends SettingsKey>(key: K): FieldProvenance<K> {
    this.assertLoaded();
    const isUserSet = key in this.userValues;
    const value = isUserSet ? (this.userValues[key] as SettingsValues[K]) : DEFAULT_SETTINGS[key];
    return {
      key,
      value,
      source: isUserSet ? 'user' : 'default',
      defaultValue: DEFAULT_SETTINGS[key],
    };
  }

  /** Sets one setting to a user-chosen value and persists atomically.
   * Throws (without mutating in-memory state) if the value fails
   * validation, so a rejected write can never leave the store in an
   * inconsistent state relative to what is on disk. */
  async set<K extends SettingsKey>(key: K, value: SettingsValues[K]): Promise<void> {
    this.assertLoaded();
    if (!validateSettingValue(key, value)) {
      throw new Error(`Rejected invalid value for setting "${key}": ${JSON.stringify(value)}`);
    }
    const next = { ...this.userValues, [key]: value };
    await this.persist(next);
    this.userValues = next;
  }

  /** Sets several settings atomically as one write. Validates every
   * field before writing any of them, so a partial-invalid batch fails
   * closed rather than applying half the change. */
  async setMany(partial: Partial<SettingsValues>): Promise<void> {
    this.assertLoaded();
    for (const key of Object.keys(partial) as SettingsKey[]) {
      const value = partial[key];
      if (!validateSettingValue(key, value)) {
        throw new Error(`Rejected invalid value for setting "${key}": ${JSON.stringify(value)}`);
      }
    }
    const next = { ...this.userValues, ...partial };
    await this.persist(next);
    this.userValues = next;
  }

  /** Clears a single setting back to its compiled-in default, i.e.
   * removes it from the persisted user-set partial. Its provenance
   * becomes 'default' again. */
  async resetToDefault(key: SettingsKey): Promise<void> {
    this.assertLoaded();
    if (!(key in this.userValues)) return;
    const next = { ...this.userValues };
    delete next[key];
    await this.persist(next);
    this.userValues = next;
  }

  /** Clears every setting back to its compiled-in default. */
  async resetAllToDefaults(): Promise<void> {
    this.assertLoaded();
    await this.persist({});
    this.userValues = {};
  }

  private async persist(values: Partial<SettingsValues>): Promise<void> {
    const document: PersistedSettingsDocument = { version: SETTINGS_SCHEMA_VERSION, values };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await atomicWriteJson(this.filePath, document);
  }
}
