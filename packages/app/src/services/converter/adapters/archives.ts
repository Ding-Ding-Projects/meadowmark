/**
 * Archive adapters: ZIP inspection and extraction, plus GZIP
 * compress/decompress. Both use only Node's builtin `node:zlib` — no
 * external archive library or binary. See zip/central-directory.ts for
 * the ZIP format reader itself; this module wires it into the registry
 * and handles safe, bounded extraction to disk.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { atomicWriteFile } from '../../../atomic-write';
import { MalformedInputError, ResourceLimitExceededError } from '../errors';
import { listZipEntries, readZipEntryData, type ZipEntryInfo } from '../zip/central-directory';
import { DEFAULT_ARCHIVE_LIMITS, type ExtractedEntry, type RegistryEntry } from '../types';

function zipInspectEntry(): RegistryEntry {
  return {
    id: 'zip-inspect',
    category: 'archives',
    sourceFormat: { id: 'zip', label: 'ZIP archive' },
    targetFormat: { id: 'zip-listing-json', label: 'ZIP contents listing (JSON)' },
    sourceSignatures: [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
    bundled: true,
    packagedArtifactProof: 'Hand-written ZIP central-directory reader in services/converter/zip/central-directory.ts (no external archive library).',
    metadataBehavior: 'Reads only the ZIP central directory (never decompresses entry data) and reports each entry\'s path, size, compression method, and CRC-32.',
    lossiness: 'lossless',
    lossDisclosure: [],
    limits: DEFAULT_ARCHIVE_LIMITS,
    sandboxBoundary: 'Runs in-process in the Electron main process under a bounded resource budget (entry count, path depth, declared total size); no subprocess, no network access.',
    userFacingName: 'Inspect ZIP contents',
    kind: 'byte-to-byte',
    convert: async (input, ctx) => {
      ctx.budget.consumeInput(input.byteLength);
      const entries = listZipEntries(input, ctx.budget);
      const listing = entries.map((e) => ({
        path: e.path,
        isDirectory: e.isDirectory,
        compressionMethod: e.compressionMethod === 0 ? 'stored' : e.compressionMethod === 8 ? 'deflate' : `unknown (${e.compressionMethod})`,
        compressedSize: e.compressedSize,
        uncompressedSize: e.uncompressedSize,
        crc32: e.crc32.toString(16).padStart(8, '0'),
        encrypted: e.encrypted,
      }));
      const output = new TextEncoder().encode(JSON.stringify(listing, null, 2));
      ctx.budget.produceOutput(output.byteLength);
      return output;
    },
    validateOutput: (bytes) => {
      try {
        JSON.parse(new TextDecoder('utf-8').decode(bytes));
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/** Rejects any ZIP entry path that could escape the destination
 * directory ("zip slip"): absolute paths, drive letters, and any path
 * segment equal to "..". Returns the resolved, verified-safe absolute
 * path to write to. */
function resolveSafeEntryPath(entryPath: string, destDir: string): string {
  if (path.isAbsolute(entryPath) || /^[A-Za-z]:/.test(entryPath) || entryPath.startsWith('\\\\')) {
    throw new MalformedInputError(`ZIP entry "${entryPath}" has an absolute path; refusing to extract it.`);
  }
  const segments = entryPath.split(/[/\\]/);
  if (segments.some((s) => s === '..')) {
    throw new MalformedInputError(`ZIP entry "${entryPath}" contains a ".." path segment (path traversal); refusing to extract it.`);
  }
  const resolved = path.resolve(destDir, entryPath);
  const destWithSep = destDir.endsWith(path.sep) ? destDir : destDir + path.sep;
  if (resolved !== destDir.replace(/[/\\]+$/, '') && !resolved.startsWith(destWithSep)) {
    throw new MalformedInputError(`ZIP entry "${entryPath}" resolves outside the destination directory; refusing to extract it.`);
  }
  return resolved;
}

function zipExtractEntry(): RegistryEntry {
  return {
    id: 'zip-extract',
    category: 'archives',
    sourceFormat: { id: 'zip', label: 'ZIP archive' },
    targetFormat: { id: 'directory-tree', label: 'Extracted files' },
    sourceSignatures: [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
    bundled: true,
    packagedArtifactProof: 'Hand-written ZIP reader (services/converter/zip/central-directory.ts) using Node builtin zlib for DEFLATE; no external archive library.',
    metadataBehavior:
      'Extracts every non-directory entry to the destination directory, preserving relative paths and creating parent directories as needed. Entry paths are validated against path traversal ("zip slip") before anything is written.',
    lossiness: 'lossy',
    lossDisclosure: [
      {
        aspect: 'File timestamps and permissions',
        detail: 'ZIP entry modification times and Unix/DOS file-attribute bits are not applied to the extracted files; extracted files get the destination filesystem\'s normal defaults.',
      },
      {
        aspect: 'Encrypted or unsupported entries',
        detail: 'An encrypted entry, or one using a compression method other than "stored" or "DEFLATE", stops the whole extraction rather than being skipped silently.',
      },
    ],
    limits: DEFAULT_ARCHIVE_LIMITS,
    sandboxBoundary:
      'Runs in-process in the Electron main process under a bounded resource budget (entry count, path depth, total decompressed bytes); writes only inside the caller-supplied destination directory, verified per entry; no subprocess, no network access.',
    userFacingName: 'Extract ZIP archive',
    kind: 'extract-to-directory',
    extractToDirectory: async (input, destDir, ctx) => {
      ctx.budget.consumeInput(input.byteLength);
      const entries: ZipEntryInfo[] = listZipEntries(input, ctx.budget);
      const written: ExtractedEntry[] = [];
      for (const entry of entries) {
        ctx.budget.check();
        const destPath = resolveSafeEntryPath(entry.path, destDir);
        if (entry.isDirectory) {
          await fsp.mkdir(destPath, { recursive: true });
          continue;
        }
        await fsp.mkdir(path.dirname(destPath), { recursive: true });
        const data = readZipEntryData(input, entry, ctx.budget);
        await atomicWriteFile(destPath, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
        written.push({ path: entry.path, bytes: data.byteLength });
      }
      return written;
    },
  };
}

function gzipCompressEntry(): RegistryEntry {
  return {
    id: 'raw-bytes-to-gzip',
    category: 'archives',
    sourceFormat: { id: 'raw-bytes', label: 'Any file (raw bytes)' },
    targetFormat: { id: 'gzip', label: 'GZIP compressed data' },
    sourceSignatures: [],
    bundled: true,
    packagedArtifactProof: 'Node.js builtin zlib module (gzipSync) — compiled into the Node/Electron runtime, works fully offline.',
    metadataBehavior: 'Compresses the whole source file as a single GZIP member.',
    lossiness: 'lossless',
    lossDisclosure: [],
    limits: DEFAULT_ARCHIVE_LIMITS,
    sandboxBoundary: 'Runs in-process in the Electron main process under a bounded resource budget; no subprocess, no network access.',
    userFacingName: 'Compress as GZIP',
    kind: 'byte-to-byte',
    convert: async (input, ctx) => {
      ctx.budget.consumeInput(input.byteLength);
      const output = gzipSync(input);
      ctx.budget.produceOutput(output.byteLength);
      return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
    },
    validateOutput: () => ({ ok: true }),
  };
}

function gzipDecompressEntry(): RegistryEntry {
  return {
    id: 'gzip-to-raw-bytes',
    category: 'archives',
    sourceFormat: { id: 'gzip', label: 'GZIP compressed data' },
    targetFormat: { id: 'raw-bytes', label: 'Raw bytes' },
    sourceSignatures: [{ offset: 0, bytes: [0x1f, 0x8b] }],
    bundled: true,
    packagedArtifactProof: 'Node.js builtin zlib module (gunzipSync) — compiled into the Node/Electron runtime, works fully offline.',
    metadataBehavior: 'Decompresses a single-member GZIP stream back to its original bytes.',
    lossiness: 'lossless',
    lossDisclosure: [],
    limits: DEFAULT_ARCHIVE_LIMITS,
    sandboxBoundary: 'Runs in-process in the Electron main process under a bounded resource budget (bounded output size guards against a decompression bomb); no subprocess, no network access.',
    userFacingName: 'Decompress GZIP',
    kind: 'byte-to-byte',
    convert: async (input, ctx) => {
      ctx.budget.consumeInput(input.byteLength);
      let output: Buffer;
      try {
        output = gunzipSync(input, { maxOutputLength: ctx.budget.limits.maxOutputBytes });
      } catch (err) {
        if (err instanceof Error && /maxOutputLength/i.test(err.message)) {
          throw new ResourceLimitExceededError('output-bytes', ctx.budget.limits.maxOutputBytes, 'The GZIP stream decompresses to more data than this converter will produce (possible decompression bomb).');
        }
        const reason = err instanceof Error ? err.message : String(err);
        throw new MalformedInputError(`Not a valid GZIP stream: ${reason}`);
      }
      ctx.budget.produceOutput(output.byteLength);
      return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
    },
    validateOutput: () => ({ ok: true }),
  };
}

export function buildArchiveEntries(): RegistryEntry[] {
  return [zipInspectEntry(), zipExtractEntry(), gzipCompressEntry(), gzipDecompressEntry()];
}
