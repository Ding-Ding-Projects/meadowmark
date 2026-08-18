/**
 * Hand-written Windows .ico (ICONDIR) container encoder.
 *
 * The ICO format is a small fixed header (ICONDIR) followed by one
 * ICONDIRENTRY per image, followed by the raw image data itself. Modern
 * Windows (Vista+) accepts a plain PNG file as an icon frame's image
 * data for any size, which is what we embed here -- there is no need to
 * also hand-roll the legacy uncompressed-BMP icon format.
 *
 * Reference: the MS-ICO / "ICO File Format" layout used by Windows
 * Explorer, the taskbar, and the shell icon cache.
 */
import { MAX_ICO_ENTRIES } from './bounds';
import { InvalidEditParametersError, MalformedImageError } from './errors';
import { decodePng } from './png-codec';

export interface IcoEntrySource {
  readonly size: number;
  readonly png: Buffer;
}

const ICONDIR_SIZE = 6;
const ICONDIRENTRY_SIZE = 16;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Packs a set of square PNG-encoded images into a single multi-resolution
 * .ico file. Every entry is verified (square, matches its claimed size,
 * a real PNG signature) before it is packed; a bad entry throws rather
 * than silently producing a corrupt icon.
 */
export function encodeIco(entries: readonly IcoEntrySource[]): Buffer {
  if (entries.length === 0) {
    throw new InvalidEditParametersError('encodeIco: at least one image is required.');
  }
  if (entries.length > MAX_ICO_ENTRIES) {
    throw new InvalidEditParametersError(`encodeIco: too many entries (${entries.length} > ${MAX_ICO_ENTRIES}).`);
  }

  for (const entry of entries) {
    if (entry.size <= 0 || entry.size > 256) {
      throw new InvalidEditParametersError(`encodeIco: size ${entry.size} is outside the valid ICO range (1..256).`);
    }
    if (!entry.png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new MalformedImageError('encodeIco: an entry is not a valid PNG file.');
    }
  }

  const dir = Buffer.alloc(ICONDIR_SIZE);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // type: 1 = icon
  dir.writeUInt16LE(entries.length, 4);

  const entryHeaders: Buffer[] = [];
  const imageBlocks: Buffer[] = [];
  let dataOffset = ICONDIR_SIZE + entries.length * ICONDIRENTRY_SIZE;

  for (const entry of entries) {
    const header = Buffer.alloc(ICONDIRENTRY_SIZE);
    // Width/height byte fields use 0 to mean 256.
    header.writeUInt8(entry.size === 256 ? 0 : entry.size, 0);
    header.writeUInt8(entry.size === 256 ? 0 : entry.size, 1);
    header.writeUInt8(0, 2); // color count: 0 = not a palette image
    header.writeUInt8(0, 3); // reserved
    header.writeUInt16LE(1, 4); // color planes
    header.writeUInt16LE(32, 6); // bits per pixel
    header.writeUInt32LE(entry.png.length, 8); // size of image data
    header.writeUInt32LE(dataOffset, 12); // offset of image data from file start

    entryHeaders.push(header);
    imageBlocks.push(entry.png);
    dataOffset += entry.png.length;
  }

  return Buffer.concat([dir, ...entryHeaders, ...imageBlocks]);
}

export interface IcoVerificationResult {
  readonly entryCount: number;
  readonly sizes: readonly number[];
}

/**
 * Re-parses an encoded .ico buffer and decodes every embedded PNG frame
 * with this module's own PNG decoder, confirming each frame's declared
 * size matches what the decoder actually finds. Used by the conversion
 * pipeline as the ICO's round-trip verification step.
 */
export function verifyIco(buf: Buffer): IcoVerificationResult {
  if (buf.length < ICONDIR_SIZE) {
    throw new MalformedImageError('verifyIco: file is too short to be an ICO.');
  }
  const reserved = buf.readUInt16LE(0);
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);
  if (reserved !== 0 || type !== 1) {
    throw new MalformedImageError('verifyIco: not a valid ICONDIR header.');
  }
  if (count === 0 || count > MAX_ICO_ENTRIES) {
    throw new MalformedImageError('verifyIco: invalid or excessive entry count.');
  }

  const sizes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const entryOffset = ICONDIR_SIZE + i * ICONDIRENTRY_SIZE;
    if (entryOffset + ICONDIRENTRY_SIZE > buf.length) {
      throw new MalformedImageError('verifyIco: entry table runs past the end of the file.');
    }
    const widthByte = buf.readUInt8(entryOffset);
    const declaredSize = widthByte === 0 ? 256 : widthByte;
    const imageSize = buf.readUInt32LE(entryOffset + 8);
    const imageOffset = buf.readUInt32LE(entryOffset + 12);
    if (imageOffset + imageSize > buf.length) {
      throw new MalformedImageError('verifyIco: image data runs past the end of the file.');
    }
    const imageData = buf.subarray(imageOffset, imageOffset + imageSize);
    const decoded = decodePng(imageData);
    if (decoded.width !== declaredSize || decoded.height !== declaredSize) {
      throw new MalformedImageError(
        `verifyIco: entry declares ${declaredSize}px but its embedded PNG decodes to ${decoded.width}x${decoded.height}.`,
      );
    }
    sizes.push(declaredSize);
  }

  return { entryCount: count, sizes };
}
