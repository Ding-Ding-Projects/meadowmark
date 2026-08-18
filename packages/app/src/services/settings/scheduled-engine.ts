/**
 * Scheduled-settings matching engine.
 *
 * Timezone handling
 * ------------------
 * Every date and time in a ScheduledRule is interpreted in the host
 * machine's CURRENT local timezone. This engine never stores or compares
 * against a timezone identifier of its own; it reads wall-clock
 * components straight off `Date` using its local getters
 * (getHours/getMinutes/getFullYear/getMonth/getDate/getDay). Those
 * getters already return values adjusted for the OS's current UTC offset
 * at the instant in question, which is what makes daylight saving happen
 * "for free": a rule whose window is "18:00-22:00" keeps meaning
 * 6pm-10pm local wall-clock time across a DST transition, without this
 * engine doing any arithmetic on the offset itself. The trade-off this
 * implies: if the OS timezone itself changes (the machine travels, or
 * the user changes their Windows timezone setting), every rule's meaning
 * changes with it immediately, because there is nothing else to consult.
 *
 * Precedence
 * ----------
 * Rules are evaluated in ARRAY ORDER (index 0 first). For a given
 * setting key, the first enabled rule (in that order) whose date/day/time
 * window matches "now" AND whose source resolves a value for that key
 * wins it. A later matching rule may still contribute a DIFFERENT key
 * that no earlier matching rule declared a value for. This is
 * deterministic by construction: array order has no ties, so there is
 * never an ambiguous "which rule wins" question to answer at runtime.
 *
 * Base-settings recoverability
 * -----------------------------
 * This module is READ-ONLY with respect to persisted settings. It never
 * writes anything back to a SettingsStore. computeEffectiveSettings()
 * takes a base snapshot and a rule list and returns a NEW merged object;
 * the base snapshot itself is never mutated. The instant a rule's window
 * ends (or the rule is disabled/deleted), the very next evaluation simply
 * stops including its override - there is nothing to "revert" because
 * the base was never touched in the first place.
 */

import { DEFAULT_SETTINGS, type SettingsKey, type SettingsValues } from './schema.js';
import type { FieldProvenance, SettingsProvenance } from './provenance.js';
import {
  validateScheduledRule,
  type ScheduledRule,
  type ScheduledRuleList,
  type Weekday,
} from './scheduled-types.js';
import {
  resolveLocalOnlyScheduledSource,
  type ScheduledSourceResolver,
} from './scheduled-source.js';

const TIME_PARTS_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTimeToMinutes(time: string): number {
  const match = TIME_PARTS_RE.exec(time);
  if (!match) {
    throw new Error(`Invalid time string (must be validated before calling this): "${time}"`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function timeOfDayMinutes(at: Date): number {
  return at.getHours() * 60 + at.getMinutes() + at.getSeconds() / 60;
}

function localDateString(at: Date): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The calendar day immediately before `at`, at the same time of day.
 * Constructed from local year/month/day components so month and year
 * rollovers (and the weekday returned by getDay()) are handled by the
 * Date constructor rather than by hand. */
function previousLocalDay(at: Date): Date {
  return new Date(
    at.getFullYear(),
    at.getMonth(),
    at.getDate() - 1,
    at.getHours(),
    at.getMinutes(),
    at.getSeconds(),
  );
}

/** Whether `at`'s local calendar date and weekday satisfy the rule's date
 * bounds and recurrence - WITHOUT considering the time-of-day window.
 * Both startDate and endDate are inclusive local calendar dates. */
function dayMatches(rule: ScheduledRule, at: Date): boolean {
  const dateStr = localDateString(at);
  if (rule.startDate !== undefined && dateStr < rule.startDate) return false;
  if (rule.endDate !== undefined && dateStr > rule.endDate) return false;
  if (rule.recurrence.kind === 'everyDay') return true;
  const weekday = at.getDay() as Weekday;
  // An explicitly empty `days` list matches no day, by design - see the
  // comment on ScheduleRecurrence in scheduled-types.ts.
  return rule.recurrence.days.includes(weekday);
}

/**
 * Whether a rule is currently active at `at`. Documented edge-case
 * semantics, all deliberate:
 *
 * - Neither startTime nor endTime set: the rule covers the FULL DAY on
 *   any date that satisfies its date/weekday bounds.
 * - startTime === endTime (both set): treated as a FULL 24-HOUR WINDOW,
 *   not as an instant that can never be observed. An instant window would
 *   be indistinguishable from "never matches" to any caller polling on a
 *   normal cadence, which is a worse default than "the whole day".
 * - Only startTime set: window runs from startTime through the end of
 *   that same local day (23:59:59.999).
 * - Only endTime set: window runs from local midnight through endTime,
 *   same local day.
 * - Both set, startTime < endTime: an ordinary same-day window.
 * - Both set, startTime > endTime: a CROSS-MIDNIGHT window, anchored to
 *   the day it STARTS on. The weekday/date bounds and recurrence are
 *   evaluated against the day the window started, not the day it ends
 *   on - so a rule for "Friday 22:00-02:00" is active from Friday 22:00
 *   through Saturday 02:00, and does NOT require Saturday to also be a
 *   selected weekday.
 */
export function matchesRuleAt(rule: ScheduledRule, at: Date): boolean {
  if (!rule.enabled) return false;
  if (!validateScheduledRule(rule).valid) return false;

  const hasStart = rule.startTime !== undefined;
  const hasEnd = rule.endTime !== undefined;
  const nowMinutes = timeOfDayMinutes(at);

  if (!hasStart && !hasEnd) {
    return dayMatches(rule, at);
  }

  if (hasStart && hasEnd && rule.startTime === rule.endTime) {
    return dayMatches(rule, at);
  }

  if (hasStart && !hasEnd) {
    const startMinutes = parseTimeToMinutes(rule.startTime as string);
    return dayMatches(rule, at) && nowMinutes >= startMinutes;
  }

  if (!hasStart && hasEnd) {
    const endMinutes = parseTimeToMinutes(rule.endTime as string);
    return dayMatches(rule, at) && nowMinutes < endMinutes;
  }

  const startMinutes = parseTimeToMinutes(rule.startTime as string);
  const endMinutes = parseTimeToMinutes(rule.endTime as string);

  if (startMinutes < endMinutes) {
    return dayMatches(rule, at) && nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  // Cross-midnight: active either because it started today and has not
  // yet reached endTime tomorrow, or because it started yesterday and
  // has not yet reached endTime today.
  const startedTodayStillBeforeMidnight = dayMatches(rule, at) && nowMinutes >= startMinutes;
  const yesterday = previousLocalDay(at);
  const startedYesterdayStillActive = dayMatches(rule, yesterday) && nowMinutes < endMinutes;
  return startedTodayStillBeforeMidnight || startedYesterdayStillActive;
}

export interface ScheduledEvaluation {
  /** Every enabled rule, in precedence order, whose window matches `at` -
   * regardless of whether its source could actually be resolved. */
  activeRules: readonly ScheduledRule[];
  /** The subset of activeRules whose source could not be resolved (e.g.
   * a network source type this build does not implement), each paired
   * with the human-readable reason. These rules are ACTIVE but
   * contribute no override - the caller should surface that honestly
   * rather than pretending the rule is inert. */
  unresolvedRules: readonly { rule: ScheduledRule; reason: string }[];
  /** Resolved key -> value overrides after applying precedence. */
  overrides: Partial<SettingsValues>;
  /** Which rule produced each overridden key's value, for provenance. */
  overrideSources: Partial<Record<SettingsKey, { ruleId: string; ruleLabel: string }>>;
}

/** Evaluates every rule in `rules` against `at` and computes the merged
 * override set per the precedence documented above. `resolveSource`
 * defaults to the local-only resolver (see scheduled-source.ts); tests or
 * a future build may inject a different one. */
export function evaluateScheduledRules(
  rules: ScheduledRuleList,
  at: Date,
  resolveSource: ScheduledSourceResolver = resolveLocalOnlyScheduledSource,
): ScheduledEvaluation {
  const activeRules: ScheduledRule[] = [];
  const unresolvedRules: { rule: ScheduledRule; reason: string }[] = [];
  const overrides: Partial<SettingsValues> = {};
  const overrideSources: Partial<Record<SettingsKey, { ruleId: string; ruleLabel: string }>> = {};

  for (const rule of rules) {
    if (!matchesRuleAt(rule, at)) continue;
    activeRules.push(rule);

    const resolved = resolveSource(rule.source);
    if (resolved.status === 'unavailable') {
      unresolvedRules.push({ rule, reason: resolved.reason });
      continue;
    }

    for (const rawKey of Object.keys(resolved.values)) {
      const key = rawKey as SettingsKey;
      if (key in overrides) continue; // an earlier, higher-precedence rule already claimed this key
      (overrides as Record<SettingsKey, unknown>)[key] = resolved.values[key];
      overrideSources[key] = { ruleId: rule.id, ruleLabel: rule.label };
    }
  }

  return { activeRules, unresolvedRules, overrides, overrideSources };
}

export interface EffectiveSettingsResult {
  values: SettingsValues;
  evaluation: ScheduledEvaluation;
}

/** Merges a base settings snapshot with the scheduled overrides active at
 * `at`. Returns a brand-new object - `base` is never mutated, and nothing
 * here is ever written back to a store. */
export function computeEffectiveSettings(
  base: SettingsValues,
  rules: ScheduledRuleList,
  at: Date,
  resolveSource?: ScheduledSourceResolver,
): EffectiveSettingsResult {
  const evaluation = evaluateScheduledRules(rules, at, resolveSource);
  return { values: { ...base, ...evaluation.overrides }, evaluation };
}

/** Combines a store's base provenance with a scheduled evaluation: any
 * key with an active override reports source 'scheduled' plus which rule
 * produced it; every other key keeps its base ('user' or 'default')
 * provenance unchanged. */
export function computeEffectiveProvenance(
  baseProvenance: SettingsProvenance,
  evaluation: ScheduledEvaluation,
): SettingsProvenance {
  const result = { ...baseProvenance } as SettingsProvenance;
  for (const rawKey of Object.keys(evaluation.overrides)) {
    const key = rawKey as SettingsKey;
    const source = evaluation.overrideSources[key];
    if (!source) continue;
    const base = baseProvenance[key];
    const overridden: FieldProvenance = {
      key: base.key,
      value: evaluation.overrides[key] as SettingsValues[SettingsKey],
      source: 'scheduled',
      defaultValue: DEFAULT_SETTINGS[key],
      scheduledRuleId: source.ruleId,
      scheduledRuleLabel: source.ruleLabel,
    };
    (result as Record<SettingsKey, FieldProvenance>)[key] = overridden;
  }
  return result;
}
