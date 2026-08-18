/**
 * Hand-written ZIP archive writer (no dependency). Implements exactly the
 * subset of the ZIP spec needed to write a well-formed, widely-readable
 * archive: local file headers, STORE and DEFLATE compression (via Node's
 * built-in zlib, not a third-party library), a central directory, and an
 * end-of-central-directory record. CRC-32 is computed with a hand-rolled
 * table since Node's crypto module does not provide it.
 *
 * Every entry path is validated before writing: it must be relative and
 * contain no '..' segment, so extracting the archive can never write outside
 * the directory the user chose (a "zip slip" path traversal).
 */
import { deflateRawSync } from 'node:zlib';
import type { ArchiveEntryInput } from './types.js';

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = buildCrcTable();

export function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Validates and normalizes an archive entry path. Throws if the path is
 * absolute, empty, or escapes its own directory tree via '..' - the archive
 * writer refuses to produce an entry that could extract outside its target
 * directory.
 */
export function normalizeArchivePath(inputPath: string): string {
  const normalized = inputPath.replace(/\/g, '/').replace(/^\/+/, '');
  if (normalized.length === 0) {
    throw new Error('Archive entry path must not be empty.');
  }
  if (/^[A-Za-z]:/.test(inputPath) || inputPath.startsWith('/') || inputPath.startsWith('\')) {
    throw new Error(`Archive entry path must be relative, got: ${inputPath}`);
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error(`Archive entry path must not contain '.' or '..' segments, got: ${inputPath}`);
  }
  return normalized;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { time: dosTime & 0xffff, date: dosDate & 0xffff };
}

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = 20;

interface PreparedEntry {
  path: Buffer;
  method: 0 | 8;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  compressedData: Buffer;
  dosTime: number;
  dosDate: number;
  localHeaderOffset: number;
}

/**
 * Builds a ZIP archive from the given entries and returns the raw archive
 * bytes. Every entry's path is validated by `normalizeArchivePath` before
 * anything is written.
 */
export function createZipArchive(entries: ArchiveEntryInput[]): Buffer {
  const prepared: PreparedEntry[] = [];
  const localChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const safePath = normalizeArchivePath(entry.path);
    const pathBuf = Buffer.from(safePath, 'utf-8');
    const method = entry.method === 'store' ? 0 : 8;
    const uncompressed = entry.data;
    const compressed = method === 8 ? deflateRawSync(uncompressed) : uncompressed;
    const crc = crc32(uncompressed);
    const { time, date } = dosDateTime(entry.mtime ?? new Date());

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(VERSION_NEEDED, 4);
    localHeader.writeUInt16LE(0x0800, 6); // general purpose flag: UTF-8 filenames
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(pathBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    prepared.push({
      path: pathBuf,
      method,
      crc,
      compressedSize: compressed.length,
      uncompressedSize: uncompressed.length,
      compressedData: compressed,
      dosTime: time,
      dosDate: date,
      localHeaderOffset: offset,
    });

    localChunks.push(localHeader, pathBuf, compressed);
    offset += localHeader.length + pathBuf.length + compressed.length;
  }

  const centralChunks: Buffer[] = [];
  let centralSize = 0;
  for (const entry of prepared) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt16LE(entry.dosTime, 12);
    central.writeUInt16LE(entry.dosDate, 14);
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.compressedSize, 20);
    central.writeUInt32LE(entry.uncompressedSize, 24);
    central.writeUInt16LE(entry.path.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal file attributes
    central.writeUInt32LE(0, 38); // external file attributes
    central.writeUInt32LE(entry.localHeaderOffset, 42);
    centralChunks.push(central, entry.path);
    centralSize += central.length + entry.path.length;
  }

  const centralDirOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(prepared.length, 8);
  eocd.writeUInt16LE(prepared.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}
