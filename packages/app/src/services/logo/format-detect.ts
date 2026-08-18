/**
 * Byte-signature format detection.
 *
 * Never trust a file extension or a claimed MIME type -- both are just
 * labels the file picker or the filesystem hands back, and either can
 * lie (accidentally or otherwise). Every decision here is made by
 * reading the actual leading bytes of the file.
 */
import { FORMAT_SNIFF_BYTES, SVG_PROBE_MAX_BYTES } from './bounds';
import type { DetectedFormat, FormatDetectionResult } from './types';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function startsWith(buf: Buffer, signature: Buffer): boolean {
  if (buf.length < signature.length) return false;
  return buf.subarray(0, signature.length).equals(signature);
}

function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * SVG has no fixed magic number: it is XML text, optionally preceded by
 * a UTF-8 BOM, whitespace, an XML declaration, and/or a DOCTYPE, before
 * the `<svg` root element appears. We scan a bounded prefix of the file
 * as UTF-8 text and look for an `<svg` tag start; anything not matching
 * within that bounded window is not treated as SVG.
 */
function isLikelySvg(buf: Buffer): boolean {
  const prefixLength = Math.min(buf.length, SVG_PROBE_MAX_BYTES);
  let text: string;
  try {
    text = buf.subarray(0, prefixLength).toString('utf8');
  } catch {
    return false;
  }
  // Strip a UTF-8 BOM if present.
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const trimmedStart = withoutBom.trimStart();
  if (trimmedStart.length === 0) return false;
  // Must look like XML/SVG near the very start: an XML prolog, a
  // DOCTYPE, an XML comment, or the svg tag itself. This deliberately
  // rejects arbitrary text files that merely contain the substring
  // "<svg" somewhere deep inside.
  const looksLikeXmlPrefix = /^(<\?xml|<!doctype|<!--|<svg\b)/i.test(trimmedStart);
  if (!looksLikeXmlPrefix) return false;
  return /<svg[\s>]/i.test(withoutBom);
}

/**
 * Identifies the format of `buf` from its actual bytes and states
 * whether this module can decode it to pixels. PNG is the only format
 * decoded here (see png-codec.ts); JPEG and SVG are recognized well
 * enough to report an honest, specific "why not" instead of a generic
 * failure.
 */
export function detectFormat(buf: Buffer): FormatDetectionResult {
  const sniffWindow = buf.subarray(0, Math.min(buf.length, FORMAT_SNIFF_BYTES));

  if (startsWith(buf, PNG_SIGNATURE)) {
    return { format: 'png', decodable: true };
  }

  if (isJpeg(sniffWindow)) {
    return {
      format: 'jpeg',
      decodable: false,
      unsupportedReason:
        'JPEG decoding is not implemented in this build. Only the file header is read to ' +
        'identify the format and its dimensions; no pixel data is decoded, so a JPEG cannot ' +
        'currently be used as a logo source. Use a PNG instead.',
    };
  }

  if (isLikelySvg(buf)) {
    return {
      format: 'svg',
      decodable: false,
      unsupportedReason:
        'SVG rasterization is not implemented in this build. Vector logo sources are not ' +
        'currently supported; export or save the image as a PNG instead.',
    };
  }

  const format: DetectedFormat = 'unknown';
  return {
    format,
    decodable: false,
    unsupportedReason: 'The file does not match any recognized image format (PNG, JPEG, or SVG).',
  };
}
