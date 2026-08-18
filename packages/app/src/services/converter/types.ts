/**
 * Shared type surface for the universal file converter.
 *
 * The design is deliberately data-first: every adapter is a plain
 * `RegistryEntry` object describing what it is, whether it is actually
 * usable in THIS build (`bundled`), and — only when `bundled` is true — a
 * `convert` function. A disabled entry has no `convert` at all, so it is
 * structurally impossible to invoke a conversion whose dependency is
 * missing; the registry can only ever run what it truthfully offers.
 */

/** The eight fixed top-level categories the converter catalog is
 * organised into. Every registry entry belongs to exactly one. */
export type ConverterCategory =
  | 'documents-pdf'
  | 'images'
  | 'audio'
  | 'video'
  | 'archives'
  | 'structured-data'
  | 'code-text'
  | 'binary-encodings';

export const CONVERTER_CATEGORIES: readonly ConverterCategory[] = [
  'documents-pdf',
  'images',
  'audio',
  'video',
  'archives',
  'structured-data',
  'code-text',
  'binary-encodings',
];

export interface FormatId {
  /** Stable machine id, e.g. 'json', 'yaml', 'zip', 'utf-8-text'. Never
   * changes across releases; used as a wire/storage key. */
  id: string;
  /** Localizable, user-facing label, e.g. "JSON", "YAML", "ZIP archive". */
  label: string;
}

/** A single byte-level magic-number match rule used for bounded source
 * detection. `offset` may be negative to mean "measured from end of
 * file" (used by a few trailer-anchored formats like ZIP's EOCD). */
export interface ByteSignature {
  offset: number;
  bytes: readonly number[];
}

/** One candidate produced by sniffing a file's bytes. `confidence` is a
 * rough ranking signal only — it never determines whether a conversion is
 * offered; the registry decides that from `formatId` alone. */
export interface DetectionCandidate {
  formatId: string;
  label: string;
  category: ConverterCategory;
  confidence: 'signature' | 'heuristic';
  /** True when at least one enabled adapter can read this format. False
   * means the format was recognised but every adapter for it is
   * currently disabled (missing bundled dependency). */
  hasEnabledAdapter: boolean;
}

/** Hard bounds every conversion is required to respect. These exist to
 * stop a single conversion from consuming unbounded memory, CPU, or disk,
 * regardless of what the source file claims about itself (a compressed
 * bomb, a JSON file with a million-deep nesting, an XML entity expansion,
 * etc.). */
export interface ResourceLimits {
  /** Maximum bytes of source input this adapter will read. */
  maxInputBytes: number;
  /** Maximum bytes of output this adapter will write. */
  maxOutputBytes: number;
  /** Maximum nesting depth for tree-shaped formats (JSON/YAML/TOML/XML)
   * or maximum archive-entry path depth for archives. */
  maxDepth: number;
  /** Maximum number of discrete items: object keys + array elements for
   * structured data, or entries for an archive. */
  maxItems: number;
  /** Maximum wall-clock time budget in milliseconds. Checked
   * periodically during the conversion, not just at the start. */
  maxCpuMs: number;
}

export interface LossDisclosureItem {
  /** Short label for the thing that can change, e.g. "Comments",
   * "Key order", "Number formatting", "Timezone offsets". */
  aspect: string;
  /** One sentence, plain-language explanation of what happens to it. */
  detail: string;
}

export interface AdapterOutputValidation {
  ok: boolean;
  reason?: string;
}

/** Runtime context threaded through every `convert` call: cancellation
 * and the live resource budget. Adapters must check `budget` themselves
 * at every loop iteration that could be unbounded (object keys, array
 * elements, archive entries, output bytes written). */
export interface ConversionContext {
  signal: AbortSignal;
  budget: ResourceBudget;
}

/** Live, mutable tracker for one conversion's resource usage. See
 * resource-budget.ts for the implementation; adapters only see this
 * narrow interface. */
export interface ResourceBudget {
  readonly limits: ResourceLimits;
  /** Throws ResourceLimitExceededError or CancelledError if any bound is
   * already exceeded or the signal is aborted. Call this frequently. */
  check(): void;
  /** Records that `n` more source bytes have been consumed and checks
   * the input-bytes bound. */
  consumeInput(n: number): void;
  /** Records that `n` more output bytes have been produced and checks
   * the output-bytes bound. */
  produceOutput(n: number): void;
  /** Records entering one more nesting level; checks the depth bound;
   * returns a function that must be called on the way back out. */
  enterDepth(): () => void;
  /** Records one more discrete item (object key, array element, archive
   * entry) and checks the items bound. */
  countItem(): void;
}

export type ConvertFn = (input: Uint8Array, ctx: ConversionContext) => Promise<Uint8Array>;

/** One file actually written by an extract-to-directory adapter (e.g.
 * ZIP extraction), reported back for progress/audit purposes. `path` is
 * relative to the destination directory the caller supplied. */
export interface ExtractedEntry {
  path: string;
  bytes: number;
}

/** An adapter that cannot be expressed as one buffer in, one buffer out
 * — specifically, extracting an archive's many entries onto disk. The
 * destination directory must already exist and be writable; the adapter
 * itself never creates or overwrites the top-level destination, only the
 * files inside it (each still subject to the same atomic-write and
 * confirm-overwrite rules as any other converter output — see output.ts). */
export type ExtractFn = (input: Uint8Array, destDir: string, ctx: ConversionContext) => Promise<ExtractedEntry[]>;

export interface RegistryEntry {
  /** Stable id, e.g. "json-to-yaml", "zip-extract", "utf8-to-utf16le". */
  id: string;
  category: ConverterCategory;
  sourceFormat: FormatId;
  targetFormat: FormatId;
  /** How the source format is recognised. Text-shaped formats (JSON,
   * YAML, TOML, XML, CSV/TSV) have no reliable magic number and are
   * identified structurally instead — see text-sniff.ts. */
  sourceSignatures: readonly ByteSignature[] | 'structural-text';
  /** True only when every dependency this adapter needs is bundled
   * inside the installed application and works fully offline. This is
   * the single fact that decides whether `convert` may be called. */
  bundled: boolean;
  /** What proves `bundled`. For a truthfully-enabled adapter this names
   * the exact bundled module ("Node.js builtin zlib", "hand-written
   * parser in structured/json.ts"). For a disabled adapter this names
   * the exact thing that is missing. */
  packagedArtifactProof: string;
  /** Required when bundled is false: the exact missing dependency, shown
   * to the user instead of a bare "unsupported". */
  unavailableReason?: string;
  /** Plain-language description of what happens to metadata / encoding
   * during this conversion (e.g. "Preserves all object keys and nesting;
   * does not preserve comments, key order is preserved"). */
  metadataBehavior: string;
  lossiness: 'lossless' | 'lossy';
  /** Must be non-empty when lossiness is 'lossy'. Shown to the user
   * before they confirm a lossy conversion. */
  lossDisclosure: readonly LossDisclosureItem[];
  limits: ResourceLimits;
  /** Plain description of the isolation this adapter runs under. Every
   * adapter in this module runs in-process (no subprocess, no network),
   * so this documents the resource-budget/exception boundary rather than
   * a separate OS process — see resource-budget.ts. */
  sandboxBoundary: string;
  userFacingName: string;
  /** Discriminates which of `convert` / `extractToDirectory` this entry
   * uses. Every adapter is exactly one or the other, never both. */
  kind: 'byte-to-byte' | 'extract-to-directory';
  /** Present only when bundled === true and kind === 'byte-to-byte'. */
  convert?: ConvertFn;
  /** Present only when bundled === true and kind === 'extract-to-directory'. */
  extractToDirectory?: ExtractFn;
  /** Validates produced output before it is offered to the caller. Only
   * meaningful for kind === 'byte-to-byte'; present only when bundled === true. */
  validateOutput?: (bytes: Uint8Array) => AdapterOutputValidation;
}

export const DEFAULT_STRUCTURED_LIMITS: ResourceLimits = {
  maxInputBytes: 64 * 1024 * 1024, // 64 MiB
  maxOutputBytes: 128 * 1024 * 1024, // 128 MiB (some conversions expand, e.g. compact JSON -> pretty YAML)
  maxDepth: 128,
  maxItems: 2_000_000,
  maxCpuMs: 20_000,
};

export const DEFAULT_TEXT_LIMITS: ResourceLimits = {
  maxInputBytes: 128 * 1024 * 1024,
  maxOutputBytes: 256 * 1024 * 1024,
  maxDepth: 1,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxCpuMs: 15_000,
};

export const DEFAULT_BINARY_LIMITS: ResourceLimits = {
  maxInputBytes: 256 * 1024 * 1024,
  maxOutputBytes: 512 * 1024 * 1024, // base64/base32 expand input
  maxDepth: 1,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxCpuMs: 15_000,
};

export const DEFAULT_ARCHIVE_LIMITS: ResourceLimits = {
  maxInputBytes: 1024 * 1024 * 1024, // 1 GiB archive
  maxOutputBytes: 4 * 1024 * 1024 * 1024, // 4 GiB extracted total (zip-bomb ceiling)
  maxDepth: 32, // archive entry path nesting
  maxItems: 200_000, // archive entry count
  maxCpuMs: 120_000,
};
