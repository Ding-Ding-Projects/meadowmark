/**
 * Time helpers. All durations in the simulation are milliseconds; all
 * absolute instants are epoch milliseconds. We never store countdowns
 * (remaining time) in state because countdowns drift across sleep, clock
 * changes, and save/reload — only `readyAt`/`startedAt` absolute stamps do.
 */

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export function minutes(n: number): number {
  return n * MINUTE_MS;
}

export function hours(n: number): number {
  return n * HOUR_MS;
}

export function remainingMs(readyAt: number, now: number): number {
  return Math.max(0, readyAt - now);
}

export function isReady(readyAt: number | null, now: number): boolean {
  return readyAt !== null && now >= readyAt;
}

/** Local calendar date (YYYY-MM-DD) for a given epoch ms, in the machine's local timezone. Used to seed dailies/regatta deterministically per day. */
export function localDateKey(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO week key (YYYY-Www) for weekly-rotating content like the regatta. */
export function localWeekKey(epochMs: number): string {
  const d = new Date(epochMs);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7; // Monday=0
  target.setDate(target.getDate() - dayNr + 3); // nearest Thursday
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
  const week =
    1 +
    Math.round(
      (target.getTime() - firstThursday.getTime()) / (7 * DAY_MS),
    );
  return `${target.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Formats a millisecond duration as "1h 23m", "45s", "2d 3h", etc. for UI display. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(total / 86400);
  const hrs = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

/**
 * Parses a duration string produced by content authors in balance JSON,
 * e.g. "2min", "1h30", "20-60min" (returns the average for display-only
 * purposes; ranges should be modeled explicitly in code, this helper is a
 * convenience for simple single-value strings). Supports: "Ns" (seconds),
 * "Nmin"/"Nm", "Nh", "Nd", and combinations like "1h30" (1h30m) or "1h30m".
 */
export function parseDurationMs(spec: string): number {
  const trimmed = spec.trim();
  const combo = /^(\d+)h(\d+)m?$/.exec(trimmed);
  if (combo) {
    return hours(Number(combo[1])) + minutes(Number(combo[2]));
  }
  const single = /^(\d+(?:\.\d+)?)(s|sec|min|m|h|d)$/.exec(trimmed);
  if (single) {
    const value = Number(single[1]);
    switch (single[2]) {
      case "s":
      case "sec":
        return value * SECOND_MS;
      case "min":
      case "m":
        return value * MINUTE_MS;
      case "h":
        return value * HOUR_MS;
      case "d":
        return value * DAY_MS;
    }
  }
  throw new Error(`parseDurationMs: could not parse duration spec "${spec}"`);
}
