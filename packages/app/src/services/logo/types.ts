/** A decoded, in-memory bitmap: straight (non-premultiplied) RGBA8, row-major, top-to-bottom. */
export interface RGBA8Image {
  readonly width: number;
  readonly height: number;
  /** Exactly `width * height * 4` bytes: R,G,B,A per pixel, 8 bits each. */
  readonly data: Buffer;
}

export interface RGBAColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export const TRANSPARENT: RGBAColor = { r: 0, g: 0, b: 0, a: 0 };

export type DetectedFormat = 'png' | 'jpeg' | 'svg' | 'unknown';

export interface FormatDetectionResult {
  readonly format: DetectedFormat;
  /** True only for formats this module can actually decode to pixels (PNG). */
  readonly decodable: boolean;
  /** Present when `decodable` is false: exactly why, for a user-facing message. */
  readonly unsupportedReason?: string;
}

export type FitMode = 'cover' | 'contain' | 'fill';

export interface NormalizedPoint {
  /** 0..1 across the image, left-to-right. */
  readonly x: number;
  /** 0..1 across the image, top-to-bottom. */
  readonly y: number;
}

export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A user's editing decisions, applied in this fixed order: crop, then
 * fit into the target canvas, then flatten onto the background (if the
 * fit mode leaves transparent letterbox area, or the caller explicitly
 * wants an opaque result).
 */
export interface LogoEditParams {
  /** Optional manual crop in source-pixel coordinates, applied first. */
  readonly crop?: CropRect;
  readonly fit: FitMode;
  /** Used by 'cover': which part of the (cropped) image to keep centered. Default {x:0.5,y:0.5}. */
  readonly focalPoint?: NormalizedPoint;
  /** Background shown behind transparent pixels / 'contain' letterbox area. */
  readonly background: RGBAColor;
}

export interface SafeAreaRect extends CropRect {}

export interface LogoPresetSummary {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

/** One generated raster variant: a square PNG at `size` device pixels. */
export interface LogoAssetVariant {
  readonly size: number;
  readonly png: Buffer;
}

export interface LogoAssetSet {
  readonly variants: readonly LogoAssetVariant[];
  readonly ico: Buffer;
  readonly icoSizes: readonly number[];
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly generatedAt: string;
}

export type LogoSelection =
  | { readonly type: 'preset'; readonly presetId: string }
  | { readonly type: 'custom' };

export interface LogoManifest {
  readonly schemaVersion: 1;
  readonly selection: LogoSelection;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly generatedAt: string;
  readonly assetDir: string;
  readonly variantFiles: readonly { readonly size: number; readonly fileName: string }[];
  readonly icoFileName: string;
}
