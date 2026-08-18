/**
 * Top-level "accept an uploaded file's bytes" entry point.
 *
 * This is the one function that should ever see raw, untrusted upload
 * bytes. It enforces the input-size bound first (before any parsing),
 * sniffs the real format from the bytes, and either decodes it (PNG) or
 * throws a specific, honest `UnsupportedFormatError` /
 * `UnknownFormatError` naming exactly why (JPEG/SVG headers are probed
 * only far enough to build that message). There is no partial-decode
 * return value: a call either returns a fully decoded image or throws.
 */
import { MAX_INPUT_BYTES } from './bounds';
import { InputTooLargeError, UnknownFormatError, UnsupportedFormatError } from './errors';
import { detectFormat } from './format-detect';
import { probeJpeg } from './jpeg-probe';
import { decodePng } from './png-codec';
import { probeSvg } from './svg-probe';
import type { RGBA8Image } from './types';

export interface SourceDescription {
  readonly format: 'png' | 'jpeg' | 'svg' | 'unknown';
  readonly width?: number;
  readonly height?: number;
}

/**
 * Identifies an upload's format and, for formats this module cannot
 * decode, whatever bounded header information is available (dimensions
 * for JPEG/SVG). Never decodes pixels. Useful for showing the user what
 * was detected even when the file will be rejected.
 */
export function describeSource(bytes: Buffer): SourceDescription {
  if (bytes.length > MAX_INPUT_BYTES) {
    throw new InputTooLargeError(
      `File is ${bytes.length} bytes, exceeding the maximum accepted upload size of ${MAX_INPUT_BYTES} bytes.`,
    );
  }
  const detected = detectFormat(bytes);
  if (detected.format === 'jpeg') {
    const probe = probeJpeg(bytes);
    return { format: 'jpeg', width: probe?.width, height: probe?.height };
  }
  if (detected.format === 'svg') {
    const probe = probeSvg(bytes);
    return { format: 'svg', width: probe.width, height: probe.height };
  }
  return { format: detected.format };
}

/**
 * Decodes an uploaded file's bytes into a straight RGBA8 bitmap.
 * Fail-closed: any rejection (too large, malformed, animated, an
 * unsupported-but-recognized format, or unrecognized bytes) throws a
 * typed `LogoProcessingError` and applies nothing.
 */
export function decodeSourceImage(bytes: Buffer): RGBA8Image {
  if (bytes.length > MAX_INPUT_BYTES) {
    throw new InputTooLargeError(
      `File is ${bytes.length} bytes, exceeding the maximum accepted upload size of ${MAX_INPUT_BYTES} bytes.`,
    );
  }

  const detected = detectFormat(bytes);

  if (detected.format === 'png') {
    return decodePng(bytes);
  }

  if (detected.format === 'jpeg' || detected.format === 'svg') {
    throw new UnsupportedFormatError(detected.unsupportedReason ?? 'This image format is not supported.');
  }

  throw new UnknownFormatError(detected.unsupportedReason ?? 'This file is not a recognized image format.');
}
