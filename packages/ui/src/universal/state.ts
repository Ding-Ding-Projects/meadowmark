import { Store } from "../dom";

export type NarratorLanguage = "en" | "yue" | "both";
export type ScheduleWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ScheduleRule {
  id: string;
  label: string;
  enabled: boolean;
  weekdays: ScheduleWeekday[];
  startTime: string;
  endTime: string;
  language: "en" | "yue" | "bilingual" | null;
  theme: "light" | "dark" | "system" | null;
}

export interface UniversalUiState {
  displayName: string;
  schoolModeEnabled: boolean;
  schoolModeName: string;
  narratorEnabled: boolean;
  narratorLanguage: NarratorLanguage;
  narratorVoiceEn: string;
  narratorVoiceYue: string;
  narratorRate: number;
  narratorPitch: number;
  schedules: ScheduleRule[];
  selectedLogoPreset: "meadow" | "harvest" | "town" | "custom";
  customLogoDataUrl: string | null;
  customLogoFit: "contain" | "cover";
  customLogoBackground: string;
  activeUniversalTab: string;
  pinnedUniversalTabs: string[];
}

const STORAGE_KEY = "meadowmark.universal-ui.v1";

const DEFAULTS: UniversalUiState = {
  displayName: "Meadowmark",
  schoolModeEnabled: false,
  schoolModeName: "School mode",
  narratorEnabled: false,
  narratorLanguage: "en",
  narratorVoiceEn: "auto",
  narratorVoiceYue: "auto",
  narratorRate: 1,
  narratorPitch: 1,
  schedules: [],
  selectedLogoPreset: "meadow",
  customLogoDataUrl: null,
  customLogoFit: "contain",
  customLogoBackground: "#fbfdf6",
  activeUniversalTab: "status",
  pinnedUniversalTabs: ["status", "preferences"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadState(): UniversalUiState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULTS };
    return {
      ...DEFAULTS,
      ...parsed,
      schedules: Array.isArray(parsed.schedules) ? parsed.schedules.filter(isScheduleRule) : [],
      pinnedUniversalTabs: Array.isArray(parsed.pinnedUniversalTabs)
        ? parsed.pinnedUniversalTabs.filter((value): value is string => typeof value === "string")
        : [...DEFAULTS.pinnedUniversalTabs],
      customLogoDataUrl: typeof parsed.customLogoDataUrl === "string" ? parsed.customLogoDataUrl : null,
    } as UniversalUiState;
  } catch {
    return { ...DEFAULTS };
  }
}

function isScheduleRule(value: unknown): value is ScheduleRule {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.enabled === "boolean" &&
    Array.isArray(value.weekdays) &&
    value.weekdays.every((day) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6) &&
    typeof value.startTime === "string" &&
    typeof value.endTime === "string"
  );
}

export const universalUiStore = new Store<UniversalUiState>(loadState());

universalUiStore.subscribe((value) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The state remains live for this session. The surface reports host or
    // browser persistence failures separately when the user changes a value.
  }
});

export interface PersonalVocabularyPayload {
  version: 1;
  replacements: Record<string, string>;
}

export interface VocabularyValidationResult {
  ok: boolean;
  value?: PersonalVocabularyPayload;
  error?: string;
}

export const PERSONAL_VOCABULARY_MAX_BYTES = 64 * 1024;
export const PERSONAL_VOCABULARY_MAX_ENTRIES = 512;

/** Strictly validates the neutral local vocabulary contract. It deliberately
 * rejects unknown keys and prototype-bearing replacement keys. */
export function validatePersonalVocabulary(text: string): VocabularyValidationResult {
  if (new TextEncoder().encode(text).byteLength > PERSONAL_VOCABULARY_MAX_BYTES) {
    return { ok: false, error: `The file exceeds ${PERSONAL_VOCABULARY_MAX_BYTES} bytes.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
  if (!isRecord(parsed) || Object.keys(parsed).some((key) => key !== "version" && key !== "replacements")) {
    return { ok: false, error: "Only version and replacements are allowed at the top level." };
  }
  if (parsed.version !== 1 || !isRecord(parsed.replacements)) {
    return { ok: false, error: "This file must use schema version 1 and a replacements object." };
  }
  const entries = Object.entries(parsed.replacements);
  if (entries.length > PERSONAL_VOCABULARY_MAX_ENTRIES) {
    return { ok: false, error: `The file exceeds ${PERSONAL_VOCABULARY_MAX_ENTRIES} replacements.` };
  }
  const replacements: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, value] of entries) {
    if (["__proto__", "prototype", "constructor"].includes(key)) {
      return { ok: false, error: `The replacement key ${key} is not allowed.` };
    }
    if (key.length === 0 || key.length > 128 || typeof value !== "string" || value.length > 512) {
      return { ok: false, error: "Replacement keys must be 1-128 characters and values must be strings up to 512 characters." };
    }
    replacements[key] = value;
  }
  return { ok: true, value: { version: 1, replacements } };
}

export function scheduleMatches(rule: ScheduleRule, date: Date): boolean {
  if (!rule.enabled || !rule.weekdays.includes(date.getDay() as ScheduleWeekday)) return false;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const start = parseTime(rule.startTime);
  const end = parseTime(rule.endTime);
  if (start === null || end === null || start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export const UNIVERSAL_SURFACE_IDS = [
  "status",
  "preferences",
  "appearance",
  "automation",
  "converter",
  "ollama",
  "security",
  "history",
  "help",
] as const;

export function assertUniversalSurfaceContract(ids: readonly string[]): void {
  const missing = UNIVERSAL_SURFACE_IDS.filter((id) => !ids.includes(id));
  if (missing.length) throw new Error(`Missing universal surfaces: ${missing.join(", ")}`);
}
