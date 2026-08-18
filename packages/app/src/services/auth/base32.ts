/**
 * RFC 4648 Base32 codec (the "standard" alphabet, no padding on encode,
 * padding tolerated on decode). This is the encoding every otpauth:// URI
 * and every authenticator app's "type this in manually" box uses for a
 * TOTP/HOTP secret, so it has to be exactly this alphabet and no other
 * (not base32hex, not Crockford's base32).
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Maps an alphabet character to its 5-bit value. Built once at module
 * load. Accepts both upper and lower case on decode, since a manually
 * typed secret is often typed in lower case. */
const DECODE_MAP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i += 1) {
  const upper = ALPHABET[i];
  DECODE_MAP[upper as string] = i;
  DECODE_MAP[(upper as string).toLowerCase()] = i;
}

/** Encodes bytes as unpadded, upper-case base32. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return output;
}

export class Base32DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Base32DecodeError';
  }
}

/**
 * Decodes base32 text into bytes. Tolerant of the things a real-world
 * secret shows up wrapped in: surrounding whitespace, internal spaces
 * (the "grouped" presentation this module also emits for manual entry),
 * '=' padding, and mixed case. Rejects anything containing a character
 * outside the base32 alphabet, since that is not a typo worth silently
 * guessing at — a wrong secret must never be accepted as a right one.
 */
export function base32Decode(text: string): Buffer {
  const cleaned = text.replace(/\s+/g, '').replace(/=+$/g, '');

  if (cleaned.length === 0) {
    throw new Base32DecodeError('Secret is empty.');
  }

  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleaned) {
    const charValue = DECODE_MAP[char];
    if (charValue === undefined) {
      throw new Base32DecodeError(
        `Secret contains a character outside the base32 alphabet: ${JSON.stringify(char)}.`,
      );
    }

    value = (value << 5) | charValue;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Splits a base32 secret into groups of `groupSize` characters (default
 * 4, matching the presentation most authenticator apps use), joined by a
 * single space. Purely a display convenience for the manual-entry box —
 * base32Decode() strips the spaces back out again.
 */
export function formatBase32Grouped(base32: string, groupSize = 4): string {
  const groups: string[] = [];
  for (let i = 0; i < base32.length; i += groupSize) {
    groups.push(base32.slice(i, i + groupSize));
  }
  return groups.join(' ');
}
