/**
 * Bounded, whole-file-safe source detection: reads only a small prefix
 * (and, when needed, a small suffix) of a file — NEVER the whole thing —
 * and matches it against the byte-signature and structural-text
 * detectors. This is the only place file bytes are read purely to
 * determine "what is this", and it never trusts the file's extension.
 */

import { promises as fsp } from 'node:fs';
import { getConverterRegistry } from './registry';
import { matchByteSignatures, SIGNATURE_PREFIX_BYTES, SIGNATURE_SUFFIX_BYTES } from './signatures';
import { detectTextEncoding, sniffStructuralText, TEXT_SNIFF_PREFIX_BYTES } from './text-sniff';
import type { DetectionCandidate } from './types';

const PREFIX_READ_BYTES = Math.max(SIGNATURE_PREFIX_BYTES, TEXT_SNIFF_PREFIX_BYTES);

export async function readBoundedPrefix(filePath: string, maxBytes: number = PREFIX_READ_BYTES): Promise<Uint8Array> {
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
  } finally {
    await handle.close();
  }
}

/** ZIP's End Of Central Directory record can sit far from byte 0 (e.g. a
 * self-extracting archive with a large native-executable prefix), so ZIP
 * detection additionally needs a bounded read of the file's tail. */
export async function readBoundedSuffix(filePath: string, maxBytes: number = SIGNATURE_SUFFIX_BYTES): Promise<Uint8Array> {
  const stat = await fsp.stat(filePath);
  const start = Math.max(0, stat.size - maxBytes);
  const length = stat.size - start;
  if (length <= 0) return new Uint8Array(0);
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
  } finally {
    await handle.close();
  }
}

function hasEnabledAdapter(formatId: string): boolean {
  return getConverterRegistry().some((e) => e.sourceFormat.id === formatId && e.bundled);
}

/**
 * Detects candidate formats from bounded, already-read byte buffers. Pure
 * function (no I/O) so it is easy to test and to reuse for both the
 * prefix and, for signature matching, the suffix.
 */
export function detectFromBytes(prefixBytes: Uint8Array, suffixBytes: Uint8Array = new Uint8Array(0)): DetectionCandidate[] {
  const candidates: DetectionCandidate[] = [];
  const seen = new Set<string>();

  function add(formatId: string, label: string, category: DetectionCandidate['category'], confidence: DetectionCandidate['confidence']): void {
    if (seen.has(formatId)) return;
    seen.add(formatId);
    candidates.push({ formatId, label, category, confidence, hasEnabledAdapter: hasEnabledAdapter(formatId) });
  }

  for (const match of matchByteSignatures(prefixBytes)) {
    add(match.formatId, match.label, match.category, 'signature');
  }
  if (suffixBytes.byteLength > 0) {
    for (const match of matchByteSignatures(suffixBytes)) {
      add(match.formatId, match.label, match.category, 'signature');
    }
  }

  const encoding = detectTextEncoding(prefixBytes);
  if (encoding.encoding === 'utf-8' || encoding.encoding === 'utf-8-bom') {
    let text = '';
    try {
      text = new TextDecoder('utf-8', { fatal: false }).decode(prefixBytes.subarray(encoding.bomLength));
    } catch {
      text = '';
    }
    if (text !== '') {
      for (const candidate of sniffStructuralText(text)) {
        add(candidate.formatId, candidate.label, candidate.category, 'heuristic');
      }
    }
  }

  return candidates;
}

/** Convenience wrapper that performs the bounded reads and detects in
 * one call, for a source file on disk. */
export async function detectSourceFile(filePath: string): Promise<DetectionCandidate[]> {
  const prefix = await readBoundedPrefix(filePath);
  const suffix = await readBoundedSuffix(filePath);
  return detectFromBytes(prefix, suffix);
}
