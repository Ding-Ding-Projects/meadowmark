/**
 * A PNG decoder and encoder implemented directly from the PNG
 * specification, using only `node:zlib` for the DEFLATE/INFLATE stream.
 * No image library is used anywhere in this file.
 *
 * Decode supports the PNG spec's five colour types (grayscale, truecolor,
 * indexed, grayscale+alpha, truecolor+alpha) at every bit depth the spec
 * allows for each, non-interlaced only. Every chunk's CRC-32 is verified.
 * An `acTL` chunk (APNG animation) is rejected outright, before any pixel
 * work happens, so an "animated" PNG is never partially decoded down to
 * its first frame and silently treated as a still image.
 *
 * Encode always emits 8-bit RGBA (colour type 6), non-interlaced,
 * unfiltered (filter type 0 per scanline) -- simple, always valid, and
 * trivially decodable by this same module for round-trip verification.
 */
import zlib from 'node:zlib';
import { byteAt } from './bytes';
import { crc32 } from './crc32';
import {
  DECODE_TIME_BUDGET_MS,
  DECODE_TIME_CHECK_INTERVAL_ROWS,
  MAX_DECODED_RGBA_BYTES,
  MAX_DIMENSION,
  MAX_PIXELS,
} from './bounds';
import {
  AnimatedImageError,
  DecodeBudgetExceededError,
  ImageTooLargeError,
  MalformedImageError,
  UnsupportedFormatError,
} from './errors';
import type { RGBA8Image } from './types';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface RawChunk {
  readonly type: string;
  readonly data: Buffer;
}

function readChunks(buf: Buffer): RawChunk[] {
  const chunks: RawChunk[] = [];
  let offset = SIGNATURE.length;

  while (offset < buf.length) {
    if (offset + 8 > buf.length) {
      throw new MalformedImageError('PNG chunk header runs past the end of the file.');
    }
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (length < 0 || dataEnd + 4 > buf.length) {
      throw new MalformedImageError(`PNG chunk "${type}" declares a length past the end of the file.`);
    }
    const data = buf.subarray(dataStart, dataEnd);
    const storedCrc = buf.readUInt32BE(dataEnd);
    const computedCrc = crc32(buf, offset + 4, dataEnd);
    if (storedCrc !== computedCrc) {
      throw new MalformedImageError(`PNG chunk "${type}" failed its CRC-32 check.`);
    }
    chunks.push({ type, data });
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }

  return chunks;
}

type ColorType = 0 | 2 | 3 | 4 | 6;

interface Ihdr {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: ColorType;
}

const ALLOWED_BIT_DEPTHS: Record<ColorType, readonly number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

const CHANNELS: Record<ColorType, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function parseIhdr(data: Buffer): Ihdr {
  if (data.length !== 13) {
    throw new MalformedImageError('PNG IHDR chunk has the wrong length.');
  }
  const width = data.readUInt32BE(0);
  const height = data.readUInt32BE(4);
  const bitDepth = byteAt(data, 8);
  const colorTypeRaw = byteAt(data, 9);
  const compression = byteAt(data, 10);
  const filter = byteAt(data, 11);
  const interlace = byteAt(data, 12);

  if (width === 0 || height === 0) {
    throw new MalformedImageError('PNG declares a zero-sized image.');
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new ImageTooLargeError(
      `Image is ${width}x${height}px, exceeding the maximum accepted dimension of ${MAX_DIMENSION}px.`,
    );
  }
  if (width * height > MAX_PIXELS) {
    throw new ImageTooLargeError(
      `Image has ${width * height} pixels, exceeding the maximum accepted pixel count of ${MAX_PIXELS}.`,
    );
  }
  if (compression !== 0) {
    throw new UnsupportedFormatError('PNG uses an unrecognized compression method.');
  }
  if (filter !== 0) {
    throw new UnsupportedFormatError('PNG uses an unrecognized filter method.');
  }
  if (interlace !== 0) {
    throw new UnsupportedFormatError(
      'Adam7-interlaced PNGs are not supported. Re-save the image as a non-interlaced PNG.',
    );
  }
  if (colorTypeRaw !== 0 && colorTypeRaw !== 2 && colorTypeRaw !== 3 && colorTypeRaw !== 4 && colorTypeRaw !== 6) {
    throw new MalformedImageError(`PNG declares an invalid colour type (${colorTypeRaw}).`);
  }
  const colorType = colorTypeRaw as ColorType;
  if (!ALLOWED_BIT_DEPTHS[colorType].includes(bitDepth)) {
    throw new MalformedImageError(
      `PNG declares bit depth ${bitDepth} with colour type ${colorType}, which is not a valid combination.`,
    );
  }

  return { width, height, bitDepth, colorType };
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Reverses PNG scanline filtering in place, producing raw (unfiltered) pixel bytes. */
function unfilter(inflated: Buffer, height: number, bytesPerScanline: number, bpp: number): Buffer {
  const stride = bytesPerScanline + 1; // +1 for the leading filter-type byte
  const out = Buffer.alloc(bytesPerScanline * height);
  const deadlineAt = Date.now() + DECODE_TIME_BUDGET_MS;

  for (let y = 0; y < height; y += 1) {
    if (y % DECODE_TIME_CHECK_INTERVAL_ROWS === 0 && Date.now() > deadlineAt) {
      throw new DecodeBudgetExceededError('PNG decoding exceeded its time budget; the file may be adversarial.');
    }

    const rowStart = y * stride;
    const filterType = byteAt(inflated, rowStart);
    const srcRowStart = rowStart + 1;
    const dstRowStart = y * bytesPerScanline;
    const prevDstRowStart = dstRowStart - bytesPerScanline;

    for (let x = 0; x < bytesPerScanline; x += 1) {
      const rawByte = byteAt(inflated, srcRowStart + x);
      const a = x >= bpp ? (out[dstRowStart + x - bpp] as number) : 0;
      const b = y > 0 ? (out[prevDstRowStart + x] as number) : 0;
      const c = y > 0 && x >= bpp ? (out[prevDstRowStart + x - bpp] as number) : 0;

      let value: number;
      switch (filterType) {
        case 0: // None
          value = rawByte;
          break;
        case 1: // Sub
          value = (rawByte + a) & 0xff;
          break;
        case 2: // Up
          value = (rawByte + b) & 0xff;
          break;
        case 3: // Average
          value = (rawByte + Math.floor((a + b) / 2)) & 0xff;
          break;
        case 4: // Paeth
          value = (rawByte + paethPredictor(a, b, c)) & 0xff;
          break;
        default:
          throw new MalformedImageError(`PNG scanline declares an invalid filter type (${filterType}).`);
      }
      out[dstRowStart + x] = value;
    }
  }

  return out;
}

/** Reads a single sample of `bitDepth` bits from a scanline at sample index `sampleIndex` (MSB-first, per the spec). */
function readSample(row: Buffer, sampleIndex: number, bitDepth: number): number {
  if (bitDepth === 8) return byteAt(row, sampleIndex);
  if (bitDepth === 16) return row.readUInt16BE(sampleIndex * 2);

  // bitDepth is 1, 2, or 4: multiple samples are packed per byte, MSB-first.
  const samplesPerByte = 8 / bitDepth;
  const byteIndex = Math.floor(sampleIndex / samplesPerByte);
  const byte = byteAt(row, byteIndex);
  const shift = 8 - bitDepth - (sampleIndex % samplesPerByte) * bitDepth;
  const mask = (1 << bitDepth) - 1;
  return (byte >> shift) & mask;
}

function scaleToByte(sample: number, bitDepth: number): number {
  if (bitDepth === 8) return sample;
  const maxVal = (1 << bitDepth) - 1;
  return Math.round((sample * 255) / maxVal);
}

interface Palette {
  readonly rgb: Buffer; // 3 bytes per entry
  readonly alpha: Buffer; // 1 byte per entry, defaults to 255
}

function parsePalette(plte: Buffer | undefined, trns: Buffer | undefined, entriesExpected: boolean): Palette | undefined {
  if (!entriesExpected) return undefined;
  if (!plte || plte.length === 0 || plte.length % 3 !== 0) {
    throw new MalformedImageError('Indexed-colour PNG is missing a valid PLTE chunk.');
  }
  const count = plte.length / 3;
  const alpha = Buffer.alloc(count, 255);
  if (trns) {
    if (trns.length > count) {
      throw new MalformedImageError('PNG tRNS chunk has more entries than the palette.');
    }
    trns.copy(alpha, 0);
  }
  return { rgb: plte, alpha };
}

export interface DecodedPng extends RGBA8Image {}

/**
 * Decodes a PNG byte buffer into a straight (non-premultiplied) RGBA8
 * bitmap. Throws a typed `LogoProcessingError` subclass for every
 * failure mode -- there is no partial-success return value.
 */
export function decodePng(buf: Buffer): DecodedPng {
  if (!buf.subarray(0, SIGNATURE.length).equals(SIGNATURE)) {
    throw new MalformedImageError('File does not start with the PNG signature.');
  }

  const chunks = readChunks(buf);
  const first = chunks[0];
  if (!first || first.type !== 'IHDR') {
    throw new MalformedImageError('PNG is missing its IHDR chunk, or IHDR is not the first chunk.');
  }
  const ihdr = parseIhdr(first.data);

  // Animated PNGs carry an acTL chunk (almost always before the first
  // IDAT). We check for it, and refuse outright, BEFORE doing any
  // inflate/unfilter work: an animated source is never partially
  // decoded down to a still frame.
  if (chunks.some((c) => c.type === 'acTL')) {
    throw new AnimatedImageError('Animated PNGs (APNG) are not supported as a logo source. Use a static PNG.');
  }

  let plteData: Buffer | undefined;
  let trnsData: Buffer | undefined;
  const idatParts: Buffer[] = [];

  for (const chunk of chunks) {
    if (chunk.type === 'PLTE') plteData = chunk.data;
    else if (chunk.type === 'tRNS') trnsData = chunk.data;
    else if (chunk.type === 'IDAT') idatParts.push(chunk.data);
  }

  if (idatParts.length === 0) {
    throw new MalformedImageError('PNG has no IDAT (pixel data) chunks.');
  }

  const channels = CHANNELS[ihdr.colorType];
  const bitsPerPixel = channels * ihdr.bitDepth;
  const bytesPerScanline = Math.ceil((bitsPerPixel * ihdr.width) / 8);
  const expectedInflatedLength = (bytesPerScanline + 1) * ihdr.height;

  if (expectedInflatedLength > MAX_DECODED_RGBA_BYTES) {
    throw new ImageTooLargeError('Decoded PNG scanline data would exceed the allowed size for this image.');
  }

  const compressed = Buffer.concat(idatParts);
  let inflated: Buffer;
  try {
    inflated = zlib.inflateSync(compressed, { maxOutputLength: expectedInflatedLength });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('exceed')) {
      throw new ImageTooLargeError(
        'Decompressing the PNG pixel data would exceed the size implied by its declared dimensions ' +
          '(possible decompression bomb).',
      );
    }
    throw new MalformedImageError(`PNG pixel data failed to decompress: ${message}`);
  }

  if (inflated.length !== expectedInflatedLength) {
    throw new MalformedImageError('PNG decompressed to an unexpected number of bytes for its declared dimensions.');
  }

  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const raw = unfilter(inflated, ihdr.height, bytesPerScanline, bpp);

  const palette = parsePalette(plteData, trnsData, ihdr.colorType === 3);
  const trnsKey =
    ihdr.colorType === 0 || ihdr.colorType === 2 ? trnsData : undefined;

  const out = Buffer.alloc(ihdr.width * ihdr.height * 4);

  for (let y = 0; y < ihdr.height; y += 1) {
    const rowStart = y * bytesPerScanline;
    const row = raw.subarray(rowStart, rowStart + bytesPerScanline);

    for (let x = 0; x < ihdr.width; x += 1) {
      const pixelOffset = (y * ihdr.width + x) * 4;
      const sampleBase = x * channels;

      let r: number;
      let g: number;
      let b: number;
      let a: number;

      switch (ihdr.colorType) {
        case 0: {
          const gray = readSample(row, sampleBase, ihdr.bitDepth);
          const grayByte = scaleToByte(gray, ihdr.bitDepth);
          r = grayByte;
          g = grayByte;
          b = grayByte;
          a = 255;
          if (trnsKey && trnsKey.length >= 2 && trnsKey.readUInt16BE(0) === gray) a = 0;
          break;
        }
        case 2: {
          const rs = readSample(row, sampleBase, ihdr.bitDepth);
          const gs = readSample(row, sampleBase + 1, ihdr.bitDepth);
          const bs = readSample(row, sampleBase + 2, ihdr.bitDepth);
          r = scaleToByte(rs, ihdr.bitDepth);
          g = scaleToByte(gs, ihdr.bitDepth);
          b = scaleToByte(bs, ihdr.bitDepth);
          a = 255;
          if (
            trnsKey &&
            trnsKey.length >= 6 &&
            trnsKey.readUInt16BE(0) === rs &&
            trnsKey.readUInt16BE(2) === gs &&
            trnsKey.readUInt16BE(4) === bs
          ) {
            a = 0;
          }
          break;
        }
        case 3: {
          if (!palette) throw new MalformedImageError('Indexed-colour PNG is missing its palette.');
          const index = readSample(row, sampleBase, ihdr.bitDepth);
          if (index * 3 + 2 >= palette.rgb.length) {
            throw new MalformedImageError('PNG pixel references a palette index out of range.');
          }
          r = byteAt(palette.rgb, index * 3);
          g = byteAt(palette.rgb, index * 3 + 1);
          b = byteAt(palette.rgb, index * 3 + 2);
          a = index < palette.alpha.length ? byteAt(palette.alpha, index) : 255;
          break;
        }
        case 4: {
          const gray = readSample(row, sampleBase, ihdr.bitDepth);
          const alphaSample = readSample(row, sampleBase + 1, ihdr.bitDepth);
          const grayByte = scaleToByte(gray, ihdr.bitDepth);
          r = grayByte;
          g = grayByte;
          b = grayByte;
          a = scaleToByte(alphaSample, ihdr.bitDepth);
          break;
        }
        case 6: {
          r = scaleToByte(readSample(row, sampleBase, ihdr.bitDepth), ihdr.bitDepth);
          g = scaleToByte(readSample(row, sampleBase + 1, ihdr.bitDepth), ihdr.bitDepth);
          b = scaleToByte(readSample(row, sampleBase + 2, ihdr.bitDepth), ihdr.bitDepth);
          a = scaleToByte(readSample(row, sampleBase + 3, ihdr.bitDepth), ihdr.bitDepth);
          break;
        }
      }

      out[pixelOffset] = r;
      out[pixelOffset + 1] = g;
      out[pixelOffset + 2] = b;
      out[pixelOffset + 3] = a;
    }
  }

  return { width: ihdr.width, height: ihdr.height, data: out };
}

function writeChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

/**
 * Encodes an RGBA8 bitmap as an 8-bit, non-interlaced, unfiltered
 * (filter type 0) truecolor-with-alpha PNG. Simplicity over compression
 * ratio: this always produces a spec-valid file this module's own
 * decoder can round-trip exactly, which is what the conversion pipeline
 * verifies before treating any output as usable.
 */
export function encodePng(image: RGBA8Image): Buffer {
  const { width, height, data } = image;
  if (data.length !== width * height * 4) {
    throw new MalformedImageError('encodePng: pixel buffer length does not match width*height*4.');
  }
  if (width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new ImageTooLargeError('encodePng: image dimensions are out of the accepted range.');
  }

  const bytesPerScanline = width * 4;
  const raw = Buffer.alloc((bytesPerScanline + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (bytesPerScanline + 1);
    raw[rowStart] = 0; // filter type: None
    data.copy(raw, rowStart + 1, y * bytesPerScanline, (y + 1) * bytesPerScanline);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // colour type: truecolor + alpha
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace: none

  return Buffer.concat([
    SIGNATURE,
    writeChunk('IHDR', ihdr),
    writeChunk('IDAT', compressed),
    writeChunk('IEND', Buffer.alloc(0)),
  ]);
}
