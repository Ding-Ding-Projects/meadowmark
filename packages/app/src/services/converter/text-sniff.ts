/**
 * Structural detection for formats that have no reliable byte signature:
 * JSON, YAML, TOML, XML, CSV, TSV, and plain text encodings.
 *
 * These are recognised by bounded structural inspection of a decoded
 * prefix of the file, never by trusting a file extension. Detection here
 * is a best-effort RANKING used to suggest a default source format to a
 * caller; it never silently picks a format for a conversion — the actual
 * parse (structured/*.ts) is the authority, and it throws a clear error
 * if the bytes do not actually parse as the chosen format.
 */

import type { ConverterCategory } from './types';

export const TEXT_SNIFF_PREFIX_BYTES = 65536;

export interface TextEncodingDetection {
  encoding: 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'utf-32le' | 'utf-32be' | 'utf-8' | 'unknown-binary';
  bomLength: number;
}

/** Detects a byte-order mark, then falls back to a UTF-8 validity check
 * over the bounded prefix. Returns 'unknown-binary' when the prefix
 * contains bytes that cannot be valid UTF-8 anywhere and no BOM is
 * present — i.e. this is very unlikely to be text at all. */
export function detectTextEncoding(bytes: Uint8Array): TextEncodingDetection {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8-bom', bomLength: 3 };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0x00 && bytes[3] === 0x00) {
    return { encoding: 'utf-32le', bomLength: 4 };
  }
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xfe && bytes[3] === 0xff) {
    return { encoding: 'utf-32be', bomLength: 4 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', bomLength: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be', bomLength: 2 };
  }
  const prefix = bytes.subarray(0, Math.min(bytes.length, TEXT_SNIFF_PREFIX_BYTES));
  if (isValidUtf8(prefix)) {
    return { encoding: 'utf-8', bomLength: 0 };
  }
  return { encoding: 'unknown-binary', bomLength: 0 };
}

/** Bounded, allocation-free UTF-8 validator. Rejects overlong encodings,
 * surrogate code points, and out-of-range sequences rather than merely
 * checking continuation-byte shape, so it does not falsely accept
 * malformed UTF-8 that a lenient decoder would silently replace. */
export function isValidUtf8(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i] as number;
    if (b0 <= 0x7f) {
      i += 1;
      continue;
    }
    let extra: number;
    let codePoint: number;
    let minCodePoint: number;
    if ((b0 & 0xe0) === 0xc0) {
      extra = 1;
      codePoint = b0 & 0x1f;
      minCodePoint = 0x80;
    } else if ((b0 & 0xf0) === 0xe0) {
      extra = 2;
      codePoint = b0 & 0x0f;
      minCodePoint = 0x800;
    } else if ((b0 & 0xf8) === 0xf0) {
      extra = 3;
      codePoint = b0 & 0x07;
      minCodePoint = 0x10000;
    } else {
      return false;
    }
    if (i + extra >= bytes.length) {
      return false; // truncated multi-byte sequence at end of prefix
    }
    for (let k = 1; k <= extra; k += 1) {
      const cb = bytes[i + k] as number;
      if ((cb & 0xc0) !== 0x80) {
        return false;
      }
      codePoint = (codePoint << 6) | (cb & 0x3f);
    }
    if (codePoint < minCodePoint || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return false;
    }
    i += extra + 1;
  }
  return true;
}

export interface StructuralTextCandidate {
  formatId: string;
  label: string;
  category: ConverterCategory;
}

/**
 * Ranks JSON/XML/CSV/TSV/TOML/YAML candidates for a decoded text prefix.
 * Order is most-confident first. This never actually validates the whole
 * file — that is the parser's job — it only decides what to suggest.
 */
export function sniffStructuralText(text: string): StructuralTextCandidate[] {
  const trimmed = text.trimStart();
  const candidates: StructuralTextCandidate[] = [];

  if (trimmed.startsWith('<?xml') || /^<[a-zA-Z_][\w:-]*[\s>]/.test(trimmed)) {
    candidates.push({ formatId: 'xml', label: 'XML', category: 'structured-data' });
  }

  const firstChar = trimmed.charAt(0);
  if (firstChar === '{' || firstChar === '[') {
    candidates.push({ formatId: 'json', label: 'JSON', category: 'structured-data' });
  }

  // TOML: dominated by `key = value` lines and/or `[section]` headers,
  // and does not look like YAML's `key:` shape.
  const sampleLines = trimmed.split(/\r\n|\n|\r/).slice(0, 200);
  const nonBlank = sampleLines.filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));
  if (nonBlank.length > 0) {
    const tomlLike = nonBlank.filter((l) => /^\s*[A-Za-z0-9_.-]+\s*=\s*\S/.test(l) || /^\s*\[{1,2}[^\]\n]+\]{1,2}\s*$/.test(l));
    if (tomlLike.length / nonBlank.length > 0.6) {
      candidates.push({ formatId: 'toml', label: 'TOML', category: 'structured-data' });
    }

    const yamlLike = nonBlank.filter(
      (l) => /^\s*-?\s*[A-Za-z0-9_."'-]+\s*:(\s|$)/.test(l) || /^\s*-\s+\S/.test(l) || l.trim() === '---'
    );
    if (yamlLike.length / nonBlank.length > 0.6) {
      candidates.push({ formatId: 'yaml', label: 'YAML', category: 'structured-data' });
    }
  }

  // CSV/TSV: every non-blank sampled line has the same non-zero
  // delimiter count.
  for (const [formatId, label, delimiter] of [
    ['csv', 'CSV', ','],
    ['tsv', 'TSV', '\t'],
  ] as const) {
    if (nonBlank.length >= 1) {
      const counts = nonBlank.map((l) => countUnquoted(l, delimiter));
      const first = counts[0] as number;
      if (first > 0 && counts.every((c) => c === first)) {
        candidates.push({ formatId, label, category: 'structured-data' });
      }
    }
  }

  return candidates;
}

function countUnquoted(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      count += 1;
    }
  }
  return count;
}
