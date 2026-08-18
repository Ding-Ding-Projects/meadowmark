/**
 * i18n system: three language modes (English, playful Hong Kong-style
 * Cantonese, bilingual) plus the two independent funny-level sliders that
 * style copy voice without ever changing the underlying facts.
 *
 * Copy keys are namespaced per surface (e.g. "hud.coins.label",
 * "panel.fields.plantAll") so two surfaces can never silently collide and
 * borrow each other's words.
 */

import { Store } from "../dom";

export type LanguageMode = "en" | "yue" | "bilingual";
export type FunnyLevel = 1 | 2 | 3 | 4 | 5;

export interface CopyEntry {
  /** Keyed by funny level 1-5. A surface may supply fewer levels; nearest below is used. */
  en: Partial<Record<FunnyLevel, string>>;
  yue: Partial<Record<FunnyLevel, string>>;
}

export type CopyTable = Record<string, CopyEntry>;

export interface I18nSettings {
  language: LanguageMode;
  funnyLevelEn: FunnyLevel;
  funnyLevelYue: FunnyLevel;
}

const STORAGE_KEY = "meadowmark.i18n.v1";

function loadSettings(): I18nSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<I18nSettings>;
      return {
        language: parsed.language ?? "en",
        funnyLevelEn: (parsed.funnyLevelEn as FunnyLevel) ?? 3,
        funnyLevelYue: (parsed.funnyLevelYue as FunnyLevel) ?? 3,
      };
    }
  } catch {
    // fall through to defaults; storage may be unavailable
  }
  return { language: "en", funnyLevelEn: 3, funnyLevelYue: 3 };
}

export const i18nStore = new Store<I18nSettings>(loadSettings());

i18nStore.subscribe((value) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore persistence failure; app still functions for this session
  }
});

export function setLanguageMode(mode: LanguageMode): void {
  i18nStore.update((s) => ({ ...s, language: mode }));
}

export function setFunnyLevel(lang: "en" | "yue", level: FunnyLevel): void {
  i18nStore.update((s) => (lang === "en" ? { ...s, funnyLevelEn: level } : { ...s, funnyLevelYue: level }));
}

const registry = new Map<string, CopyEntry>();

/** Registers a namespaced copy table. Call once per surface module at import time. */
export function registerCopy(table: CopyTable): void {
  for (const [key, entry] of Object.entries(table)) {
    if (registry.has(key)) {
      // eslint-disable-next-line no-console
      console.warn(`[i18n] duplicate copy key registered: "${key}" — surfaces must namespace their keys`);
    }
    registry.set(key, entry);
  }
}

function nearestLevel(levels: Partial<Record<FunnyLevel, string>>, target: FunnyLevel): string {
  for (let l = target; l >= 1; l -= 1) {
    const v = levels[l as FunnyLevel];
    if (v !== undefined) return v;
  }
  for (let l = target; l <= 5; l += 1) {
    const v = levels[l as FunnyLevel];
    if (v !== undefined) return v;
  }
  return "";
}

function resolveOne(key: string, lang: "en" | "yue", level: FunnyLevel, vars?: Record<string, string | number>): string {
  const entry = registry.get(key);
  if (!entry) return readableFallback(key);
  let text = nearestLevel(entry[lang], level);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

function readableFallback(key: string): string {
  const lastSegment = key.split(".").pop() ?? key;
  return lastSegment
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim() || key;
}

/** Resolves a copy key against current i18n settings. In bilingual mode returns "en — yue". */
export function t(key: string, vars?: Record<string, string | number>): string {
  const s = i18nStore.getSnapshot();
  if (s.language === "en") return resolveOne(key, "en", s.funnyLevelEn, vars);
  if (s.language === "yue") return resolveOne(key, "yue", s.funnyLevelYue, vars);
  const en = resolveOne(key, "en", s.funnyLevelEn, vars);
  const yue = resolveOne(key, "yue", s.funnyLevelYue, vars);
  return `${en} — ${yue}`;
}

/** For bilingual layout: returns the primary (prominent) and secondary (compact) strings separately. */
export function tParts(key: string, vars?: Record<string, string | number>): { primary: string; secondary: string | null } {
  const s = i18nStore.getSnapshot();
  if (s.language === "en") return { primary: resolveOne(key, "en", s.funnyLevelEn, vars), secondary: null };
  if (s.language === "yue") return { primary: resolveOne(key, "yue", s.funnyLevelYue, vars), secondary: null };
  return {
    primary: resolveOne(key, "en", s.funnyLevelEn, vars),
    secondary: resolveOne(key, "yue", s.funnyLevelYue, vars),
  };
}

export function currentLanguageMode(): LanguageMode {
  return i18nStore.getSnapshot().language;
}
