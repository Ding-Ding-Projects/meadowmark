/**
 * Converts one canonical square RGBA8 image into the fixed set of PNG
 * size variants and the multi-resolution .ico this app actually
 * consumes.
 *
 * Every emitted file is verified before it is returned: signature,
 * declared vs. decoded dimensions, and a full decode round-trip through
 * this module's own PNG decoder. If ANY variant fails verification, the
 * whole call throws `ConversionVerificationError` and returns nothing --
 * there is no partial `LogoAssetSet`. This is what lets the storage
 * layer guarantee the previously-applied logo stays active whenever a
 * conversion attempt fails: nothing here is ever handed to storage until
 * every single output has been proven correct.
 */
import { MAX_OUTPUT_VARIANTS } from './bounds';
import { ConversionVerificationError, InvalidEditParametersError } from './errors';
import { encodeIco, verifyIco, type IcoEntrySource } from './ico-encoder';
import { resizeBilinear } from './image-ops';
import { decodePng, encodePng } from './png-codec';
import type { LogoAssetSet, LogoAssetVariant, RGBA8Image } from './types';

/** Raster PNG sizes the app's UI actually renders the logo at. */
export const DEFAULT_VARIANT_SIZES: readonly number[] = [32, 48, 64, 128, 256, 512];

/** Sizes packed into the generated Windows .ico (kept within MAX_ICO_ENTRIES). */
export const DEFAULT_ICO_SIZES: readonly number[] = [16, 24, 32, 48, 64, 128, 256];

/**
 * Verifies one generated PNG variant: a real PNG signature (implicit in
 * `decodePng` succeeding at all), declared vs. decoded dimensions, the
 * expected RGBA8 buffer size, and -- by decoding it at all -- that the
 * alpha channel this encoder always emits survives a full round trip
 * rather than being silently dropped or corrupted.
 */
function verifyPngVariant(size: number, png: Buffer, original: RGBA8Image): void {
  let decoded;
  try {
    decoded = decodePng(png);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConversionVerificationError(`variant-${size}`, `Round-trip decode of the ${size}px PNG failed: ${message}`);
  }
  if (decoded.width !== size || decoded.height !== size) {
    throw new ConversionVerificationError(
      `variant-${size}`,
      `${size}px PNG variant decoded to ${decoded.width}x${decoded.height} instead of ${size}x${size}.`,
    );
  }
  if (decoded.data.length !== size * size * 4) {
    throw new ConversionVerificationError(`variant-${size}`, `${size}px PNG variant has an unexpected pixel buffer size.`);
  }
  if (!decoded.data.equals(original.data)) {
    throw new ConversionVerificationError(
      `variant-${size}`,
      `${size}px PNG variant did not decode back to the exact pixels it was encoded from.`,
    );
  }
}

/**
 * Generates every configured PNG size variant plus the .ico, verifying
 * each before returning. `source` must already be the canonical square
 * image produced by `applyLogoEdit`.
 */
export function generateLogoAssetSet(
  source: RGBA8Image,
  options: { variantSizes?: readonly number[]; icoSizes?: readonly number[] } = {},
): LogoAssetSet {
  const variantSizes = options.variantSizes ?? DEFAULT_VARIANT_SIZES;
  const icoSizes = options.icoSizes ?? DEFAULT_ICO_SIZES;

  if (source.width !== source.height) {
    throw new InvalidEditParametersError('generateLogoAssetSet: source image must be square.');
  }
  if (variantSizes.length > MAX_OUTPUT_VARIANTS) {
    throw new InvalidEditParametersError(
      `generateLogoAssetSet: ${variantSizes.length} variant sizes exceeds the maximum of ${MAX_OUTPUT_VARIANTS}.`,
    );
  }

  const resizedBySize = new Map<number, RGBA8Image>();
  const getResized = (size: number): RGBA8Image => {
    const existing = resizedBySize.get(size);
    if (existing) return existing;
    if (!Number.isInteger(size) || size <= 0 || size > 2048) {
      throw new InvalidEditParametersError(`generateLogoAssetSet: invalid output size ${size}.`);
    }
    const resized = resizeBilinear(source, size, size);
    resizedBySize.set(size, resized);
    return resized;
  };

  const variants: LogoAssetVariant[] = [];
  for (const size of variantSizes) {
    const resized = getResized(size);
    const png = encodePng(resized);
    verifyPngVariant(size, png, resized);
    variants.push({ size, png });
  }

  const icoEntries: IcoEntrySource[] = icoSizes.map((size) => {
    const resized = getResized(size);
    const png = encodePng(resized);
    verifyPngVariant(size, png, resized);
    return { size, png };
  });

  const ico = encodeIco(icoEntries);
  let icoVerification;
  try {
    icoVerification = verifyIco(ico);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConversionVerificationError('ico', `Generated .ico failed verification: ${message}`);
  }
  if (icoVerification.entryCount !== icoSizes.length) {
    throw new ConversionVerificationError(
      'ico',
      `Generated .ico has ${icoVerification.entryCount} entries; expected ${icoSizes.length}.`,
    );
  }

  return {
    variants,
    ico,
    icoSizes: icoVerification.sizes,
    sourceWidth: source.width,
    sourceHeight: source.height,
    generatedAt: new Date().toISOString(),
  };
}
