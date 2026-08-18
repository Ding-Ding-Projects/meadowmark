/**
 * App-logo customization — renderer-side bridge to the main process's logo
 * manager (packages/app/src/services/logo), reached through
 * window.meadowmark.logo. Mirrors history/bridge.ts and exports/bridge.ts:
 * typed loosely here (this package never imports packages/app), resolved
 * through `unknown` at the boundary.
 */

export interface LogoPresetSummary {
  id: string;
  label: string;
  description: string;
}

export type LogoSelection = { type: "preset"; presetId: string } | { type: "custom" };

export interface LogoManifest {
  schemaVersion: 1;
  selection: LogoSelection;
  sourceWidth: number;
  sourceHeight: number;
  generatedAt: string;
  assetDir: string;
  variantFiles: { size: number; fileName: string }[];
  icoFileName: string;
}

interface LogoBridge {
  listPresets: () => Promise<readonly LogoPresetSummary[]>;
  getManifest: () => Promise<LogoManifest | null>;
  previewPreset: (presetId: string) => Promise<string>;
  previewCurrent: () => Promise<string | null>;
  applyPreset: (presetId: string) => Promise<LogoManifest>;
  pickAndApplyCustom: () => Promise<LogoManifest | { canceled: true }>;
  reset: () => Promise<void>;
}

function hostLogoBridge(): LogoBridge | null {
  const maybeWindow = window as unknown as { meadowmark?: { logo?: LogoBridge } };
  return maybeWindow.meadowmark?.logo ?? null;
}

/** True whenever the app is running inside the Electron host with the logo
 * bridge exposed. The browser/static fallback build has no main process to
 * decode/convert/store images in, so the logo panel shows an honest "not
 * available outside the app" state there instead. */
export function hasLogoBridge(): boolean {
  return hostLogoBridge() !== null;
}

export async function listLogoPresets(): Promise<readonly LogoPresetSummary[]> {
  const bridge = hostLogoBridge();
  if (!bridge) return [];
  return bridge.listPresets();
}

export async function getLogoManifest(): Promise<LogoManifest | null> {
  const bridge = hostLogoBridge();
  if (!bridge) return null;
  return bridge.getManifest();
}

export async function previewLogoPreset(presetId: string): Promise<string | null> {
  const bridge = hostLogoBridge();
  if (!bridge) return null;
  return bridge.previewPreset(presetId);
}

export async function previewCurrentLogo(): Promise<string | null> {
  const bridge = hostLogoBridge();
  if (!bridge) return null;
  return bridge.previewCurrent();
}

export async function applyLogoPreset(presetId: string): Promise<LogoManifest | null> {
  const bridge = hostLogoBridge();
  if (!bridge) return null;
  return bridge.applyPreset(presetId);
}

/** Opens the native file picker (in the main process) for a PNG upload and,
 * unless the user cancels, decodes/converts/persists it as the active
 * logo. Returns null when the bridge is unavailable. */
export async function pickAndApplyCustomLogo(): Promise<LogoManifest | { canceled: true } | null> {
  const bridge = hostLogoBridge();
  if (!bridge) return null;
  return bridge.pickAndApplyCustom();
}

export async function resetLogoToDefault(): Promise<boolean> {
  const bridge = hostLogoBridge();
  if (!bridge) return false;
  await bridge.reset();
  return true;
}
