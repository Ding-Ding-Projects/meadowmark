/**
 * A from-scratch QR Code encoder (ISO/IEC 18004), implemented directly
 * against the standard's algorithm rather than any third-party package
 * or web service. The whole point of pairing an authenticator locally is
 * that the secret never leaves this machine — a remote "render my QR
 * code" call would hand a TOTP seed to a stranger's server on the way to
 * displaying it, which defeats the feature before it starts.
 *
 * Scope: Byte mode encoding only (safe for any otpauth:// URI, which
 * mixes letters, digits and punctuation that alphanumeric/numeric mode
 * cannot represent), error correction level M (the standard's own
 * "medium", ~15% recoverable damage — the level most real-world
 * authenticator QR codes ship at, balancing size against scan
 * reliability), and automatic mask selection by the standard's own
 * four-rule penalty scoring so the emitted symbol is a real optimized QR
 * code rather than an arbitrary valid one.
 *
 * Output is rendered SVG: fixed true black modules on a true white
 * background with the standard's mandatory 4-module quiet zone — this is
 * deliberately NOT theme-tinted, because a low-contrast QR code is a QR
 * code a camera cannot read.
 */

// ---------------------------------------------------------------------
// GF(256) arithmetic and Reed-Solomon error correction
// ---------------------------------------------------------------------

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisTables(): void {
  // QR's Galois field uses the primitive polynomial x^8 + x^4 + x^3 +
  // x^2 + 1 (0x11d) and primitive element 2, per ISO/IEC 18004 Annex A.
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255] as number;
  }
})();

function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) {
    return 0;
  }
  return GF_EXP[(GF_LOG[a] as number) + (GF_LOG[b] as number)] as number;
}

/** Multiplies two polynomials over GF(256). Coefficients are ordered
 * highest-degree-first, matching the rest of this module. */
function polyMultiplyGf(a: readonly number[], b: readonly number[]): number[] {
  const result = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      result[i + j] = (result[i + j] as number) ^ gfMultiply(a[i] as number, b[j] as number);
    }
  }
  return result;
}

/** Builds the Reed-Solomon generator polynomial of the given degree,
 * i.e. the product of (x - alpha^0)(x - alpha^1)...(x - alpha^(degree-1))
 * over GF(256). Returns `degree + 1` coefficients, highest degree first,
 * with a leading coefficient of 1 (monic). */
function reedSolomonGenerator(degree: number): number[] {
  let poly: number[] = [1];
  for (let i = 0; i < degree; i += 1) {
    poly = polyMultiplyGf(poly, [1, GF_EXP[i] as number]);
  }
  return poly;
}

/** Computes the Reed-Solomon error-correction codewords for one block of
 * data codewords, by polynomial long division against the generator
 * polynomial (an LFSR-style byte-at-a-time division, the standard
 * implementation technique for this over GF(256)). */
function reedSolomonEncode(dataCodewords: readonly number[], eccLength: number): number[] {
  const generator = reedSolomonGenerator(eccLength);
  const remainder = new Array<number>(eccLength).fill(0);

  for (const dataByte of dataCodewords) {
    const factor = dataByte ^ (remainder[0] as number);
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < eccLength; i += 1) {
      remainder[i] = (remainder[i] as number) ^ gfMultiply(generator[i + 1] as number, factor);
    }
  }

  return remainder;
}

// ---------------------------------------------------------------------
// Version capacity tables (Error Correction Level M only)
// ---------------------------------------------------------------------

/** Per-version Reed-Solomon parameters at EC level M, indexed by version
 * (1-40). eccPerBlock is the number of error-correction codewords in
 * EVERY block for that version; numBlocks is the total number of blocks
 * the data codewords are split across. These two numbers, combined with
 * the version's total codeword capacity (computed below from the module
 * count, not hand-tabulated), are enough to derive the full block
 * structure: the data codewords split as evenly as possible across
 * numBlocks blocks, with any remainder codewords going to the LAST
 * blocks (one extra codeword each) rather than the first — this matches
 * ISO/IEC 18004 Table 9 exactly, without needing to hand-transcribe its
 * full block-size table (a much larger and more error-prone table to
 * copy correctly).
 */
const ECC_CODEWORDS_PER_BLOCK_M: readonly number[] = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];

const NUM_BLOCKS_M: readonly number[] = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23,
  25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

export const MIN_QR_VERSION = 1;
export const MAX_QR_VERSION = 40;

function moduleGridSize(version: number): number {
  return version * 4 + 17;
}

/** Total number of codewords (data + error correction) a symbol of this
 * version can hold, derived from the number of modules available for
 * data after subtracting every function pattern's footprint (finder
 * patterns, separators, timing patterns, alignment patterns, format and
 * version info areas), per ISO/IEC 18004 section 6.4.10. */
function totalCodewordCapacity(version: number): number {
  let rawModules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    rawModules -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) {
      rawModules -= 36;
    }
  }
  return Math.floor(rawModules / 8);
}

function dataCodewordCapacity(version: number): number {
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK_M[version] as number;
  const numBlocks = NUM_BLOCKS_M[version] as number;
  return totalCodewordCapacity(version) - eccPerBlock * numBlocks;
}

export class QrEncodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QrEncodingError';
  }
}

// ---------------------------------------------------------------------
// Bit stream construction (Byte mode)
// ---------------------------------------------------------------------

class BitWriter {
  private bits: number[] = [];

  get length(): number {
    return this.bits.length;
  }

  writeBits(value: number, bitCount: number): void {
    for (let i = bitCount - 1; i >= 0; i -= 1) {
      this.bits.push((value >>> i) & 1);
    }
  }

  writeBit(bit: number): void {
    this.bits.push(bit & 1);
  }

  toArray(): number[] {
    return this.bits.slice();
  }
}

/** Picks the smallest QR version (1-40) whose data capacity, at EC level
 * M, can hold `payload` in Byte mode: the mode indicator (4 bits), the
 * character count indicator (8 bits for versions 1-9, 16 bits for
 * versions 10-40 — the count indicator's own width depends on the
 * version being sized for, so this has to be checked per candidate
 * rather than assumed), and the payload's bytes. Throws QrEncodingError
 * when the payload is too large for even version 40.
 */
function selectVersion(payload: Uint8Array): number {
  for (let version = MIN_QR_VERSION; version <= MAX_QR_VERSION; version += 1) {
    const countBits = version <= 9 ? 8 : 16;
    const requiredBits = 4 + countBits + payload.length * 8;
    const capacityBits = dataCodewordCapacity(version) * 8;
    if (requiredBits <= capacityBits) {
      return version;
    }
  }
  throw new QrEncodingError(
    `Payload of ${payload.length} bytes is too large to fit in a QR code (max version ${MAX_QR_VERSION} at error correction level M).`,
  );
}

/** Builds the final, padded sequence of data codewords for `payload` at
 * the given version: mode indicator, character count, data bytes,
 * terminator (as many of up to 4 zero bits as fit), pad bits to a byte
 * boundary, then alternating 0xEC/0x11 pad bytes up to capacity. */
function buildDataCodewords(payload: Uint8Array, version: number): number[] {
  const writer = new BitWriter();
  writer.writeBits(0b0100, 4); // Byte mode indicator.
  const countBits = version <= 9 ? 8 : 16;
  writer.writeBits(payload.length, countBits);
  for (const byte of payload) {
    writer.writeBits(byte, 8);
  }

  const capacityBits = dataCodewordCapacity(version) * 8;
  const terminatorLength = Math.min(4, Math.max(0, capacityBits - writer.length));
  for (let i = 0; i < terminatorLength; i += 1) {
    writer.writeBit(0);
  }

  while (writer.length % 8 !== 0) {
    writer.writeBit(0);
  }

  const codewords: number[] = [];
  const bits = writer.toArray();
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) {
      byte = (byte << 1) | (bits[i + j] as number);
    }
    codewords.push(byte);
  }

  const capacityBytes = dataCodewordCapacity(version);
  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < capacityBytes) {
    codewords.push(padBytes[padIndex % 2] as number);
    padIndex += 1;
  }

  return codewords;
}

interface RsBlock {
  data: number[];
  ecc: number[];
}

/** Splits data codewords into their Reed-Solomon blocks per the version's
 * (eccPerBlock, numBlocks) parameters, with any remainder codewords
 * going to the last blocks (one extra data codeword each) — see the
 * comment on ECC_CODEWORDS_PER_BLOCK_M for why this reproduces the
 * standard's block-size table without transcribing it directly. */
function splitIntoBlocks(dataCodewords: readonly number[], version: number): RsBlock[] {
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK_M[version] as number;
  const numBlocks = NUM_BLOCKS_M[version] as number;
  const totalData = dataCodewords.length;

  const baseLength = Math.floor(totalData / numBlocks);
  const longBlockCount = totalData % numBlocks;
  const shortBlockCount = numBlocks - longBlockCount;

  const blocks: RsBlock[] = [];
  let offset = 0;

  for (let i = 0; i < shortBlockCount; i += 1) {
    const data = dataCodewords.slice(offset, offset + baseLength);
    offset += baseLength;
    blocks.push({ data, ecc: reedSolomonEncode(data, eccPerBlock) });
  }
  for (let i = 0; i < longBlockCount; i += 1) {
    const data = dataCodewords.slice(offset, offset + baseLength + 1);
    offset += baseLength + 1;
    blocks.push({ data, ecc: reedSolomonEncode(data, eccPerBlock) });
  }

  return blocks;
}

/** Interleaves data codewords column-wise across blocks, then error
 * correction codewords the same way, per ISO/IEC 18004 section 6.6. */
function interleaveCodewords(blocks: readonly RsBlock[]): number[] {
  const result: number[] = [];
  const maxDataLength = Math.max(...blocks.map((b) => b.data.length));

  for (let i = 0; i < maxDataLength; i += 1) {
    for (const block of blocks) {
      if (i < block.data.length) {
        result.push(block.data[i] as number);
      }
    }
  }

  const eccLength = (blocks[0] as RsBlock).ecc.length;
  for (let i = 0; i < eccLength; i += 1) {
    for (const block of blocks) {
      result.push(block.ecc[i] as number);
    }
  }

  return result;
}

// ---------------------------------------------------------------------
// Format and version information (BCH error-correction coded)
// ---------------------------------------------------------------------

/** ISO/IEC 18004 Table 25: the (non-obvious, non-sequential) 2-bit
 * encoding of each error correction level used inside the 15-bit format
 * information word. */
const FORMAT_EC_LEVEL_BITS_M = 0b00;

/** Computes the 15-bit format information word for (EC level, mask),
 * via the standard's (15,5) BCH code (generator polynomial 0x537) XORed
 * with the fixed mask pattern 0x5412 so an all-zero format is never
 * mistaken for "no format information present". */
function computeFormatBits(mask: number): number {
  const data = (FORMAT_EC_LEVEL_BITS_M << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  const bits = ((data << 10) | remainder) & 0x7fff;
  return bits ^ 0x5412;
}

/** Computes the 18-bit version information word (versions 7-40 only),
 * via the standard's (18,6) BCH code (generator polynomial 0x1f25). */
function computeVersionBits(version: number): number {
  let remainder = version;
  for (let i = 0; i < 12; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  return (version << 12) | remainder;
}

function getBit(value: number, bitIndex: number): boolean {
  return ((value >>> bitIndex) & 1) !== 0;
}

// ---------------------------------------------------------------------
// Matrix construction
// ---------------------------------------------------------------------

class QrMatrix {
  readonly size: number;
  readonly dark: boolean[][];
  readonly isFunction: boolean[][];

  constructor(readonly version: number) {
    this.size = moduleGridSize(version);
    this.dark = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
  }

  /** Sets module (x=column, y=row) and marks it as a function module
   * (never touched by data placement or masking). Out-of-bounds
   * coordinates are silently ignored, matching how finder/alignment
   * pattern drawing naturally spills slightly outside the grid near the
   * edges before clipping. */
  setFunction(x: number, y: number, isDark: boolean): void {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) {
      return;
    }
    (this.dark[y] as boolean[])[x] = isDark;
    (this.isFunction[y] as boolean[])[x] = true;
  }

  get(x: number, y: number): boolean {
    return (this.dark[y] as boolean[])[x] as boolean;
  }
}

function drawFinderPattern(matrix: QrMatrix, centerX: number, centerY: number): void {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      matrix.setFunction(centerX + dx, centerY + dy, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignmentPattern(matrix: QrMatrix, centerX: number, centerY: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      matrix.setFunction(centerX + dx, centerY + dy, dist !== 1);
    }
  }
}

/** Center coordinates for every alignment pattern this version needs,
 * per ISO/IEC 18004 Annex E's generating rule (evenly spaced, anchored
 * to both edges, coordinates rounded to keep an even step). Version 1
 * has none. */
function alignmentPatternCenters(version: number): number[] {
  if (version === 1) {
    return [];
  }
  const numAlign = Math.floor(version / 7) + 2;
  const size = moduleGridSize(version);
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;

  const positions = [6];
  for (let pos = size - 7; positions.length < numAlign; pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
}

function drawAlignmentPatterns(matrix: QrMatrix): void {
  const centers = alignmentPatternCenters(matrix.version);
  for (const y of centers) {
    for (const x of centers) {
      // Alignment patterns never overlap a finder pattern's 9x9
      // footprint; skip the three corners where a finder already sits.
      const nearTopLeft = x <= 8 && y <= 8;
      const nearTopRight = x >= matrix.size - 9 && y <= 8;
      const nearBottomLeft = x <= 8 && y >= matrix.size - 9;
      if (nearTopLeft || nearTopRight || nearBottomLeft) {
        continue;
      }
      drawAlignmentPattern(matrix, x, y);
    }
  }
}

function drawTimingPatterns(matrix: QrMatrix): void {
  for (let i = 0; i < matrix.size; i += 1) {
    if (!(matrix.isFunction[6] as boolean[])[i]) {
      matrix.setFunction(i, 6, i % 2 === 0);
    }
    if (!(matrix.isFunction[i] as boolean[])[6]) {
      matrix.setFunction(6, i, i % 2 === 0);
    }
  }
}

function reserveFormatAreas(matrix: QrMatrix): void {
  // Reserve (without a final value yet) the two format-information
  // areas, so data placement skips them. The real bits are drawn later,
  // once the mask is chosen.
  for (let i = 0; i <= 8; i += 1) {
    if (!(matrix.isFunction[8] as boolean[])[i]) matrix.setFunction(i, 8, false);
    if (!(matrix.isFunction[i] as boolean[])[8]) matrix.setFunction(8, i, false);
  }
  for (let i = 0; i < 8; i += 1) {
    matrix.setFunction(matrix.size - 1 - i, 8, false);
    matrix.setFunction(8, matrix.size - 1 - i, false);
  }
  // The single always-dark module, fixed at (column 8, row size-8).
  matrix.setFunction(8, matrix.size - 8, true);
}

function reserveVersionAreas(matrix: QrMatrix): void {
  if (matrix.version < 7) {
    return;
  }
  for (let x = 0; x < 6; x += 1) {
    for (let y = 0; y < 3; y += 1) {
      matrix.setFunction(matrix.size - 11 + y, x, false);
      matrix.setFunction(x, matrix.size - 11 + y, false);
    }
  }
}

function drawFormatBits(matrix: QrMatrix, mask: number): void {
  const bits = computeFormatBits(mask);

  for (let i = 0; i <= 5; i += 1) {
    matrix.setFunction(8, i, getBit(bits, i));
  }
  matrix.setFunction(8, 7, getBit(bits, 6));
  matrix.setFunction(8, 8, getBit(bits, 7));
  matrix.setFunction(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i += 1) {
    matrix.setFunction(14 - i, 8, getBit(bits, i));
  }

  for (let i = 0; i < 8; i += 1) {
    matrix.setFunction(matrix.size - 1 - i, 8, getBit(bits, i));
  }
  for (let i = 8; i < 15; i += 1) {
    matrix.setFunction(8, matrix.size - 15 + i, getBit(bits, i));
  }

  // The always-dark module is part of this same reserved area.
  matrix.setFunction(8, matrix.size - 8, true);
}

function drawVersionBits(matrix: QrMatrix): void {
  if (matrix.version < 7) {
    return;
  }
  const bits = computeVersionBits(matrix.version);
  for (let i = 0; i < 18; i += 1) {
    const bit = getBit(bits, i);
    const a = matrix.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    matrix.setFunction(a, b, bit);
    matrix.setFunction(b, a, bit);
  }
}

/** Places the final interleaved codeword bits into every non-function
 * module, in the standard's boustrophedon (up/down, right-to-left, two
 * columns at a time, skipping the vertical timing column) order. */
function placeDataBits(matrix: QrMatrix, codewords: readonly number[]): void {
  const bits: number[] = [];
  for (const byte of codewords) {
    for (let i = 7; i >= 0; i -= 1) {
      bits.push((byte >>> i) & 1);
    }
  }

  let bitIndex = 0;
  for (let right = matrix.size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    for (let vert = 0; vert < matrix.size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? matrix.size - 1 - vert : vert;
        if (!(matrix.isFunction[y] as boolean[])[x]) {
          const bit = bitIndex < bits.length ? bits[bitIndex] : 0;
          bitIndex += 1;
          (matrix.dark[y] as boolean[])[x] = bit === 1;
        }
      }
    }
  }
}

const MASK_FUNCTIONS: ReadonlyArray<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Applies mask `maskIndex` to every non-function module (XOR-toggling
 * it wherever the mask formula is true), producing a new matrix so the
 * unmasked original can be reused for trying every mask. */
function applyMask(matrix: QrMatrix, maskIndex: number): QrMatrix {
  const masked = new QrMatrix(matrix.version);
  const maskFn = MASK_FUNCTIONS[maskIndex] as (x: number, y: number) => boolean;
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      (masked.isFunction[y] as boolean[])[x] = (matrix.isFunction[y] as boolean[])[x] as boolean;
      const original = matrix.get(x, y);
      const isFn = (matrix.isFunction[y] as boolean[])[x] as boolean;
      (masked.dark[y] as boolean[])[x] = isFn ? original : original !== maskFn(x, y);
    }
  }
  return masked;
}

/** The four penalty rules of ISO/IEC 18004 section 6.8.3. Lower total is
 * better; the mask minimizing this total is the one used. */
function computePenalty(matrix: QrMatrix): number {
  const size = matrix.size;
  let penalty = 0;

  // Rule 1: runs of 5+ same-colored modules in a row or column.
  for (const horizontal of [true, false]) {
    for (let i = 0; i < size; i += 1) {
      let runColor: boolean | null = null;
      let runLength = 0;
      for (let j = 0; j < size; j += 1) {
        const isDark = horizontal ? matrix.get(j, i) : matrix.get(i, j);
        if (isDark === runColor) {
          runLength += 1;
        } else {
          if (runColor !== null && runLength >= 5) {
            penalty += 3 + (runLength - 5);
          }
          runColor = isDark;
          runLength = 1;
        }
      }
      if (runLength >= 5) {
        penalty += 3 + (runLength - 5);
      }
    }
  }

  // Rule 2: each 2x2 block of a single color.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const c = matrix.get(x, y);
      if (matrix.get(x + 1, y) === c && matrix.get(x, y + 1) === c && matrix.get(x + 1, y + 1) === c) {
        penalty += 3;
      }
    }
  }

  // Rule 3: a 1:1:3:1:1 dark:light:dark:dark:dark:light:dark pattern
  // (finder-pattern-like) with 4 light modules immediately before or
  // after it, in a row or column.
  const patternA = [true, false, true, true, true, false, true, false, false, false, false];
  const patternB = [false, false, false, false, true, false, true, true, true, false, true];
  for (const horizontal of [true, false]) {
    for (let i = 0; i < size; i += 1) {
      for (let j = 0; j + 11 <= size; j += 1) {
        let matchesA = true;
        let matchesB = true;
        for (let k = 0; k < 11; k += 1) {
          const isDark = horizontal ? matrix.get(j + k, i) : matrix.get(i, j + k);
          if (isDark !== patternA[k]) matchesA = false;
          if (isDark !== patternB[k]) matchesB = false;
        }
        if (matchesA) penalty += 40;
        if (matchesB) penalty += 40;
      }
    }
  }

  // Rule 4: overall proportion of dark modules, penalized for deviating
  // from 50%.
  let darkCount = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (matrix.get(x, y)) darkCount += 1;
    }
  }
  const percentDark = (darkCount * 100) / (size * size);
  penalty += Math.floor(Math.abs(percentDark - 50) / 5) * 10;

  return penalty;
}

/** Builds the fully masked, format/version-stamped matrix for `payload`,
 * choosing whichever of the 8 standard masks yields the lowest penalty
 * score. */
function buildMatrix(payload: Uint8Array): QrMatrix {
  const version = selectVersion(payload);
  const dataCodewords = buildDataCodewords(payload, version);
  const blocks = splitIntoBlocks(dataCodewords, version);
  const finalCodewords = interleaveCodewords(blocks);

  const template = new QrMatrix(version);
  drawFinderPattern(template, 3, 3);
  drawFinderPattern(template, template.size - 4, 3);
  drawFinderPattern(template, 3, template.size - 4);
  drawAlignmentPatterns(template);
  drawTimingPatterns(template);
  reserveFormatAreas(template);
  reserveVersionAreas(template);
  placeDataBits(template, finalCodewords);

  let best: QrMatrix | null = null;
  let bestPenalty = Infinity;

  for (let maskIndex = 0; maskIndex < 8; maskIndex += 1) {
    const candidate = applyMask(template, maskIndex);
    drawFormatBits(candidate, maskIndex);
    drawVersionBits(candidate);
    const penalty = computePenalty(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = candidate;
    }
  }

  return best as QrMatrix;
}

// ---------------------------------------------------------------------
// SVG rendering
// ---------------------------------------------------------------------

export interface QrSvgOptions {
  /** Quiet-zone width in modules on every side. ISO/IEC 18004 requires
   * at least 4; this is the standard's own minimum, not a stylistic
   * choice, so it defaults to 4 and refuses anything smaller. */
  quietZoneModules?: number;
}

const MIN_QUIET_ZONE_MODULES = 4;

/**
 * Encodes `text` as a QR code and renders it to a self-contained SVG
 * string: true black modules (`#000000`) on a true white background
 * (`#ffffff`), with the mandatory quiet zone. This is intentionally NOT
 * theme-aware — a QR code that tints itself into a dark theme's palette
 * loses the contrast a camera needs to read it, so it always renders in
 * fixed true dark-on-light regardless of the app's current theme.
 */
export function encodeQrSvg(text: string, options: QrSvgOptions = {}): string {
  const quietZone = options.quietZoneModules ?? MIN_QUIET_ZONE_MODULES;
  if (!Number.isInteger(quietZone) || quietZone < MIN_QUIET_ZONE_MODULES) {
    throw new QrEncodingError(
      `Quiet zone must be an integer of at least ${MIN_QUIET_ZONE_MODULES} modules (ISO/IEC 18004's own minimum), got ${quietZone}.`,
    );
  }

  const payload = Buffer.from(text, 'utf8');
  const matrix = buildMatrix(payload);

  const dimension = matrix.size + quietZone * 2;
  const pathParts: string[] = [];
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.get(x, y)) {
        const px = x + quietZone;
        const py = y + quietZone;
        pathParts.push(`M${px} ${py}h1v1h-1z`);
      }
    }
  }

  const ariaLabel = 'QR code for two-factor authenticator pairing';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" ` +
    `width="${dimension * 8}" height="${dimension * 8}" role="img" aria-label="${escapeXmlAttr(ariaLabel)}" ` +
    `shape-rendering="crispEdges">` +
    `<rect x="0" y="0" width="${dimension}" height="${dimension}" fill="#ffffff"/>` +
    `<path d="${pathParts.join('')}" fill="#000000"/>` +
    `</svg>`
  );
}

function escapeXmlAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
