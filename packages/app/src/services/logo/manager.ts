/**
 * High-level app-logo customization API.
 *
 * This is the surface the rest of the app (IPC handlers, settings UI)
 * should call -- it wires decode -> edit -> convert -> verify -> persist
 * together with the fail-closed contract documented on each stage:
 *
 *   - Decoding an untrusted upload never partially succeeds. It returns
 *     a fully decoded image or throws a typed `LogoProcessingError`.
 *   - Converting a source image into the app's output sizes never
 *     returns a partial asset set. Every variant is verified before any
 *     of them are handed to storage; a failure anywhere throws and
 *     nothing is written.
 *   - Persisting a verified asset set is the only step that touches
 *     disk, and it is structured so a mid-write failure there also
 *     cannot leave the app without a usable logo: see storage.ts.
 *
 * Net effect: `applyPresetSelection` / `applyCustomSelection` either
 * succeed completely (the new logo is now active) or throw and leave
 * whatever was active before completely unchanged. There is no
 * intermediate state where the caller sees "success" for something that
 * did not fully happen.
 *
 * This module changes presentation only. It never imports or derives
 * `APP_ID`, `DATA_DIR_NAME`, or any other value from `identity.ts`, and
 * it never writes outside the `logo` subdirectory of the `userDataDir`
 * it is given.
 */
import { applyLogoEdit as applyEditPure } from './edit';
import { decodeSourceImage, describeSource } from './decode-source';
import {
  DEFAULT_ICO_SIZES,
  DEFAULT_VARIANT_SIZES,
  generateLogoAssetSet as generateAssetSetPure,
} from './pipeline';
import { listPresetSummaries, renderPreset } from './presets';
import {
  clearLogoSelection as clearLogoSelectionStorage,
  persistLogoAssetSet,
  readLogoAsset as readLogoAssetStorage,
  readLogoManifest,
} from './storage';
import type {
  LogoAssetSet,
  LogoEditParams,
  LogoManifest,
  LogoPresetSummary,
  RGBA8Image,
} from './types';
import type { SourceDescription } from './decode-source';

export type {
  CropRect,
  FitMode,
  LogoAssetSet,
  LogoAssetVariant,
  LogoEditParams,
  LogoManifest,
  LogoPresetSummary,
  LogoSelection,
  NormalizedPoint,
  RGBA8Image,
  RGBAColor,
  SafeAreaRect,
} from './types';
export type { SourceDescription } from './decode-source';
export {
  LogoProcessingError,
  InputTooLargeError,
  ImageTooLargeError,
  MalformedImageError,
  AnimatedImageError,
  DecodeBudgetExceededError,
  UnsupportedFormatError,
  UnknownFormatError,
  InvalidEditParametersError,
  ConversionVerificationError,
  UnknownPresetError,
  LogoStorageError,
} from './errors';
export type { LogoErrorCode } from './errors';
export { computeSafeArea } from './image-ops';
export { CANONICAL_SIZE } from './edit';

/** Lists the shipped logo presets available to choose from. */
export function listLogoPresets(): readonly LogoPresetSummary[] {
  return listPresetSummaries();
}

/** Renders a shipped preset to a decoded bitmap, ready for `applyLogoEdit`/asset generation. */
export function getPresetImage(presetId: string): RGBA8Image {
  return renderPreset(presetId);
}

/**
 * Identifies the format of an upload's bytes (and its dimensions, where
 * that can be read from a bounded header probe) without decoding
 * pixels. Safe to call on any upload before committing to a full decode.
 */
export function describeUpload(bytes: Buffer): SourceDescription {
  return describeSource(bytes);
}

/**
 * Decodes an uploaded file's bytes into a straight RGBA8 bitmap. See
 * `decode-source.ts` for the exact fail-closed contract: this either
 * returns a fully decoded image or throws.
 */
export function decodeUploadedImage(bytes: Buffer): RGBA8Image {
  return decodeSourceImage(bytes);
}

/** Applies crop/fit/background edits, producing the canonical square image the pipeline consumes. */
export function applyLogoEdit(source: RGBA8Image, edits: LogoEditParams): RGBA8Image {
  return applyEditPure(source, edits);
}

/** Generates and verifies every output size variant plus the .ico from a canonical square image. */
export function buildLogoAssetSet(
  canonicalImage: RGBA8Image,
  options?: { variantSizes?: readonly number[]; icoSizes?: readonly number[] },
): LogoAssetSet {
  return generateAssetSetPure(canonicalImage, {
    variantSizes: options?.variantSizes ?? DEFAULT_VARIANT_SIZES,
    icoSizes: options?.icoSizes ?? DEFAULT_ICO_SIZES,
  });
}

/**
 * Full pipeline for choosing a shipped preset as the active logo:
 * render -> build asset set -> persist. Throws (and leaves the
 * previously active logo untouched) if anything fails.
 */
export async function applyPresetSelection(userDataDir: string, presetId: string): Promise<LogoManifest> {
  const image = renderPreset(presetId);
  const assetSet = generateAssetSetPure(image);
  return persistLogoAssetSet(userDataDir, assetSet, { type: 'preset', presetId });
}

/**
 * Full pipeline for choosing an uploaded custom image as the active
 * logo: decode -> edit -> build asset set -> persist. Throws (and
 * leaves the previously active logo untouched) if anything fails at any
 * stage, including a decode rejection, an out-of-range edit, or a
 * conversion verification failure.
 */
export async function applyCustomSelection(
  userDataDir: string,
  sourceBytes: Buffer,
  edits: LogoEditParams,
): Promise<LogoManifest> {
  const decoded = decodeSourceImage(sourceBytes);
  const edited = applyEditPure(decoded, edits);
  const assetSet = generateAssetSetPure(edited);
  return persistLogoAssetSet(userDataDir, assetSet, { type: 'custom' });
}

/** Reads the currently active logo's manifest, or `null` if none is set (use the shipped default). */
export async function getCurrentLogoManifest(userDataDir: string): Promise<LogoManifest | null> {
  return readLogoManifest(userDataDir);
}

/** Reads one stored asset file (a PNG variant by size, or the .ico) referenced by a manifest. */
export async function readLogoAsset(
  userDataDir: string,
  manifest: LogoManifest,
  which: { readonly size: number } | 'ico',
): Promise<Buffer> {
  return readLogoAssetStorage(userDataDir, manifest, which);
}

/** Clears the current logo selection and purges every derived asset, reverting to the shipped default. */
export async function resetLogoToShippedDefault(userDataDir: string): Promise<void> {
  return clearLogoSelectionStorage(userDataDir);
}
