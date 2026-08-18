/**
 * Persistence for narrator settings.
 *
 * Persists the user's language mode and, per language slot, the STABLE
 * voice identity (never the display name — see narrator-types.ts), rate,
 * and pitch. Backed by the shared JsonStore, so a missing or corrupt file
 * degrades to defaultNarratorSettings() (narration OFF) rather than
 * throwing.
 */

import { JsonStore } from '../../store';
import {
  defaultNarratorSettings,
  defaultVoiceSelection,
  type NarratedLanguage,
  type NarratorSettings,
  type VoiceSelection,
} from './narrator-types';

const SCHEMA_VERSION = 1;
const FILE_NAME = 'narrator-settings.json';

const VALID_LANGUAGES: ReadonlySet<NarratedLanguage> = new Set([
  'off',
  'english',
  'cantonese',
  'both',
]);

function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Rate range per the Web Speech spec's documented bounds. Values outside
 * this are clamped rather than trusted verbatim, since a corrupt or
 * hand-edited settings file could otherwise hand an engine an out-of-range
 * value it handles unpredictably. */
const RATE_MIN = 0.1;
const RATE_MAX = 10;
const PITCH_MIN = 0;
const PITCH_MAX = 2;

function sanitizeVoiceSelection(value: unknown): VoiceSelection {
  if (typeof value !== 'object' || value === null) {
    return defaultVoiceSelection();
  }
  const record = value as Record<string, unknown>;
  const voiceId = typeof record.voiceId === 'string' ? record.voiceId : null;
  const rate = isFiniteNumberInRange(record.rate, RATE_MIN, RATE_MAX)
    ? record.rate
    : defaultVoiceSelection().rate;
  const pitch = isFiniteNumberInRange(record.pitch, PITCH_MIN, PITCH_MAX)
    ? record.pitch
    : defaultVoiceSelection().pitch;
  return { voiceId, rate, pitch };
}

function sanitizeSettings(value: unknown): NarratorSettings {
  const fallback = defaultNarratorSettings();
  if (typeof value !== 'object' || value === null) {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  const language = VALID_LANGUAGES.has(record.language as NarratedLanguage)
    ? (record.language as NarratedLanguage)
    : fallback.language;
  return {
    language,
    english: sanitizeVoiceSelection(record.english),
    cantonese: sanitizeVoiceSelection(record.cantonese),
    respectScreenReader:
      typeof record.respectScreenReader === 'boolean'
        ? record.respectScreenReader
        : fallback.respectScreenReader,
    respectQuietHours:
      typeof record.respectQuietHours === 'boolean'
        ? record.respectQuietHours
        : fallback.respectQuietHours,
  };
}

export class NarratorSettingsStore {
  private readonly store: JsonStore<NarratorSettings>;

  constructor() {
    this.store = new JsonStore<NarratorSettings>({
      fileName: FILE_NAME,
      schemaVersion: SCHEMA_VERSION,
      defaultValue: defaultNarratorSettings,
      migrate: (envelope) => sanitizeSettings(envelope.data),
    });
  }

  async load(): Promise<NarratorSettings> {
    const loaded = await this.store.load();
    // Defense in depth: even a same-schema-version file could have been
    // hand-edited into an invalid shape. Re-validate every field rather
    // than trusting JsonStore's schema-version match alone.
    return sanitizeSettings(loaded);
  }

  async save(settings: NarratorSettings): Promise<void> {
    await this.store.save(sanitizeSettings(settings));
  }

  get path(): string {
    return this.store.path;
  }
}
