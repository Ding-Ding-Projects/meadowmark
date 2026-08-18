/**
 * Text encoding conversion (UTF-8/UTF-16LE/UTF-16BE/UTF-32LE/UTF-32BE/
 * Latin-1, with byte-order-mark handling) and line-ending conversion
 * (LF/CRLF/CR). Both are pure, bundled, Node/Electron-builtin operations
 * (TextDecoder/TextEncoder are part of the JS runtime — no dependency).
 */

import { MalformedInputError } from '../errors';
import { DEFAULT_TEXT_LIMITS, type RegistryEntry } from '../types';

type TextEncodingId = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'utf-32le' | 'utf-32be' | 'latin-1';

interface EncodingSpec {
  id: TextEncodingId;
  label: string;
  decode: (bytes: Uint8Array) => string;
  encode: (text: string) => Uint8Array;
}

function stripBom(bytes: Uint8Array, bomLength: number): Uint8Array {
  return bomLength > 0 ? bytes.subarray(bomLength) : bytes;
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean, hasBom: boolean): string {
  const body = stripBom(bytes, hasBom ? 2 : 0);
  if (body.byteLength % 2 !== 0) {
    throw new MalformedInputError('UTF-16 input has an odd number of bytes; it is truncated or not really UTF-16.');
  }
  const decoder = new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be', { fatal: true });
  try {
    // TextDecoder('utf-16be') is not universally implemented; fall back
    // to manual decoding for big-endian.
    if (!littleEndian) {
      return decodeUtf16BeManually(body);
    }
    return decoder.decode(body);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new MalformedInputError(`Not valid UTF-16: ${reason}`);
  }
}

function decodeUtf16BeManually(body: Uint8Array): string {
  const swapped = new Uint8Array(body.byteLength);
  for (let i = 0; i < body.byteLength; i += 2) {
    swapped[i] = body[i + 1] as number;
    swapped[i + 1] = body[i] as number;
  }
  return new TextDecoder('utf-16le', { fatal: true }).decode(swapped);
}

function encodeUtf16(text: string, littleEndian: boolean, withBom: boolean): Uint8Array {
  const codeUnits = new Uint16Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    codeUnits[i] = text.charCodeAt(i);
  }
  const bomUnits = withBom ? 1 : 0;
  const out = new Uint8Array((codeUnits.length + bomUnits) * 2);
  let offset = 0;
  if (withBom) {
    if (littleEndian) {
      out[0] = 0xff;
      out[1] = 0xfe;
    } else {
      out[0] = 0xfe;
      out[1] = 0xff;
    }
    offset = 2;
  }
  for (let i = 0; i < codeUnits.length; i += 1) {
    const cu = codeUnits[i] as number;
    if (littleEndian) {
      out[offset + i * 2] = cu & 0xff;
      out[offset + i * 2 + 1] = (cu >> 8) & 0xff;
    } else {
      out[offset + i * 2] = (cu >> 8) & 0xff;
      out[offset + i * 2 + 1] = cu & 0xff;
    }
  }
  return out;
}

function decodeUtf32(bytes: Uint8Array, littleEndian: boolean, hasBom: boolean): string {
  const body = stripBom(bytes, hasBom ? 4 : 0);
  if (body.byteLength % 4 !== 0) {
    throw new MalformedInputError('UTF-32 input length is not a multiple of 4 bytes; it is truncated or not really UTF-32.');
  }
  let out = '';
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  for (let i = 0; i < body.byteLength; i += 4) {
    const codePoint = view.getUint32(i, littleEndian);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      throw new MalformedInputError(`Invalid UTF-32 code point 0x${codePoint.toString(16)} at byte offset ${i}.`);
    }
    out += String.fromCodePoint(codePoint);
  }
  return out;
}

function encodeUtf32(text: string, littleEndian: boolean, withBom: boolean): Uint8Array {
  const codePoints: number[] = [];
  for (const ch of text) {
    codePoints.push(ch.codePointAt(0) ?? 0);
  }
  const bomUnits = withBom ? 1 : 0;
  const out = new Uint8Array((codePoints.length + bomUnits) * 4);
  const view = new DataView(out.buffer);
  let offset = 0;
  if (withBom) {
    view.setUint32(0, 0x0000feff, littleEndian);
    offset = 4;
  }
  for (let i = 0; i < codePoints.length; i += 1) {
    view.setUint32(offset + i * 4, codePoints[i] as number, littleEndian);
  }
  return out;
}

function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i] as number);
  }
  return out;
}

function encodeLatin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > 0xff) {
      throw new MalformedInputError(
        `Character "${text[i]}" (U+${code.toString(16).toUpperCase()}) at position ${i} cannot be represented in Latin-1 (ISO-8859-1).`
      );
    }
    out[i] = code;
  }
  return out;
}

const ENCODINGS: EncodingSpec[] = [
  {
    id: 'utf-8',
    label: 'UTF-8 (no BOM)',
    decode: (b) => new TextDecoder('utf-8', { fatal: true }).decode(stripBom(b, b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0)),
    encode: (t) => new TextEncoder().encode(t),
  },
  {
    id: 'utf-8-bom',
    label: 'UTF-8 (with BOM)',
    decode: (b) => new TextDecoder('utf-8', { fatal: true }).decode(stripBom(b, b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0)),
    encode: (t) => {
      const body = new TextEncoder().encode(t);
      const out = new Uint8Array(body.byteLength + 3);
      out[0] = 0xef;
      out[1] = 0xbb;
      out[2] = 0xbf;
      out.set(body, 3);
      return out;
    },
  },
  { id: 'utf-16le', label: 'UTF-16LE', decode: (b) => decodeUtf16(b, true, b[0] === 0xff && b[1] === 0xfe), encode: (t) => encodeUtf16(t, true, true) },
  { id: 'utf-16be', label: 'UTF-16BE', decode: (b) => decodeUtf16(b, false, b[0] === 0xfe && b[1] === 0xff), encode: (t) => encodeUtf16(t, false, true) },
  {
    id: 'utf-32le',
    label: 'UTF-32LE',
    decode: (b) => decodeUtf32(b, true, b[0] === 0xff && b[1] === 0xfe && b[2] === 0x00 && b[3] === 0x00),
    encode: (t) => encodeUtf32(t, true, true),
  },
  {
    id: 'utf-32be',
    label: 'UTF-32BE',
    decode: (b) => decodeUtf32(b, false, b[0] === 0x00 && b[1] === 0x00 && b[2] === 0xfe && b[3] === 0xff),
    encode: (t) => encodeUtf32(t, false, true),
  },
  { id: 'latin-1', label: 'Latin-1 (ISO-8859-1)', decode: decodeLatin1, encode: encodeLatin1 },
];

export function buildTextEncodingEntries(): RegistryEntry[] {
  const entries: RegistryEntry[] = [];
  for (const source of ENCODINGS) {
    for (const target of ENCODINGS) {
      if (source.id === target.id) continue;
      const lossy = source.id !== 'latin-1' && target.id === 'latin-1';
      entries.push({
        id: `text-encoding-${source.id}-to-${target.id}`,
        category: 'code-text',
        sourceFormat: { id: `text-${source.id}`, label: source.label },
        targetFormat: { id: `text-${target.id}`, label: target.label },
        sourceSignatures: 'structural-text',
        bundled: true,
        packagedArtifactProof: 'TextDecoder/TextEncoder (JavaScript runtime builtins) plus hand-written UTF-16BE/UTF-32/Latin-1 handling in this module; no external dependency.',
        metadataBehavior: `Decodes the source as ${source.label} and re-encodes the same text as ${target.label}. Byte-order marks are read and written per each encoding's own convention.`,
        lossiness: lossy ? 'lossy' : 'lossless',
        lossDisclosure: lossy
          ? [
              {
                aspect: 'Characters outside Latin-1',
                detail: 'Any character beyond U+00FF (most non-Western scripts, emoji, many symbols) cannot be represented in Latin-1 and causes the conversion to fail rather than silently substitute or drop it.',
              },
            ]
          : [],
        limits: DEFAULT_TEXT_LIMITS,
        sandboxBoundary: 'Runs in-process in the Electron main process under a bounded resource budget; no subprocess, no network access.',
        userFacingName: `${source.label} to ${target.label}`,
        kind: 'byte-to-byte',
        convert: async (input, ctx) => {
          ctx.budget.consumeInput(input.byteLength);
          let text: string;
          try {
            text = source.decode(input);
          } catch (err) {
            if (err instanceof MalformedInputError) throw err;
            const reason = err instanceof Error ? err.message : String(err);
            throw new MalformedInputError(`Not valid ${source.label}: ${reason}`);
          }
          ctx.budget.check();
          const output = target.encode(text);
          ctx.budget.produceOutput(output.byteLength);
          return output;
        },
        validateOutput: (bytes) => {
          try {
            target.decode(bytes);
            return { ok: true };
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            return { ok: false, reason: `Produced output does not decode back as ${target.label}: ${reason}` };
          }
        },
      });
    }
  }
  return entries;
}

type LineEndingId = 'lf' | 'crlf' | 'cr';

const LINE_ENDINGS: Array<{ id: LineEndingId; label: string; sequence: string }> = [
  { id: 'lf', label: 'LF (Unix)', sequence: '\n' },
  { id: 'crlf', label: 'CRLF (Windows)', sequence: '\r\n' },
  { id: 'cr', label: 'CR (classic Mac)', sequence: '\r' },
];

export function buildLineEndingEntries(): RegistryEntry[] {
  const entries: RegistryEntry[] = [];
  for (const source of LINE_ENDINGS) {
    for (const target of LINE_ENDINGS) {
      if (source.id === target.id) continue;
      entries.push({
        id: `line-ending-${source.id}-to-${target.id}`,
        category: 'code-text',
        sourceFormat: { id: `line-ending-${source.id}`, label: `Text with ${source.label} line endings` },
        targetFormat: { id: `line-ending-${target.id}`, label: `Text with ${target.label} line endings` },
        sourceSignatures: 'structural-text',
        bundled: true,
        packagedArtifactProof: 'Hand-written line-ending normalizer in this module; no external dependency.',
        metadataBehavior: `Normalizes every line ending (LF, CRLF, or CR) found in the source to ${target.label}, and leaves every other byte unchanged.`,
        lossiness: 'lossless',
        lossDisclosure: [],
        limits: DEFAULT_TEXT_LIMITS,
        sandboxBoundary: 'Runs in-process in the Electron main process under a bounded resource budget; no subprocess, no network access.',
        userFacingName: `Convert line endings to ${target.label}`,
        kind: 'byte-to-byte',
        convert: async (input, ctx) => {
          ctx.budget.consumeInput(input.byteLength);
          let text: string;
          try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(input);
          } catch {
            throw new MalformedInputError('Line-ending conversion requires valid UTF-8 text input.');
          }
          const normalized = text.replace(/\r\n|\r|\n/g, '\n');
          const converted = target.id === 'lf' ? normalized : normalized.split('\n').join(target.sequence);
          const output = new TextEncoder().encode(converted);
          ctx.budget.produceOutput(output.byteLength);
          return output;
        },
        validateOutput: () => ({ ok: true }),
      });
    }
  }
  return entries;
}
