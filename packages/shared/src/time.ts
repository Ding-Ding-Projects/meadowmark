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

/**
 * The maximum span of elapsed wall-clock time any subsystem will ever
 * catch up on in one go, shared by offline.ts's resume clamp and every
 * boundary-crossing loop below (mine regeneration, ship window rerolls,
 * village request top-ups, daily rollovers). A save opened after a year
 * away simulates 30 days of catch-up, not a year - the rest of the
 * absence is deliberately not modeled. Defined here (not in offline.ts)
 * so every subsystem that needs it can import it without offline.ts
 * having to import back from them.
 */
export const MAX_OFFLINE_MS = 30 * DAY_MS;

/**
 * Returns the epoch ms of the local midnight strictly after `fromMs` -
 * i.e. the next local calendar-day boundary. Used to advance a stored
 * "last processed day" cursor one real day at a time (see
 * boundariesElapsed's doc comment for why "one big jump" and "many small
 * steps" must both go through the same day-by-day loop to stay
 * deterministic).
 */
export function nextLocalDayBoundary(fromMs: number): number {
  const d = new Date(fromMs);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export interface BoundaryCatchUp {
  /** How many fixed-length boundaries to actually process this call. */
  boundariesToProcess: number;
  /** How many boundaries were skipped because the catch-up cap was hit. */
  forfeited: number;
}

/**
 * Computes how many FIXED-length boundaries (every `intervalMs`) lie
 * strictly between `cursor` (the epoch ms of the last boundary this
 * subsystem actually processed) and `now`, capped at `maxBoundaries` so a
 * save restored after a year - or a system clock jumped far forward -
 * can never spin through hundreds of catch-up iterations or hang the app.
 *
 * This is the piece that makes tick(24h) once and tick(1min) applied 1440
 * times produce identical results: both call patterns are required to
 * process exactly the same boundaries, in the same order, each consuming
 * RNG draws the same way, rather than one "jumping straight to now" and
 * skipping the intermediate crossings entirely. Callers loop
 * `boundariesToProcess` times, advancing their own cursor by `intervalMs`
 * (or by whatever their specific boundary function returns, for
 * calendar-day cases - see nextLocalDayBoundary) each iteration, and if
 * `forfeited > 0`, jump their cursor straight to the most recent boundary
 * at-or-before `now` afterward so the forfeited middle boundaries are
 * never replayed on a later call.
 *
 * Handles a clock that moves BACKWARD (user changed the system time, a
 * DST fallback, a save restored from "the future") by returning zero
 * boundaries to process - this never loops negative and never asks the
 * caller to rewind its cursor.
 */
export function boundariesElapsed(cursor: number, now: number, intervalMs: number, maxBoundaries: number): BoundaryCatchUp {
  if (now <= cursor || intervalMs <= 0) {
    return { boundariesToProcess: 0, forfeited: 0 };
  }
  const totalBoundaries = Math.floor((now - cursor) / intervalMs);
  if (totalBoundaries <= maxBoundaries) {
    return { boundariesToProcess: totalBoundaries, forfeited: 0 };
  }
  return { boundariesToProcess: maxBoundaries, forfeited: totalBoundaries - maxBoundaries };
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
