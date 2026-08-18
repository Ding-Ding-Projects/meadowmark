/**
 * Bounded JPEG header probe.
 *
 * This module does NOT decode JPEG pixel data -- baseline/progressive
 * DCT decoding is substantial, and this project ships no image
 * dependency to lean on. What it does is walk the JFIF/EXIF marker
 * stream far enough to report the image's real dimensions (for bounds
 * checking and an honest UI message) without ever touching entropy-coded
 * scan data. The walk is strictly bounded so a malformed or adversarial
 * file cannot spin it forever.
 */
import { byteAt } from './bytes';
import { JPEG_PROBE_MAX_SEGMENTS } from './bounds';

export interface JpegProbeResult {
  readonly width: number;
  readonly height: number;
  readonly precision: number;
  readonly progressive: boolean;
}

/** Start-of-frame markers that carry dimensions. Excludes DHT (0xC4), JPG (0xC8), DAC (0xCC). */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const PROGRESSIVE_MARKERS = new Set([0xc2, 0xc6, 0xca, 0xce]);

/** Markers with no length-prefixed payload to skip over. */
const STANDALONE_MARKERS = new Set([
  0xd8, // SOI
  0xd9, // EOI
  0x01, // TEM
  ...Array.from({ length: 8 }, (_, i) => 0xd0 + i), // RST0..RST7
]);

/**
 * Parses just enough of a JPEG marker stream to recover the image
 * dimensions. Returns `undefined` if no SOF marker is found within the
 * bounded segment walk (never throws on malformed input -- an unusable
 * probe result is reported as "unsupported", not as a crash).
 */
export function probeJpeg(buf: Buffer): JpegProbeResult | undefined {
  if (buf.length < 4 || byteAt(buf, 0) !== 0xff || byteAt(buf, 1) !== 0xd8) {
    return undefined;
  }

  let offset = 2;
  let segments = 0;

  while (offset < buf.length && segments < JPEG_PROBE_MAX_SEGMENTS) {
    segments += 1;

    // Markers are introduced by 0xFF; skip any fill bytes (0xFF padding).
    if (byteAt(buf, offset) !== 0xff) return undefined;
    while (offset < buf.length && byteAt(buf, offset) === 0xff) {
      offset += 1;
    }
    if (offset >= buf.length) return undefined;

    const marker = byteAt(buf, offset);
    offset += 1;

    if (marker === 0xd9 /* EOI */) return undefined;
    if (STANDALONE_MARKERS.has(marker)) continue;

    if (offset + 2 > buf.length) return undefined;
    const segmentLength = buf.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buf.length) return undefined;

    if (SOF_MARKERS.has(marker)) {
      // Segment layout: length(2) precision(1) height(2) width(2) ...
      if (segmentLength < 7) return undefined;
      const precision = byteAt(buf, offset + 2);
      const height = buf.readUInt16BE(offset + 3);
      const width = buf.readUInt16BE(offset + 5);
      return { width, height, precision, progressive: PROGRESSIVE_MARKERS.has(marker) };
    }

    if (marker === 0xda /* SOS */) {
      // Entropy-coded data follows; we never parse or decode it.
      return undefined;
    }

    offset += segmentLength;
  }

  return undefined;
}
