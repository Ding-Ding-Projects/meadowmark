/**
 * The export engine: every application-owned record, list, or document must
 * be exportable, in every format that can faithfully represent it. This
 * module is the single entry point the rest of the app should use.
 *
 * Usage contract, matching the "never silently drop a field" rule:
 *   1. Call `computeLossReport(source, format)` (or `serializeExport`, which
 *      includes the loss report) and show it to the user BEFORE writing.
 *   2. Only after the user accepts, call `writeExportFile` to persist the
 *      export via the app's atomic-write path.
 *
 * Credential/secret fields (declared via `ExportField.sensitive`, plus a
 * conservative key-name heuristic as defense in depth) are stripped before
 * any format sees the data, and the exclusion is always recorded in the loss
 * report - never silently dropped.
 */
import path from 'node:path';
import { atomicWriteFile } from '../../atomic-write.js';
import { stripSensitiveData } from './secrets.js';
import { serializeJson } from './serializers/json.js';
import { serializeJsonl } from './serializers/jsonl.js';
import { serializeYaml } from './serializers/yaml.js';
import { serializeToml } from './serializers/toml.js';
import { serializeXml } from './serializers/xml.js';
import { serializeCsv, serializeTsv } from './serializers/delimited.js';
import { serializeMarkdown } from './serializers/markdown.js';
import { serializeHtml } from './serializers/html.js';
import { serializeSql } from './serializers/sql.js';
import { createZipArchive, normalizeArchivePath, crc32 } from './zip.js';
import { create7zArchive, DEFAULT_SEVEN_ZIP_OPTIONS } from './sevenzip.js';

export * from './types.js';
export { stripSensitiveData } from './secrets.js';
export { createZipArchive, normalizeArchivePath, crc32, create7zArchive, DEFAULT_SEVEN_ZIP_OPTIONS };

import type {
  ArchiveEntryInput,
  ExportFormat,
  ExportSource,
  ExportWriteResult,
  LossReport,
  LossReportEntry,
  SerializedExport,
} from './types.js';

const CRLF_FORMATS: ReadonlySet<ExportFormat> = new Set(['csv', 'tsv']);

const FORMAT_REIMPORTABLE: Record<ExportFormat, boolean> = {
  json: true,
  jsonl: true,
  yaml: true,
  toml: true,
  xml: true,
  csv: true,
  tsv: true,
  markdown: false,
  html: false,
  sql: true,
};

function runSerializer(source: ExportSource, format: ExportFormat): { contents: string; lossEntries: LossReportEntry[] } {
  switch (format) {
    case 'json':
      return serializeJson(source);
    case 'jsonl':
      return serializeJsonl(source);
    case 'yaml':
      return serializeYaml(source);
    case 'toml':
      return serializeToml(source);
    case 'xml':
      return serializeXml(source);
    case 'csv':
      return serializeCsv(source);
    case 'tsv':
      return serializeTsv(source);
    case 'markdown':
      return serializeMarkdown(source);
    case 'html':
      return serializeHtml(source);
    case 'sql':
      return serializeSql(source);
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported export format: ${String(exhaustive)}`);
    }
  }
}

/**
 * Serializes `source` into `format`, after excluding every sensitive field.
 * Returns the file contents alongside a complete, honest loss report. This
 * never writes anything to disk - see `writeExportFile` for that.
 */
export function serializeExport(source: ExportSource, format: ExportFormat): SerializedExport {
  const { source: cleaned, lossEntries: secretLoss } = stripSensitiveData(source);
  const { contents, lossEntries: formatLoss } = runSerializer(cleaned, format);
  const entries = [...secretLoss, ...formatLoss];
  const lossReport: LossReport = {
    format,
    lossless: entries.length === 0,
    entries,
  };
  return {
    format,
    encoding: 'utf-8',
    lineEnding: CRLF_FORMATS.has(format) ? '\r\n' : '\n',
    schemaVersion: source.schemaVersion,
    reimportable: FORMAT_REIMPORTABLE[format],
    contents,
    lossReport,
  };
}

/**
 * Computes only the loss report for `source` in `format`, without building
 * (or discarding) the serialized text. Cheaper than `serializeExport` when a
 * caller only needs to show the user what would be lost before they commit
 * to a format.
 */
export function computeLossReport(source: ExportSource, format: ExportFormat): LossReport {
  return serializeExport(source, format).lossReport;
}

/**
 * Serializes `source` into `format` and writes it to `destPath` using the
 * app's atomic-write path (unique temp file, retry-on-rename for Windows
 * sharing violations). Always returns the loss report that was computed, so
 * a caller that skipped the "show the user first" step at least has the
 * record of what was lost.
 */
export async function writeExportFile(
  source: ExportSource,
  format: ExportFormat,
  destPath: string,
): Promise<ExportWriteResult> {
  const serialized = serializeExport(source, format);
  await atomicWriteFile(destPath, serialized.contents);
  return {
    path: destPath,
    bytesWritten: Buffer.byteLength(serialized.contents, 'utf-8'),
    serialized,
  };
}

/**
 * Writes a real ZIP archive (built by `createZipArchive`, hand-written, no
 * dependency) to `destPath` via the app's atomic-write path.
 */
export async function writeZipArchive(
  entries: ArchiveEntryInput[],
  destPath: string,
): Promise<{ path: string; bytesWritten: number }> {
  const archive = createZipArchive(entries);
  await atomicWriteFile(destPath, archive);
  return { path: destPath, bytesWritten: archive.length };
}

/** Suggests a file extension for a given export format, for building a default file name. */
export function extensionForFormat(format: ExportFormat): string {
  switch (format) {
    case 'json':
      return 'json';
    case 'jsonl':
      return 'jsonl';
    case 'yaml':
      return 'yaml';
    case 'toml':
      return 'toml';
    case 'xml':
      return 'xml';
    case 'csv':
      return 'csv';
    case 'tsv':
      return 'tsv';
    case 'markdown':
      return 'md';
    case 'html':
      return 'html';
    case 'sql':
      return 'sql';
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported export format: ${String(exhaustive)}`);
    }
  }
}

/** Joins a directory and a dataset name into a suggested export file path for the given format. */
export function suggestExportFileName(source: ExportSource, format: ExportFormat): string {
  const safeName = source.name.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
  return `${safeName}.${extensionForFormat(format)}`;
}

export function joinExportPath(directory: string, source: ExportSource, format: ExportFormat): string {
  return path.join(directory, suggestExportFileName(source, format));
}
