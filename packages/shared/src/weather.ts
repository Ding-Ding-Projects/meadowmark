/**
 * Weather: a single simulated weather kind (clear/rain/snow/fog) that
 * rerolls on a fixed interval, purely for the renderer's sky/particle
 * effects - nothing in the simulation's economy/growth math reads it.
 * Rerolls go through the same fixed-interval boundary-crossing catch-up
 * loop as village.ts's tickVillage (see time.ts's boundariesElapsed), so
 * tick(24h) once and 1440x tick(1min) draw identical weather rolls in
 * identical order regardless of how the elapsed time was chunked into
 * tick() calls.
 */

import type { GameEvent, GameState, WeatherKind, WeatherState } from "./types.js";
import { HOUR_MS, MAX_OFFLINE_MS, boundariesElapsed } from "./time.js";
import { pick, scopedRng } from "./rng.js";

export const WEATHER_CHANGE_INTERVAL_MS = 6 * HOUR_MS;

/** Rerolls happen at most once per WEATHER_CHANGE_INTERVAL_MS boundary, so the catch-up cap is the offline clamp expressed in that interval. */
export const WEATHER_MAX_CATCHUP_BOUNDARIES = Math.floor(MAX_OFFLINE_MS / WEATHER_CHANGE_INTERVAL_MS);

/** Weighted toward clear so most play sessions actually see clear skies. */
const WEATHER_POOL: readonly WeatherKind[] = ["clear", "clear", "clear", "rain", "fog", "snow"];

export function createInitialWeather(now: number): WeatherState {
  return { kind: "clear", lastChangeAt: now };
}

function rollWeather(atTime: number): WeatherKind {
  const rng = scopedRng("weather", atTime);
  return pick(rng, WEATHER_POOL);
}

/**
 * Rerolls the current weather kind at most once per
 * WEATHER_CHANGE_INTERVAL_MS boundary actually crossed since the last
 * call - the same boundary-crossing catch-up shape as village.ts's
 * tickVillage/mine.ts's tickMine. Each processed boundary rolls anchored
 * at that boundary's own timestamp (not `now`), which is what keeps the
 * coarse-vs-fine tick() chunking bit-identical.
 */
export function tickWeather(state: GameState, now: number): { state: GameState; events: GameEvent[] } {
  const cursor0 = state.weather.lastChangeAt;
  let cursor = cursor0;
  let kind = state.weather.kind;

  if (now > cursor0) {
    const { boundariesToProcess, forfeited } = boundariesElapsed(
      cursor0,
      now,
      WEATHER_CHANGE_INTERVAL_MS,
      WEATHER_MAX_CATCHUP_BOUNDARIES,
    );
    for (let i = 0; i < boundariesToProcess; i++) {
      cursor += WEATHER_CHANGE_INTERVAL_MS;
      kind = rollWeather(cursor);
    }
    if (forfeited > 0) {
      kind = rollWeather(now);
      cursor = now;
    }
  }
  // else: clock moved backward or no boundary has elapsed yet - never
  // rewind the cursor, just leave the current weather as it is.

  return { state: { ...state, weather: { kind, lastChangeAt: cursor } }, events: [] };
}
