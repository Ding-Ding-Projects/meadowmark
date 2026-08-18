/**
 * Shared types for the Meadowmark export engine.
 *
 * The export engine turns application-owned data into files in a variety of
 * formats. The one rule that governs every serializer in this directory:
 * NEVER silently drop information. Before a caller writes an export to disk,
 * it must compute (and show the user) a LossReport describing exactly what
 * the chosen format cannot carry - a flattened nested structure, an omitted
 * field, reduced numeric precision, or an excluded credential. A format that
 * would lose data is still offered, but only with the loss stated up front.
 */

/** A JSON-representable value. Matches what every serializer here can accept. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

/** A single row of tabular data: a flat-ish map of column name to value. */
export type ExportRow = Record<string, JsonValue | undefined>;

/**
 * Metadata about one field/column that export serializers must respect.
 * `sensitive` fields (credentials, TOTP secrets, passwords, tokens) are
 * excluded from every ordinary export, and the exclusion is always recorded
 * in the loss report - never silently skipped.
 */
export interface ExportField {
  key: string;
  /** Human-readable label, used by Markdown/HTML table headers when present. */
  label?: string;
  /** Marks this field as a credential/secret. Always excluded from exports. */
  sensitive?: boolean;
}

/** One named block of prose for Markdown/HTML exports. */
export interface ExportSection {
  heading: string;
  /** Plain text or simple Markdown-flavored body. Rendered as-is in Markdown; escaped in HTML. */
  body: string;
}

/**
 * The generic input to every serializer. A caller populates whichever parts
 * are relevant to the data being exported:
 *  - `value` for arbitrary structured/nested data (JSON, YAML, TOML, XML)
 *  - `rows` for tabular data (CSV, TSV, SQL, JSONL); if omitted, tabular
 *    serializers attempt to derive rows from `value` and report loss when
 *    they cannot do so losslessly.
 *  - `title`/`sections` for prose-oriented formats (Markdown, HTML)
 */
export interface ExportSource {
  /** Logical name of the dataset: used as a SQL table name, XML root tag, file title, etc. */
  name: string;
  /** Schema/version identifier written into export metadata so the file is self-describing. */
  schemaVersion: string;
  /** Arbitrary structured data. Used by JSON/YAML/TOML/XML and as a fallback source of rows. */
  value?: JsonValue;
  /** Flat tabular rows. Preferred source for CSV/TSV/SQL/JSONL. */
  rows?: ExportRow[];
  /** Field-level metadata (sensitivity, labels) applied to both `rows` and object keys in `value`. */
  fields?: ExportField[];
  /** Human title, used by Markdown/HTML. */
  title?: string;
  /** Prose sections, used by Markdown/HTML. */
  sections?: ExportSection[];
}

export type ExportFormat =
  | 'json'
  | 'jsonl'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'csv'
  | 'tsv'
  | 'markdown'
  | 'html'
  | 'sql';

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  'json',
  'jsonl',
  'yaml',
  'toml',
  'xml',
  'csv',
  'tsv',
  'markdown',
  'html',
  'sql',
] as const;

/** The specific kind of information a format could not faithfully carry. */
export type LossReportEntryKind =
  | 'nested-flattened'
  | 'field-omitted'
  | 'sensitive-field-excluded'
  | 'precision-reduced'
  | 'comment-lost'
  | 'type-coerced-to-string'
  | 'null-omitted'
  | 'ordering-not-preserved'
  | 'key-name-sanitized'
  | 'binary-not-representable'
  | 'mixed-type-array-stringified'
  | 'structure-not-representable';

export interface LossReportEntry {
  /** The specific field/column/key affected, when applicable. */
  field?: string;
  kind: LossReportEntryKind;
  /** Human-readable explanation shown to the user before the export is written. */
  detail: string;
}

export interface LossReport {
  format: ExportFormat;
  /** True only when every entry, field, and value round-trips exactly. */
  lossless: boolean;
  entries: LossReportEntry[];
}

/** The result of serializing an ExportSource into one format's text representation. */
export interface SerializedExport {
  format: ExportFormat;
  encoding: 'utf-8';
  lineEnding: '\n' | '\r\n';
  schemaVersion: string;
  /** Whether this format can, in general, be re-imported to reconstruct the source shape. */
  reimportable: boolean;
  contents: string;
  lossReport: LossReport;
}

export interface ExportWriteResult {
  path: string;
  bytesWritten: number;
  serialized: SerializedExport;
}

/** One entry to be written into a ZIP archive. */
export interface ArchiveEntryInput {
  /** Path relative to the archive root. Must not be absolute or contain '..' segments. */
  path: string;
  data: Buffer;
  /** Compression method for this entry. Defaults to 'deflate'. */
  method?: 'store' | 'deflate';
  /** Last-modified time. Defaults to now. */
  mtime?: Date;
}

/** The 7z compression method a caller may request. Declared for the full option surface; see sevenzip.ts. */
export type SevenZipMethod = 'lzma2' | 'lzma' | 'ppmd' | 'bzip2' | 'deflate' | 'store';

/** The 7z compression level a caller may request, from no compression to maximum effort. */
export type SevenZipLevel = 'store' | 'fastest' | 'fast' | 'normal' | 'maximum' | 'ultra';

export interface SevenZipOptions {
  method: SevenZipMethod;
  level: SevenZipLevel;
  /** Dictionary size in bytes (LZMA2/LZMA). */
  dictionarySizeBytes?: number;
  /** Word size in bytes (LZMA2/LZMA/PPMd). */
  wordSizeBytes?: number;
  /** Solid block size in bytes, or 'unlimited' for a single solid block covering the whole archive. */
  solidBlockSizeBytes?: number | 'unlimited';
  /** Whether entries are combined into shared solid blocks rather than compressed independently. */
  solid: boolean;
  /** Whether compression may use multiple threads. */
  multithreaded: boolean;
  /** Split the archive into volumes of this many bytes each. Omit for a single volume. */
  splitVolumeBytes?: number;
  /** AES-256 content encryption. */
  encryption?: {
    algorithm: 'aes-256';
    /** When true, file names/metadata are encrypted too, not only file contents. */
    encryptHeaders: boolean;
  };
}

/** 7z archives always report unavailable: no bundled LZMA/PPMd backend ships with this app. */
export interface SevenZipUnavailableResult {
  available: false;
  reason: string;
  requestedOptions: SevenZipOptions;
}
