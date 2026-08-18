/**
 * Hand-written ZIP central-directory + local-file-header reader, using
 * only Node's builtin zlib (`inflateRawSync`) for the DEFLATE method. No
 * external archive library is bundled.
 *
 * Only the two compression methods every ordinary ZIP tool actually uses
 * are supported: 0 (stored, no compression) and 8 (DEFLATE). Any other
 * method, and any entry whose general-purpose bit flag marks it
 * encrypted (bit 0) or uses a data descriptor with unknown-at-header-time
 * sizes in a way we cannot safely bound (bit 3, when the local header's
 * sizes are all zero), is rejected rather than guessed at.
 *
 * Zip-bomb protection: every entry declares its own compressed and
 * uncompressed size in the central directory, which we read BEFORE
 * decompressing anything. We sum the declared uncompressed sizes and
 * check them against the caller's resource budget before touching a
 * single byte of entry data, and we also verify the ACTUAL inflated size
 * of each entry against its declared size (bounded by budget as we go),
 * so a corrupted or adversarial declared size cannot be used to smuggle
 * more decompressed data than was budgeted.
 */

import { inflateRawSync } from 'node:zlib';
import { EncryptedInputError, MalformedInputError, ResourceLimitExceededError, UnsupportedConstructError } from '../errors';
import type { ResourceBudget } from '../types';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

export interface ZipEntryInfo {
  path: string;
  isDirectory: boolean;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  encrypted: boolean;
  localHeaderOffset: number;
}

function byteAt(buf: Uint8Array, offset: number): number {
  const value = buf[offset];
  if (value === undefined) {
    throw new MalformedInputError(`Unexpected end of ZIP data at byte offset ${offset}.`);
  }
  return value;
}

function readUInt16LE(buf: Uint8Array, offset: number): number {
  return byteAt(buf, offset) | (byteAt(buf, offset + 1) << 8);
}
function readUInt32LE(buf: Uint8Array, offset: number): number {
  return (byteAt(buf, offset) | (byteAt(buf, offset + 1) << 8) | (byteAt(buf, offset + 2) << 16) | (byteAt(buf, offset + 3) << 24)) >>> 0;
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  // The EOCD record is 22 bytes plus an optional comment of up to 65535
  // bytes; scan backward from the end for its signature.
  const minOffset = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= minOffset; i -= 1) {
    if (readUInt32LE(bytes, i) === EOCD_SIGNATURE) {
      return i;
    }
  }
  throw new MalformedInputError('No ZIP end-of-central-directory record found; the file is not a valid ZIP archive or is truncated.');
}

/** Lists every entry in the archive by reading only the central
 * directory (never decompresses entry data). Bounded by budget.maxItems
 * for entry count and budget.maxDepth for path nesting. */
export function listZipEntries(bytes: Uint8Array, budget: ResourceBudget): ZipEntryInfo[] {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const totalEntries = readUInt16LE(bytes, eocdOffset + 10);
  const centralDirSize = readUInt32LE(bytes, eocdOffset + 12);
  const centralDirOffset = readUInt32LE(bytes, eocdOffset + 16);

  if (centralDirOffset + centralDirSize > eocdOffset) {
    throw new MalformedInputError('ZIP central directory extends past the end-of-central-directory record; the archive is corrupt.');
  }

  const entries: ZipEntryInfo[] = [];
  let offset = centralDirOffset;
  let totalDeclaredUncompressed = 0;

  for (let i = 0; i < totalEntries; i += 1) {
    budget.countItem();
    if (offset + 46 > bytes.length) {
      throw new MalformedInputError('ZIP central directory entry is truncated.');
    }
    const signature = readUInt32LE(bytes, offset);
    if (signature !== CENTRAL_DIR_SIGNATURE) {
      throw new MalformedInputError(`Expected a ZIP central directory entry at offset ${offset}, found a different signature.`);
    }
    const generalPurposeFlag = readUInt16LE(bytes, offset + 8);
    const compressionMethod = readUInt16LE(bytes, offset + 10);
    const crc32 = readUInt32LE(bytes, offset + 16);
    const compressedSize = readUInt32LE(bytes, offset + 20);
    const uncompressedSize = readUInt32LE(bytes, offset + 24);
    const fileNameLength = readUInt16LE(bytes, offset + 28);
    const extraFieldLength = readUInt16LE(bytes, offset + 30);
    const commentLength = readUInt16LE(bytes, offset + 32);
    const localHeaderOffset = readUInt32LE(bytes, offset + 42);

    const nameStart = offset + 46;
    const nameBytes = bytes.subarray(nameStart, nameStart + fileNameLength);
    const path = new TextDecoder('utf-8').decode(nameBytes);
    const depthOfPath = path.split('/').filter((p) => p.length > 0).length;
    if (depthOfPath > budget.limits.maxDepth) {
      throw new ResourceLimitExceededError('depth', budget.limits.maxDepth, `ZIP entry path "${path}" is nested deeper than allowed.`);
    }

    const encrypted = (generalPurposeFlag & 0x1) !== 0;
    const isDirectory = path.endsWith('/');

    totalDeclaredUncompressed += uncompressedSize;
    if (totalDeclaredUncompressed > budget.limits.maxOutputBytes) {
      throw new ResourceLimitExceededError(
        'output-bytes',
        budget.limits.maxOutputBytes,
        'The archive declares more total uncompressed content than this converter will extract (possible zip bomb).'
      );
    }

    entries.push({ path, isDirectory, compressionMethod, compressedSize, uncompressedSize, crc32, encrypted, localHeaderOffset });

    offset = nameStart + fileNameLength + extraFieldLength + commentLength;
  }

  return entries;
}

/** Reads and decompresses one entry's data, verifying the actual
 * inflated size never exceeds what the central directory declared (so a
 * corrupted declared size cannot be used to sneak more decompressed
 * bytes past the budget than the caller was told about). */
export function readZipEntryData(bytes: Uint8Array, entry: ZipEntryInfo, budget: ResourceBudget): Uint8Array {
  if (entry.encrypted) {
    throw new EncryptedInputError(`ZIP entry "${entry.path}" is encrypted; this converter does not decrypt archive contents.`);
  }
  const offset = entry.localHeaderOffset;
  if (offset + 30 > bytes.length) {
    throw new MalformedInputError(`Local file header for "${entry.path}" is truncated.`);
  }
  const signature = readUInt32LE(bytes, offset);
  if (signature !== LOCAL_FILE_SIGNATURE) {
    throw new MalformedInputError(`Local file header for "${entry.path}" has an invalid signature; the archive is corrupt.`);
  }
  const generalPurposeFlag = readUInt16LE(bytes, offset + 6);
  if ((generalPurposeFlag & 0x8) !== 0 && entry.compressedSize === 0) {
    throw new UnsupportedConstructError(
      `ZIP entry "${entry.path}" uses a streaming data descriptor with no size declared up front, which this converter does not support (it cannot bound decompression size in advance).`
    );
  }
  const fileNameLength = readUInt16LE(bytes, offset + 26);
  const extraFieldLength = readUInt16LE(bytes, offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraFieldLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length) {
    throw new MalformedInputError(`Data for "${entry.path}" extends past the end of the archive; the file is truncated or corrupt.`);
  }
  const compressedData = bytes.subarray(dataStart, dataEnd);

  let output: Uint8Array;
  if (entry.compressionMethod === 0) {
    output = compressedData;
  } else if (entry.compressionMethod === 8) {
    try {
      output = inflateRawSync(compressedData, { maxOutputLength: budget.limits.maxOutputBytes });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new MalformedInputError(`Could not decompress "${entry.path}": ${reason}`);
    }
  } else {
    throw new UnsupportedConstructError(
      `ZIP entry "${entry.path}" uses compression method ${entry.compressionMethod}, which is not "stored" (0) or "DEFLATE" (8); this converter only supports those two.`
    );
  }

  if (output.byteLength !== entry.uncompressedSize) {
    throw new MalformedInputError(
      `"${entry.path}" decompressed to ${output.byteLength} bytes but the archive declared ${entry.uncompressedSize}; the archive is corrupt or was tampered with.`
    );
  }
  budget.produceOutput(output.byteLength);
  return output;
}
