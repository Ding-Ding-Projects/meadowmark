/**
 * Binary <-> text encodings: base64, base32 (RFC 4648), and hex. Base64
 * and hex use Node's builtin Buffer; base32 has no Node builtin, so it is
 * hand-written here. All three are pure in-memory transforms — no
 * external dependency, no network.
 *
 * "Raw bytes" is treated as its own pseudo-format: any file at all can
 * be the source of a raw-bytes-to-encoded-text conversion, and any of
 * the three encoded-text formats can be decoded back to raw bytes.
 */

import { Buffer } from 'node:buffer';
import { MalformedInputError } from '../errors';
import { DEFAULT_BINARY_LIMITS, type RegistryEntry } from '../types';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | (bytes[i] as number);
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  while (out.length % 8 !== 0) {
    out += '=';
  }
  return out;
}

function decodeBase32(text: string): Uint8Array {
  const cleaned = text.replace(/\s+/g, '').toUpperCase().replace(/=+$/g, '');
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }
  const lookup = new Map<string, number>();
  for (let i = 0; i < BASE32_ALPHABET.length; i += 1) {
    lookup.set(BASE32_ALPHABET[i], i);
  }
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    const digit = lookup.get(ch);
    if (digit === undefined) {
      throw new MalformedInputError(`"${ch}" at position ${i} is not a valid base32 character (RFC 4648 alphabet, case-insensitive).`);
    }
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

function encodeHex(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('hex');
}

function decodeHex(text: string): Uint8Array {
  const cleaned = text.replace(/\s+/g, '');
  if (!/^[0-9A-Fa-f]*$/.test(cleaned)) {
    const match = cleaned.match(/[^0-9A-Fa-f]/);
    throw new MalformedInputError(`"${match?.[0] ?? '?'}" is not a valid hex character.`);
  }
  if (cleaned.length % 2 !== 0) {
    throw new MalformedInputError('Hex input has an odd number of digits; it is truncated.');
  }
  return new Uint8Array(Buffer.from(cleaned, 'hex'));
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

function decodeBase64(text: string): Uint8Array {
  const cleaned = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new MalformedInputError('Input contains characters outside the standard base64 alphabet (A-Z, a-z, 0-9, +, /, = padding).');
  }
  if (cleaned.length % 4 !== 0) {
    throw new MalformedInputError('Base64 input length is not a multiple of 4; it is truncated or malformed.');
  }
  const decoded = Buffer.from(cleaned, 'base64');
  // Buffer.from(..., 'base64') silently ignores invalid trailing content
  // rather than throwing; re-encode and compare length as a bounded
  // sanity check that we actually consumed the whole input.
  const reencoded = decoded.toString('base64').replace(/=+$/g, '');
  const cleanedNoPad = cleaned.replace(/=+$/g, '');
  if (reencoded.length !== cleanedNoPad.length) {
    throw new MalformedInputError('Base64 input did not round-trip; it is malformed.');
  }
  return new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength);
}

interface EncodedTextCodec {
  id: string;
  label: string;
  encode: (bytes: Uint8Array) => string;
  decode: (text: string) => Uint8Array;
}

const CODECS: EncodedTextCodec[] = [
  { id: 'base64', label: 'Base64 text', encode: encodeBase64, decode: decodeBase64 },
  { id: 'base32', label: 'Base32 text (RFC 4648)', encode: encodeBase32, decode: decodeBase32 },
  { id: 'hex', label: 'Hex text', encode: encodeHex, decode: decodeHex },
];

export function buildBinaryEncodingEntries(): RegistryEntry[] {
  const entries: RegistryEntry[] = [];

  for (const codec of CODECS) {
    entries.push({
      id: `raw-bytes-to-${codec.id}`,
      category: 'binary-encodings',
      sourceFormat: { id: 'raw-bytes', label: 'Any file (raw bytes)' },
      targetFormat: { id: `${codec.id}-text`, label: codec.label },
      sourceSignatures: [],
      bundled: true,
      packagedArtifactProof: `Hand-written ${codec.label} encoder in this module (Node builtin Buffer for base64/hex); no external dependency.`,
      metadataBehavior: `Encodes every byte of the source file as ${codec.label}. Reversible exactly with the matching decode adapter.`,
      lossiness: 'lossless',
      lossDisclosure: [],
      limits: DEFAULT_BINARY_LIMITS,
      sandboxBoundary: 'Runs in-process in the Electron main process under a bounded resource budget; no subprocess, no network access.',
      userFacingName: `Encode as ${codec.label}`,
      kind: 'byte-to-byte',
      convert: async (input, ctx) => {
        ctx.budget.consumeInput(input.byteLength);
        const text = codec.encode(input);
        const output = new TextEncoder().encode(text);
        ctx.budget.produceOutput(output.byteLength);
        return output;
      },
      validateOutput: (bytes) => {
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          codec.decode(text);
          return { ok: true };
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          return { ok: false, reason: `Produced ${codec.label} does not decode back cleanly: ${reason}` };
        }
      },
    });

    entries.push({
      id: `${codec.id}-to-raw-bytes`,
      category: 'binary-encodings',
      sourceFormat: { id: `${codec.id}-text`, label: codec.label },
      targetFormat: { id: 'raw-bytes', label: 'Raw bytes' },
      sourceSignatures: 'structural-text',
      bundled: true,
      packagedArtifactProof: `Hand-written ${codec.label} decoder in this module (Node builtin Buffer for base64/hex); no external dependency.`,
      metadataBehavior: `Decodes ${codec.label} back to the exact original bytes. Whitespace/newlines in the source text are ignored; any other invalid character is rejected.`,
      lossiness: 'lossless',
      lossDisclosure: [],
      limits: DEFAULT_BINARY_LIMITS,
      sandboxBoundary: 'Runs in-process in the Electron main process under a bounded resource budget; no subprocess, no network access.',
      userFacingName: `Decode ${codec.label}`,
      kind: 'byte-to-byte',
      convert: async (input, ctx) => {
        ctx.budget.consumeInput(input.byteLength);
        let text: string;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(input);
        } catch {
          throw new MalformedInputError(`Not valid UTF-8 text, so it cannot be read as ${codec.label}.`);
        }
        const output = codec.decode(text);
        ctx.budget.produceOutput(output.byteLength);
        return output;
      },
      validateOutput: () => ({ ok: true }),
    });
  }

  return entries;
}
