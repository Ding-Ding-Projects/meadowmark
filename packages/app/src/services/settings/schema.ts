/**
 * Versioned settings schema and defaults.
 *
 * The on-disk document only ever stores the keys the user has actually
 * changed (see store.ts). Everything else falls back to the compiled-in
 * default declared here. That split is what makes provenance possible:
 * "is this key present in the persisted partial?" answers "did the user
 * set this?" without any extra bookkeeping.
 */

/** Current schema version. Bump this and add a migration step in
 * MIGRATIONS (store.ts) whenever a field is added, removed, renamed, or
 * has its meaning changed in a way that requires translating old values. */
export const SETTINGS_SCHEMA_VERSION = 1;

export type LanguageMode = 'en' | 'yue' | 'bilingual';
export type ThemeMode = 'light' | 'dark' | 'system';
export type DensityMode = 'comfortable' | 'compact' | 'spacious';
export type NarratorLanguage = 'en' | 'yue' | 'both';

/**
 * The full set of settings this store owns. Every field here MUST have a
 * matching default in DEFAULT_SETTINGS and a matching validator in
 * FIELD_VALIDATORS (see store.ts) — a completeness test enumerates this
 * type's keys and fails when either is missing.
 */
export interface SettingsValues {
  languageMode: LanguageMode;
  /** 1 (fully serious) through 5 (maximum playfulness), English copy. */
  funnyLevelEnglish: number;
  /** 1 (fully serious) through 5 (maximum playfulness), Cantonese copy. */
  funnyLevelCantonese: number;
  showEmojiInDialogs: boolean;
  theme: ThemeMode;
  density: DensityMode;
  /** 6-digit hex color, no leading '#', e.g. "3a7d44". */
  accentColorHex: string;
  uiFontFamily: string;
  /** Multiplier applied to the base UI font size. 1 = default. */
  uiFontSizeScale: number;
  /** Cosmetic display name the user has chosen for the app's own chrome.
   * null means "use the shipped display name" (see identity.ts). This is
   * a LABEL ONLY and must never be used to derive APP_ID or DATA_DIR_NAME. */
  displayName: string | null;
  narratorEnabled: boolean;
  narratorLanguage: NarratorLanguage;
}

export const SETTINGS_KEYS = [
  'languageMode',
  'funnyLevelEnglish',
  'funnyLevelCantonese',
  'showEmojiInDialogs',
  'theme',
  'density',
  'accentColorHex',
  'uiFontFamily',
  'uiFontSizeScale',
  'displayName',
  'narratorEnabled',
  'narratorLanguage',
] as const satisfies readonly (keyof SettingsValues)[];

export type SettingsKey = (typeof SETTINGS_KEYS)[number];

/** The app's own compiled-in defaults. These are the values a fresh
 * install, or a key nobody has ever changed, actually has. */
export const DEFAULT_SETTINGS: SettingsValues = {
  languageMode: 'en',
  funnyLevelEnglish: 3,
  funnyLevelCantonese: 3,
  showEmojiInDialogs: true,
  theme: 'system',
  density: 'comfortable',
  accentColorHex: '3a7d44',
  uiFontFamily: 'system-ui',
  uiFontSizeScale: 1,
  displayName: null,
  narratorEnabled: false,
  narratorLanguage: 'en',
};

/** On-disk document shape. `values` holds ONLY user-set keys — a key that
 * is absent means "not set, use the default". */
export interface PersistedSettingsDocumentV1 {
  version: 1;
  values: Partial<SettingsValues>;
}

/** Union of every on-disk shape this module has ever written, so
 * migrations have something concrete to pattern-match against. Extend
 * this union (never mutate an existing member) when the version bumps. */
export type PersistedSettingsDocument = PersistedSettingsDocumentV1;
