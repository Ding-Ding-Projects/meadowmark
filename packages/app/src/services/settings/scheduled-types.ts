/**
 * Types for scheduled settings rules.
 *
 * A rule changes the effective value of one or more settings while it is
 * "active": enabled, within its optional date range, and within its
 * optional daily time window on an applicable day of the week. Multiple
 * rules can be active at once; scheduled-engine.ts documents and
 * implements the precedence used to pick a winner per key.
 *
 * All documented semantics below are DELIBERATE choices, not silent
 * guesses, because a scheduler with undocumented edge-case behavior is
 * exactly the kind of thing that silently does the wrong thing to a
 * user's settings while they are not looking.
 */

/** JS Date.getDay() convention: 0 = Sunday ... 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ScheduleRecurrence =
  | { kind: 'everyDay' }
  /** Matches only on the listed weekdays. An EMPTY `days` array is valid
   * input (not a validation error) and means "matches no day, ever" -
   * chosen deliberately so an accidentally-cleared day list fails safe
   * (rule goes inert) rather than failing open (rule matches every day). */
  | { kind: 'weekdays'; days: readonly Weekday[] };

/**
 * A rule's data source. Only 'local' is implemented in this build - it
 * carries a fixed partial settings object to apply while the rule is
 * active. 'https' and 'homeAssistant' are a documented EXTENSION POINT
 * for a future validated network source; their shapes are declared here
 * so a later implementation has a stable contract to fill in, but this
 * module makes NO network call of any kind for either of them. Attempting
 * to resolve one today reports 'unavailable' (see scheduled-source.ts),
 * never a silent no-op and never a fabricated value.
 */
export type ScheduledRuleSource =
  | { type: 'local'; values: Record<string, unknown> }
  | {
      type: 'https';
      /** NOT IMPLEMENTED. Reserved shape: a validated, versioned HTTPS
       * endpoint returning an allowlisted subset of setting fields. */
      url: string;
      pollIntervalMs?: number;
    }
  | {
      type: 'homeAssistant';
      /** NOT IMPLEMENTED. Reserved shape: a boolean entity (binary_sensor
       * or input_boolean) whose 'on' state activates `onValues` and whose
       * 'off' state activates `offValues` (or leaves the base/other
       * matching rule in effect when `offValues` is omitted). */
      baseUrl: string;
      entityId: string;
      onValues: Record<string, unknown>;
      offValues?: Record<string, unknown>;
    };

export interface ScheduledRule {
  /** Stable, caller-assigned identifier. Never regenerated across edits -
   * callers (UI, history, provenance) key on this. */
  id: string;
  label: string;
  enabled: boolean;
  /** Inclusive local calendar date "YYYY-MM-DD". Omitted = no lower
   * bound (the rule was always eligible, date-wise). */
  startDate?: string;
  /** Inclusive local calendar date "YYYY-MM-DD". Omitted = no upper
   * bound (the rule remains eligible indefinitely). */
  endDate?: string;
  /** Local 24-hour time "HH:MM". Omitted together with endTime = the
   * rule applies for the full day on an eligible date. Omitted alone
   * (endTime present) = the window runs from local midnight through
   * endTime. */
  startTime?: string;
  /** See startTime. Omitted alone (startTime present) = the window runs
   * from startTime through the end of that local day (23:59:59.999). */
  endTime?: string;
  recurrence: ScheduleRecurrence;
  source: ScheduledRuleSource;
}

/** The full list of rules, in DETERMINISTIC PRECEDENCE ORDER: index 0 is
 * evaluated first. The first ENABLED rule whose date/time/day window
 * matches "now" wins, per key it touches. This is a plain array (not a
 * numeric priority field) so precedence is always unambiguous - two rules
 * can never tie, because array order has no ties. */
export type ScheduledRuleList = readonly ScheduledRule[];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface RuleValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validates a single rule's shape and internal consistency. Does NOT
 * evaluate whether the rule currently matches anything - only whether it
 * is well-formed enough to ever be evaluated safely. An invalid rule must
 * never be persisted or matched; the engine also re-checks this at
 * evaluation time so a rule that became invalid after being stored (e.g.
 * through a hand-edited file) is excluded rather than crashing anything. */
export function validateScheduledRule(rule: ScheduledRule): RuleValidationResult {
  const errors: string[] = [];

  if (typeof rule.id !== 'string' || rule.id.trim().length === 0) {
    errors.push('Rule id must be a non-empty string.');
  }
  if (typeof rule.label !== 'string' || rule.label.trim().length === 0) {
    errors.push('Rule label must be a non-empty string.');
  }
  if (typeof rule.enabled !== 'boolean') {
    errors.push('Rule "enabled" must be a boolean.');
  }

  if (rule.startDate !== undefined && !DATE_RE.test(rule.startDate)) {
    errors.push(`startDate "${rule.startDate}" is not a valid "YYYY-MM-DD" date string.`);
  }
  if (rule.endDate !== undefined && !DATE_RE.test(rule.endDate)) {
    errors.push(`endDate "${rule.endDate}" is not a valid "YYYY-MM-DD" date string.`);
  }
  if (
    rule.startDate !== undefined &&
    rule.endDate !== undefined &&
    DATE_RE.test(rule.startDate) &&
    DATE_RE.test(rule.endDate) &&
    rule.startDate > rule.endDate
  ) {
    errors.push(`startDate "${rule.startDate}" is after endDate "${rule.endDate}".`);
  }

  if (rule.startTime !== undefined && !TIME_RE.test(rule.startTime)) {
    errors.push(`startTime "${rule.startTime}" is not a valid "HH:MM" 24-hour time.`);
  }
  if (rule.endTime !== undefined && !TIME_RE.test(rule.endTime)) {
    errors.push(`endTime "${rule.endTime}" is not a valid "HH:MM" 24-hour time.`);
  }

  if (!rule.recurrence || typeof rule.recurrence !== 'object') {
    errors.push('Rule must declare a recurrence.');
  } else if (rule.recurrence.kind === 'weekdays') {
    const days = rule.recurrence.days;
    if (!Array.isArray(days)) {
      errors.push('recurrence.days must be an array when kind is "weekdays".');
    } else {
      for (const day of days) {
        if (!Number.isInteger(day) || day < 0 || day > 6) {
          errors.push(`recurrence.days contains an invalid weekday value: ${JSON.stringify(day)}`);
          break;
        }
      }
    }
  } else if (rule.recurrence.kind !== 'everyDay') {
    errors.push(`Unknown recurrence.kind: ${JSON.stringify((rule.recurrence as { kind?: unknown }).kind)}`);
  }

  if (!rule.source || typeof rule.source !== 'object') {
    errors.push('Rule must declare a source.');
  } else if (
    rule.source.type !== 'local' &&
    rule.source.type !== 'https' &&
    rule.source.type !== 'homeAssistant'
  ) {
    errors.push(`Unknown source.type: ${JSON.stringify((rule.source as { type?: unknown }).type)}`);
  } else if (rule.source.type === 'local') {
    if (rule.source.values === null || typeof rule.source.values !== 'object') {
      errors.push('local source "values" must be an object.');
    }
  }

  return { valid: errors.length === 0, errors };
}
