/**
 * Provenance metadata: for a given setting, was the current value chosen
 * by the user, is it a temporary scheduled override, or is it the
 * compiled-in default the app falls back to? The settings UI renders this
 * beside every control so a user is never left guessing whether a value
 * is "theirs" or just what the app happened to ship with.
 */

import type { SettingsKey, SettingsValues } from './schema.js';

export type ProvenanceSource = 'user' | 'scheduled' | 'default';

export interface FieldProvenance<K extends SettingsKey = SettingsKey> {
  key: K;
  value: SettingsValues[K];
  source: ProvenanceSource;
  /** The compiled-in default for this key, regardless of what the
   * effective value currently is. Always present, so the UI can show
   * "falling back to <real value>" rather than the opaque word "default". */
  defaultValue: SettingsValues[K];
  /** Present only when source === 'scheduled': which rule produced the
   * current override. */
  scheduledRuleId?: string;
  scheduledRuleLabel?: string;
}

export type SettingsProvenance = {
  [K in SettingsKey]: FieldProvenance<K>;
};
