import { Store } from "../dom";

export type ThemeMode = "light" | "dark" | "system";
export type TabDock = "left" | "right" | "top" | "bottom";

export interface RenderQualitySettings {
  /** Novice control: 1 (fastest/lowest) .. 5 (best/highest). "custom" means
   * the underlying advanced values do not match any documented level. */
  speedLevel: 1 | 2 | 3 | 4 | 5 | "custom";
  shadowQuality: "off" | "low" | "medium" | "high";
  drawDistance: number;
  antiAliasing: boolean;
  particleDensity: number;
}

export interface AppSettings {
  theme: ThemeMode;
  density: number;
  accentSeedHue: number;
  fontFamily: string;
  fontSizeScale: number;
  fontWeight: number;
  showEmojisInDialogs: boolean;
  tabDock: TabDock;
  renderQuality: RenderQualitySettings;
}

const STORAGE_KEY = "meadowmark.settings.v1";

const RENDER_QUALITY_PRESETS: Record<1 | 2 | 3 | 4 | 5, RenderQualitySettings> = {
  1: { speedLevel: 1, shadowQuality: "off", drawDistance: 200, antiAliasing: false, particleDensity: 0.2 },
  2: { speedLevel: 2, shadowQuality: "low", drawDistance: 350, antiAliasing: false, particleDensity: 0.4 },
  3: { speedLevel: 3, shadowQuality: "medium", drawDistance: 500, antiAliasing: true, particleDensity: 0.6 },
  4: { speedLevel: 4, shadowQuality: "high", drawDistance: 700, antiAliasing: true, particleDensity: 0.8 },
  5: { speedLevel: 5, shadowQuality: "high", drawDistance: 1000, antiAliasing: true, particleDensity: 1.0 },
};

export function renderQualityPreset(level: 1 | 2 | 3 | 4 | 5): RenderQualitySettings {
  return { ...RENDER_QUALITY_PRESETS[level] };
}

/** Determines whether the current advanced render values match one of the
 * documented novice presets exactly, or should read as "custom". */
export function classifyRenderQuality(values: Omit<RenderQualitySettings, "speedLevel">): 1 | 2 | 3 | 4 | 5 | "custom" {
  for (const level of [1, 2, 3, 4, 5] as const) {
    const preset = RENDER_QUALITY_PRESETS[level];
    if (
      preset.shadowQuality === values.shadowQuality &&
      preset.drawDistance === values.drawDistance &&
      preset.antiAliasing === values.antiAliasing &&
      preset.particleDensity === values.particleDensity
    ) {
      return level;
    }
  }
  return "custom";
}

function defaults(): AppSettings {
  return {
    theme: "system",
    density: 1,
    accentSeedHue: 122,
    fontFamily: "system-ui",
    fontSizeScale: 1,
    fontWeight: 400,
    showEmojisInDialogs: true,
    tabDock: "left",
    renderQuality: renderQualityPreset(3),
  };
}

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    // ignore corrupt/unavailable storage; fall back to defaults
  }
  return defaults();
}

export const settingsStore = new Store<AppSettings>(load());

settingsStore.subscribe((value) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
});

export function resetSettingsToDefaults(): void {
  settingsStore.set(defaults());
}
