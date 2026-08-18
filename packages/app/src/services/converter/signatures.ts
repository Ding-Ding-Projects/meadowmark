/**
 * Bounded byte-level format detection ("magic numbers").
 *
 * This module NEVER trusts a file extension or a caller-claimed MIME
 * type. It reads only a small bounded prefix (and, for a few
 * trailer-anchored formats, a small bounded suffix) of the source bytes
 * and matches them against known signatures. This list intentionally
 * covers many more formats than this build has enabled adapters for —
 * recognising "this is a PNG" is what lets the registry show an honest
 * disabled entry ("Convert PNG to JPEG — needs a bundled image codec,
 * not present in this build") instead of just saying "unknown file".
 */

import type { ByteSignature, ConverterCategory } from './types';

/** How many bytes of prefix we ever inspect for signature matching. Well
 * above the longest known signature offset+length, small enough to be a
 * negligible read even for a huge file. */
export const SIGNATURE_PREFIX_BYTES = 4096;

/** How many trailing bytes we inspect for trailer-anchored formats (ZIP's
 * End Of Central Directory record can be preceded by up to 65535 bytes of
 * archive comment, so this window has to be generous). */
export const SIGNATURE_SUFFIX_BYTES = 65557; // 22-byte EOCD + max 65535-byte comment

export interface KnownFormat {
  formatId: string;
  label: string;
  category: ConverterCategory;
  signatures: readonly ByteSignature[];
}

function sig(offset: number, ...bytes: number[]): ByteSignature {
  return { offset, bytes };
}

const ASCII = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

/**
 * The known-format database. Grouped by category. `formatId` values here
 * are the canonical ids used throughout the registry and adapters.
 */
export const KNOWN_FORMATS: readonly KnownFormat[] = [
  // ---- Documents / PDF -------------------------------------------------
  { formatId: 'pdf', label: 'PDF document', category: 'documents-pdf', signatures: [sig(0, ...ASCII('%PDF-'))] },
  // OOXML documents (docx/xlsx/pptx) are ZIP containers with a specific
  // first entry name; we detect the ZIP shell here and let the archive
  // adapter's inspector distinguish OOXML from a plain ZIP by entry name.
  {
    formatId: 'ooxml-zip',
    label: 'Office Open XML document (docx/xlsx/pptx)',
    category: 'documents-pdf',
    signatures: [sig(0, 0x50, 0x4b, 0x03, 0x04)],
  },
  { formatId: 'rtf', label: 'Rich Text Format document', category: 'documents-pdf', signatures: [sig(0, ...ASCII('{\\rtf'))] },

  // ---- Images ------------------------------------------------------------
  { formatId: 'png', label: 'PNG image', category: 'images', signatures: [sig(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)] },
  { formatId: 'jpeg', label: 'JPEG image', category: 'images', signatures: [sig(0, 0xff, 0xd8, 0xff)] },
  { formatId: 'gif', label: 'GIF image', category: 'images', signatures: [sig(0, ...ASCII('GIF87a')), sig(0, ...ASCII('GIF89a'))] },
  { formatId: 'bmp', label: 'BMP image', category: 'images', signatures: [sig(0, 0x42, 0x4d)] },
  { formatId: 'webp', label: 'WebP image', category: 'images', signatures: [sig(0, ...ASCII('RIFF')), sig(8, ...ASCII('WEBP'))] },
  { formatId: 'tiff', label: 'TIFF image', category: 'images', signatures: [sig(0, 0x49, 0x49, 0x2a, 0x00), sig(0, 0x4d, 0x4d, 0x00, 0x2a)] },
  { formatId: 'ico', label: 'Windows icon (ICO)', category: 'images', signatures: [sig(0, 0x00, 0x00, 0x01, 0x00)] },
  { formatId: 'svg', label: 'SVG image', category: 'images', signatures: 'structural-text' as unknown as ByteSignature[] },

  // ---- Audio --------------------------------------------------------------
  { formatId: 'mp3', label: 'MP3 audio', category: 'audio', signatures: [sig(0, ...ASCII('ID3')), sig(0, 0xff, 0xfb), sig(0, 0xff, 0xf3), sig(0, 0xff, 0xf2)] },
  { formatId: 'wav', label: 'WAV audio', category: 'audio', signatures: [sig(0, ...ASCII('RIFF')), sig(8, ...ASCII('WAVE'))] },
  { formatId: 'flac', label: 'FLAC audio', category: 'audio', signatures: [sig(0, ...ASCII('fLaC'))] },
  { formatId: 'ogg', label: 'Ogg container (Vorbis/Opus)', category: 'audio', signatures: [sig(0, ...ASCII('OggS'))] },
  { formatId: 'midi', label: 'MIDI', category: 'audio', signatures: [sig(0, ...ASCII('MThd'))] },

  // ---- Video --------------------------------------------------------------
  { formatId: 'mp4', label: 'MP4/QuickTime video', category: 'video', signatures: [sig(4, ...ASCII('ftyp'))] },
  { formatId: 'avi', label: 'AVI video', category: 'video', signatures: [sig(0, ...ASCII('RIFF')), sig(8, ...ASCII('AVI '))] },
  { formatId: 'webm', label: 'WebM / Matroska video', category: 'video', signatures: [sig(0, 0x1a, 0x45, 0xdf, 0xa3)] },

  // ---- Archives -----------------------------------------------------------
  { formatId: 'zip', label: 'ZIP archive', category: 'archives', signatures: [sig(0, 0x50, 0x4b, 0x03, 0x04), sig(0, 0x50, 0x4b, 0x05, 0x06), sig(0, 0x50, 0x4b, 0x07, 0x08)] },
  { formatId: 'gzip', label: 'GZIP compressed data', category: 'archives', signatures: [sig(0, 0x1f, 0x8b)] },
  { formatId: '7z', label: '7-Zip archive', category: 'archives', signatures: [sig(0, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)] },
  { formatId: 'rar', label: 'RAR archive', category: 'archives', signatures: [sig(0, ...ASCII('Rar!'), 0x1a, 0x07)] },
  { formatId: 'bzip2', label: 'BZip2 compressed data', category: 'archives', signatures: [sig(0, ...ASCII('BZh'))] },
  { formatId: 'xz', label: 'XZ compressed data', category: 'archives', signatures: [sig(0, 0xfd, ...ASCII('7zXZ'))] },
  { formatId: 'tar', label: 'TAR archive', category: 'archives', signatures: [sig(257, ...ASCII('ustar'))] },

  // ---- Structured data / spreadsheets --------------------------------------
  // JSON, YAML, TOML, XML, CSV, and TSV have no reliable magic number
  // (they are plain text); recognised structurally by text-sniff.ts.
  { formatId: 'json', label: 'JSON', category: 'structured-data', signatures: 'structural-text' as unknown as ByteSignature[] },
  { formatId: 'yaml', label: 'YAML', category: 'structured-data', signatures: 'structural-text' as unknown as ByteSignature[] },
  { formatId: 'toml', label: 'TOML', category: 'structured-data', signatures: 'structural-text' as unknown as ByteSignature[] },
  { formatId: 'xml', label: 'XML', category: 'structured-data', signatures: 'structural-text' as unknown as ByteSignature[] },
  { formatId: 'csv', label: 'CSV', category: 'structured-data', signatures: 'structural-text' as unknown as ByteSignature[] },
  { formatId: 'tsv', label: 'TSV', category: 'structured-data', signatures: 'structural-text' as unknown as ByteSignature[] },
  { formatId: 'sqlite3', label: 'SQLite database', category: 'structured-data', signatures: [sig(0, ...ASCII('SQLite format 3 '))] },

  // ---- Code / text ----------------------------------------------------------
  { formatId: 'utf8-bom-text', label: 'UTF-8 text (with BOM)', category: 'code-text', signatures: [sig(0, 0xef, 0xbb, 0xbf)] },
  { formatId: 'utf16le-text', label: 'UTF-16LE text', category: 'code-text', signatures: [sig(0, 0xff, 0xfe)] },
  { formatId: 'utf16be-text', label: 'UTF-16BE text', category: 'code-text', signatures: [sig(0, 0xfe, 0xff)] },
  { formatId: 'utf32le-text', label: 'UTF-32LE text', category: 'code-text', signatures: [sig(0, 0xff, 0xfe, 0x00, 0x00)] },
  { formatId: 'utf32be-text', label: 'UTF-32BE text', category: 'code-text', signatures: [sig(0, 0x00, 0x00, 0xfe, 0xff)] },
  // Plain UTF-8/ASCII text with no BOM has no signature; text-sniff.ts
  // falls back to a validity check when nothing else matches.

  // ---- Binary encodings -----------------------------------------------------
  // base64/base32/hex text have no magic number either; offered as
  // manual source-format choices rather than auto-detected.
];

function matchesSignature(bytes: Uint8Array, signature: ByteSignature): boolean {
  const start = signature.offset >= 0 ? signature.offset : bytes.length + signature.offset;
  if (start < 0 || start + signature.bytes.length > bytes.length) {
    return false;
  }
  for (let i = 0; i < signature.bytes.length; i += 1) {
    if (bytes[start + i] !== signature.bytes[i]) {
      return false;
    }
  }
  return true;
}

export interface SignatureMatch {
  formatId: string;
  label: string;
  category: ConverterCategory;
}

/**
 * Matches a bounded prefix/suffix of `bytes` against the known-signature
 * database. Only ever reads up to SIGNATURE_PREFIX_BYTES from the start
 * and SIGNATURE_SUFFIX_BYTES from the end of the provided buffer — the
 * caller is expected to have already bounded how much of the file was
 * read into memory (see detect.ts).
 */
export function matchByteSignatures(bytes: Uint8Array): SignatureMatch[] {
  const matches: SignatureMatch[] = [];
  for (const format of KNOWN_FORMATS) {
    if (format.signatures === ('structural-text' as unknown as readonly ByteSignature[])) {
      continue;
    }
    const signatures = format.signatures as readonly ByteSignature[];
    if (signatures.some((s) => matchesSignature(bytes, s))) {
      matches.push({ formatId: format.formatId, label: format.label, category: format.category });
    }
  }
  return matches;
}

export function isStructuralTextFormat(formatId: string): boolean {
  const known = KNOWN_FORMATS.find((f) => f.formatId === formatId);
  return known !== undefined && known.signatures === ('structural-text' as unknown as readonly ByteSignature[]);
}

export function knownFormatLabel(formatId: string): string | undefined {
  return KNOWN_FORMATS.find((f) => f.formatId === formatId)?.label;
}

export function knownFormatCategory(formatId: string): ConverterCategory | undefined {
  return KNOWN_FORMATS.find((f) => f.formatId === formatId)?.category;
}
