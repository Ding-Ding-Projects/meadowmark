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
 * A rule's data source. Local values resolve synchronously. Network
 * source shapes are validated and bounded here, but remain explicitly
 * unavailable until the scheduler owns a safe asynchronous resolver.
 */
export type ScheduledRuleSource =
  | { type: 'local'; values: Record<string, unknown> }
  | {
      type: 'https';
      /** A versioned HTTPS endpoint returning an allowlisted subset of
       * setting fields. Explicit loopback HTTP is accepted for local
       * development and integration only. */
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
const RULE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ENTITY_ID_RE = /^(?:binary_sensor|input_boolean)\.[a-z0-9_]{1,255}$/;
const MIN_POLL_INTERVAL_MS = 15_000;
const MAX_POLL_INTERVAL_MS = 86_400_000;
const MAX_LABEL_LENGTH = 160;
const MAX_URL_LENGTH = 2_048;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parts = value.split('-').map(Number);
  if (parts.length !== 3) return false;
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function validatePollInterval(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (
    !Number.isInteger(value) ||
    (value as number) < MIN_POLL_INTERVAL_MS ||
    (value as number) > MAX_POLL_INTERVAL_MS
  ) {
    errors.push(
      `pollIntervalMs must be an integer from ${MIN_POLL_INTERVAL_MS} through ${MAX_POLL_INTERVAL_MS}.`,
    );
  }
}

function validateSettingsRecord(value: unknown, field: string, errors: string[]): void {
  if (!isPlainRecord(value)) {
    errors.push(`${field} must be a plain object.`);
    return;
  }
  if (Object.keys(value).length > 64) {
    errors.push(`${field} must contain no more than 64 fields.`);
  }
}

function validateNetworkUrl(raw: unknown, field: string, errors: string[]): void {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    errors.push(`${field} must be a non-empty URL no longer than ${MAX_URL_LENGTH} characters.`);
    return;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.username || parsed.password) errors.push(`${field} must not contain URL credentials.`);
    if (parsed.hash) errors.push(`${field} must not contain a fragment.`);
    const loopbackHost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]' ||
      parsed.hostname === '::1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopbackHost)) {
      errors.push(`${field} must use HTTPS, or HTTP with an explicit loopback host.`);
    }
  } catch {
    errors.push(`${field} is not a valid URL.`);
  }
}

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

  if (typeof rule.id !== 'string' || !RULE_ID_RE.test(rule.id)) {
    errors.push('Rule id must be 1-128 characters using letters, digits, dot, underscore, colon, or hyphen.');
  }
  if (
    typeof rule.label !== 'string' ||
    rule.label.trim().length === 0 ||
    rule.label.length > MAX_LABEL_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(rule.label)
  ) {
    errors.push(`Rule label must be 1-${MAX_LABEL_LENGTH} characters without control characters.`);
  }
  if (typeof rule.enabled !== 'boolean') {
    errors.push('Rule "enabled" must be a boolean.');
  }

  if (rule.startDate !== undefined && !isRealDate(rule.startDate)) {
    errors.push(`startDate "${rule.startDate}" is not a valid "YYYY-MM-DD" date string.`);
  }
  if (rule.endDate !== undefined && !isRealDate(rule.endDate)) {
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
    validateSettingsRecord(rule.source.values, 'local source "values"', errors);
  } else if (rule.source.type === 'https') {
    validateNetworkUrl(rule.source.url, 'https source "url"', errors);
    validatePollInterval(rule.source.pollIntervalMs, errors);
  } else if (rule.source.type === 'homeAssistant') {
    validateNetworkUrl(rule.source.baseUrl, 'homeAssistant source "baseUrl"', errors);
    if (typeof rule.source.entityId !== 'string' || !ENTITY_ID_RE.test(rule.source.entityId)) {
      errors.push('homeAssistant source "entityId" must name a binary_sensor or input_boolean entity.');
    }
    validateSettingsRecord(rule.source.onValues, 'homeAssistant source "onValues"', errors);
    if (rule.source.offValues !== undefined) {
      validateSettingsRecord(rule.source.offValues, 'homeAssistant source "offValues"', errors);
    }
  }

  return { valid: errors.length === 0, errors };
}
