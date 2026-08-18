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

type HostDensity = "comfortable" | "compact" | "spacious";

interface HostSettingsValues {
  theme?: ThemeMode;
  density?: HostDensity;
  accentColorHex?: string;
  uiFontFamily?: string;
  uiFontSizeScale?: number;
  showEmojiInDialogs?: boolean;
}

interface HostSettingsPayload {
  values?: HostSettingsValues;
}

interface HostSettingsService {
  load?: () => Promise<HostSettingsPayload>;
  setMany?: (settings: HostSettingsValues) => Promise<unknown>;
}

interface HostSettingsBridge {
  settings?: HostSettingsService;
  loadSettings?: () => Promise<HostSettingsPayload>;
  saveSettings?: (settings: HostSettingsValues) => Promise<void>;
}

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

let hydratedFromHost = false;

settingsStore.subscribe((value) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
  const bridge = hostSettingsBridge();
  if (hydratedFromHost) {
    const hostValue = toHostSettings(value);
    if (bridge?.settings?.setMany) {
      void bridge.settings.setMany(hostValue);
    } else if (bridge?.saveSettings) {
      void bridge.saveSettings(hostValue);
    }
  }
});

export function resetSettingsToDefaults(): void {
  settingsStore.set(defaults());
}

export async function hydrateSettingsFromHost(): Promise<void> {
  const bridge = hostSettingsBridge();
  const loadSettings = bridge?.settings?.load ?? bridge?.loadSettings;
  if (!loadSettings) {
    hydratedFromHost = true;
    return;
  }
  try {
    const payload = await loadSettings();
    const hostValues = payload && typeof payload === "object" ? payload.values : undefined;
    if (hostValues && typeof hostValues === "object") {
      settingsStore.set({ ...settingsStore.getSnapshot(), ...fromHostSettings(hostValues) });
    }
  } catch {
    // Keep the local browser fallback if the host bridge is unavailable.
  } finally {
    hydratedFromHost = true;
  }
}

function hostSettingsBridge(): HostSettingsBridge | null {
  const maybeWindow = window as Window & { meadowmark?: HostSettingsBridge };
  return maybeWindow.meadowmark ?? null;
}

function fromHostSettings(values: HostSettingsValues): Partial<AppSettings> {
  const mapped: Partial<AppSettings> = {};
  if (values.theme) mapped.theme = values.theme;
  if (values.density) mapped.density = fromHostDensity(values.density);
  if (values.accentColorHex) mapped.accentSeedHue = hexToHue(values.accentColorHex);
  if (values.uiFontFamily) mapped.fontFamily = values.uiFontFamily;
  if (typeof values.uiFontSizeScale === "number") mapped.fontSizeScale = values.uiFontSizeScale;
  if (typeof values.showEmojiInDialogs === "boolean") mapped.showEmojisInDialogs = values.showEmojiInDialogs;
  return mapped;
}

function toHostSettings(value: AppSettings): HostSettingsValues {
  return {
    theme: value.theme,
    density: toHostDensity(value.density),
    accentColorHex: hueToHex(value.accentSeedHue),
    uiFontFamily: value.fontFamily,
    uiFontSizeScale: value.fontSizeScale,
    showEmojiInDialogs: value.showEmojisInDialogs,
  };
}

function fromHostDensity(value: HostDensity): number {
  if (value === "compact") return 0.85;
  if (value === "spacious") return 1.15;
  return 1;
}

function toHostDensity(value: number): HostDensity {
  if (value <= 0.92) return "compact";
  if (value >= 1.08) return "spacious";
  return "comfortable";
}

function hueToHex(hue: number): string {
  const normalized = (((hue % 360) + 360) % 360) / 60;
  const c = 0.56;
  const x = c * (1 - Math.abs((normalized % 2) - 1));
  const m = 0.34;
  const [r, g, b] =
    normalized < 1
      ? [c, x, 0]
      : normalized < 2
        ? [x, c, 0]
        : normalized < 3
          ? [0, c, x]
          : normalized < 4
            ? [0, x, c]
            : normalized < 5
              ? [x, 0, c]
              : [c, 0, x];
  return [r, g, b]
    .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0"))
    .join("");
}

function hexToHue(hex: string): number {
  const normalized = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return defaults().accentSeedHue;
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return defaults().accentSeedHue;
  const hue =
    max === r
      ? 60 * (((g - b) / delta) % 6)
      : max === g
        ? 60 * ((b - r) / delta + 2)
        : 60 * ((r - g) / delta + 4);
  return Math.round((hue + 360) % 360);
}
