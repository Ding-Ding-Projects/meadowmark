/**
 * quality.ts — render quality settings.
 *
 * Exposes the raw advanced values directly, AND a novice 1-5 "Speed" level
 * that maps onto them. The mapping is written out as a plain table below so
 * it is checkable by reading the code, rather than merely asserted in prose.
 *
 * When the raw values on hand match none of the five documented levels —
 * because the user, a script, or an older save set them directly — callers
 * must report an explicit "Custom" state rather than silently snapping to
 * the nearest level. Merely computing/displaying "Custom" must never itself
 * overwrite the raw values; only `applySpeedLevel()`, called from a
 * deliberate move of the novice control, is allowed to write them.
 */

export interface QualitySettings {
  shadowMapResolution: 512 | 1024 | 2048 | 4096;
  lodDistance: number; // world units at which billboard LOD kicks in
  instancingBudget: number; // max instances per pool before culling kicks in
  antialiasing: boolean;
  dayNightEnabled: boolean;
  villagerCount: number;
}

export type SpeedLevel = 1 | 2 | 3 | 4 | 5;

/**
 * The checkable mapping table. Index 0 => level 1 (fastest/lowest quality),
 * index 4 => level 5 (slowest/highest quality). `quality.ts` and any test
 * asserting the mapping should both read from this single table.
 */
export const SPEED_LEVEL_TABLE: Record<SpeedLevel, QualitySettings> = {
  1: {
    shadowMapResolution: 512,
    lodDistance: 14,
    instancingBudget: 400,
    antialiasing: false,
    dayNightEnabled: false,
    villagerCount: 4,
  },
  2: {
    shadowMapResolution: 1024,
    lodDistance: 18,
    instancingBudget: 800,
    antialiasing: false,
    dayNightEnabled: true,
    villagerCount: 8,
  },
  3: {
    shadowMapResolution: 2048,
    lodDistance: 24,
    instancingBudget: 1500,
    antialiasing: true,
    dayNightEnabled: true,
    villagerCount: 12,
  },
  4: {
    shadowMapResolution: 2048,
    lodDistance: 32,
    instancingBudget: 2500,
    antialiasing: true,
    dayNightEnabled: true,
    villagerCount: 20,
  },
  5: {
    shadowMapResolution: 4096,
    lodDistance: 48,
    instancingBudget: 4000,
    antialiasing: true,
    dayNightEnabled: true,
    villagerCount: 32,
  },
};

export const DEFAULT_SPEED_LEVEL: SpeedLevel = 3;

export function speedLevelSettings(level: SpeedLevel): QualitySettings {
  return { ...SPEED_LEVEL_TABLE[level] };
}

function settingsEqual(a: QualitySettings, b: QualitySettings): boolean {
  return (
    a.shadowMapResolution === b.shadowMapResolution &&
    a.lodDistance === b.lodDistance &&
    a.instancingBudget === b.instancingBudget &&
    a.antialiasing === b.antialiasing &&
    a.dayNightEnabled === b.dayNightEnabled &&
    a.villagerCount === b.villagerCount
  );
}

/**
 * Determine which speed level (if any) the given raw settings correspond
 * to. Returns 'custom' when the values match no documented level exactly —
 * this must never be treated as a licence to overwrite the raw values with
 * the nearest level's; it is purely a read-only classification for the UI.
 */
export function detectSpeedLevel(settings: QualitySettings): SpeedLevel | 'custom' {
  for (const level of [1, 2, 3, 4, 5] as SpeedLevel[]) {
    if (settingsEqual(settings, SPEED_LEVEL_TABLE[level])) return level;
  }
  return 'custom';
}

export class QualityController {
  private settings: QualitySettings;

  constructor(initial: QualitySettings = speedLevelSettings(DEFAULT_SPEED_LEVEL)) {
    this.settings = { ...initial };
  }

  getSettings(): Readonly<QualitySettings> {
    return this.settings;
  }

  getSpeedLevel(): SpeedLevel | 'custom' {
    return detectSpeedLevel(this.settings);
  }

  /** Called only from a deliberate move of the novice "Speed" control. */
  applySpeedLevel(level: SpeedLevel): void {
    this.settings = speedLevelSettings(level);
  }

  /** Called from the advanced settings surface; may produce a "Custom" state. */
  setRaw(partial: Partial<QualitySettings>): void {
    this.settings = { ...this.settings, ...partial };
  }
}
