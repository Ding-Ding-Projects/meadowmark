/**
 * Public API surface for the settings subsystem: a versioned, migrated,
 * validated, atomically-persisted settings store with per-field
 * provenance (part 1), plus a scheduled-settings engine that computes
 * temporary overrides purely at read time without ever touching the
 * persisted base (part 2).
 *
 * This module does not wire itself into IPC, the main process, or any
 * other service - the orchestrator does that. It exposes plain,
 * dependency-free functions and classes so it can be wired however the
 * rest of the app needs.
 */

export {
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_KEYS,
  DEFAULT_SETTINGS,
  type LanguageMode,
  type ThemeMode,
  type DensityMode,
  type NarratorLanguage,
  type SettingsValues,
  type SettingsKey,
  type PersistedSettingsDocument,
  type PersistedSettingsDocumentV1,
} from './schema.js';

export {
  type ProvenanceSource,
  type FieldProvenance,
  type SettingsProvenance,
} from './provenance.js';

export {
  SettingsStore,
  validateSettingValue,
  sanitizePartialSettings,
  migrateAndValidate,
  FIELD_VALIDATORS,
  type SettingsLoadResult,
} from './store.js';

export {
  type Weekday,
  type ScheduleRecurrence,
  type ScheduledRuleSource,
  type ScheduledRule,
  type ScheduledRuleList,
  type RuleValidationResult,
  validateScheduledRule,
} from './scheduled-types.js';

export {
  type ResolvedScheduledSource,
  type ScheduledSourceResolver,
  resolveLocalOnlyScheduledSource,
} from './scheduled-source.js';

export {
  matchesRuleAt,
  evaluateScheduledRules,
  computeEffectiveSettings,
  computeEffectiveProvenance,
  type ScheduledEvaluation,
  type EffectiveSettingsResult,
} from './scheduled-engine.js';
