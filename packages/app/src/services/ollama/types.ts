/**
 * Shared types for the local Ollama suite manager.
 *
 * Nothing in this module ever describes money. There is no price, no
 * purchase, no checkout, no account, no subscription anywhere in this
 * subsystem's types or copy: batch model pulls are the only "cart", and a
 * pull is a local download, never a transaction.
 */

// ---------------------------------------------------------------------------
// Connection / diagnosis
// ---------------------------------------------------------------------------

/**
 * The distinct states this subsystem can be in, in the order a user would
 * plausibly hit them. Every UI surface driven by this subsystem must be able
 * to render each one distinctly - never collapse several into one spinner.
 */
export type OllamaConnectionState =
  /** Never probed yet. */
  | 'unknown'
  /** No Ollama installation could be found on this machine at all (no
   * reachable local server, and no known install location contains it). */
  | 'ollama-missing'
  /** Ollama is installed but the local server is not currently running. */
  | 'service-stopped'
  /** The local server answered but responded with a malformed, oversized,
   * or otherwise untrustworthy payload, or timed out repeatedly. */
  | 'unhealthy'
  /** The local server is reachable and answered a health probe normally. */
  | 'healthy';

export interface OllamaDiagnosis {
  state: OllamaConnectionState;
  /** Human-readable, factual explanation of exactly why this state was
   * reached. Never a generic "something went wrong". */
  detail: string;
  /** ISO-8601 timestamp of when this diagnosis was produced. */
  checkedAt: string;
  /** Reported server version string, when the server answered at all. */
  serverVersion?: string;
  /** The exact base URL that was probed (always loopback - see
   * loopback-client.ts). Useful for support/troubleshooting surfaces. */
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// Installed / running models
// ---------------------------------------------------------------------------

export interface ModelDetails {
  format?: string;
  family?: string;
  families?: string[];
  parameterSize?: string;
  quantizationLevel?: string;
}

export interface InstalledModel {
  /** Full reference as Ollama reports it, e.g. "llama3.1:8b". */
  name: string;
  /** The tag portion of `name`, e.g. "8b". */
  tag: string;
  digest: string;
  sizeBytes: number;
  modifiedAt: string;
  details: ModelDetails;
}

export interface RunningModel extends InstalledModel {
  /** ISO-8601 timestamp after which Ollama will unload this model from
   * memory if it receives no further requests. */
  expiresAt: string;
  /** Bytes of VRAM currently attributed to this model, when Ollama reports
   * it. Absent (not zero) when the server did not report a figure. */
  vramBytes?: number;
}

/**
 * Capability metadata for one model, as reported by the server's own
 * "show" endpoint. Used to gate features (e.g. chat attachments) on real
 * reported capability rather than guessing from a model's name.
 */
export interface ModelCapabilities {
  name: string;
  capabilities: string[];
  contextLength?: number;
  parameterCount?: number;
  quantizationLevel?: string;
  families?: string[];
  /** True only when the server itself reported a capabilities list. False
   * (distinct from an empty array) if the server never returned a
   * capabilities field, so callers can distinguish "known to have none"
   * from "unknown". */
  reportedByServer: boolean;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export interface CatalogTag {
  tag: string;
  /** Reference as it would be pulled, e.g. "llama3.1:8b". */
  fullReference: string;
  sizeBytes?: number;
  digest?: string;
  parameterSize?: string;
  quantization?: string;
  contextLength?: number;
  updatedAt?: string;
}

export interface CatalogModel {
  /** Library model name, e.g. "llama3.1". */
  name: string;
  description?: string;
  /** Every published tag/variant for this model that the catalogue source
   * returned. Never truncated silently - see CatalogSnapshot.completeness. */
  tags: CatalogTag[];
}

export type CatalogCompleteness =
  /** Every known page was fetched and parsed without anomaly. */
  | 'complete'
  /** At least one page could not be fetched or parsed; the snapshot is a
   * real but partial view and must be labelled as such everywhere shown. */
  | 'partial'
  /** The source could not be reached at all; no snapshot was produced this
   * refresh (callers fall back to the last verified snapshot, if any). */
  | 'unavailable';

export interface CatalogSnapshot {
  models: CatalogModel[];
  /** Opaque identifier for exactly what was fetched (a hash of the
   * concatenated page bodies plus the source's own revision hint, if any).
   * Two snapshots with the same sourceRevision are the same data. */
  sourceRevision: string;
  fetchedAt: string;
  pageCount: number;
  completeness: CatalogCompleteness;
  /** Free-text notes about anything the fetch could not fully verify -
   * shown alongside the snapshot rather than hidden. */
  notes: string[];
}

/** A CatalogSnapshot combined with which of its tags are already installed
 * locally, without hiding either the catalogue or the local set. */
export interface MergedCatalogEntry {
  model: CatalogModel;
  tags: Array<{
    tag: CatalogTag;
    installed: boolean;
    installedDetails?: InstalledModel;
  }>;
}

export interface CatalogState {
  snapshot: CatalogSnapshot | null;
  /** True when `snapshot` is older than the configured freshness window. */
  stale: boolean;
  /** True when the last refresh attempt failed and `snapshot` (if any) is
   * therefore left over from an earlier successful refresh. */
  offline: boolean;
  lastRefreshError?: string;
}

// ---------------------------------------------------------------------------
// Hardware fit
// ---------------------------------------------------------------------------

export interface GpuInfo {
  name: string;
  driverVersion?: string;
  /** Estimated dedicated VRAM in bytes. Some Windows drivers cap the
   * reported figure regardless of actual installed VRAM, so this value
   * carries its own reliability flag rather than being trusted blindly. */
  vramBytesEstimate?: number;
  vramEstimateReliable: boolean;
}

export interface HardwareSnapshot {
  totalRamBytes: number;
  freeRamBytes: number;
  gpus: GpuInfo[];
  /** Free bytes on the filesystem that holds the Ollama models directory. */
  freeDiskBytes: number | null;
  detectedAt: string;
  /** Anything about detection that reduces confidence in the numbers above
   * (a query that failed, a suspicious/capped value, etc). Never silently
   * dropped - carried through to the fit evidence shown to the user. */
  warnings: string[];
}

export type FitVerdict = 'runs-well' | 'runs-with-limits' | 'unlikely' | 'unknown';

export interface FitEvidence {
  verdict: FitVerdict;
  /** The concrete facts that produced this verdict (e.g. "model needs an
   * estimated 6.5 GiB of memory; 5.2 GiB is available"). */
  reasons: string[];
  /** Anything assumed because real metadata was unavailable (e.g. "no
   * declared context window; assumed the model's default"). A verdict with
   * one or more assumptions is never reported as more confident than
   * 'unknown' would otherwise allow. */
  assumptions: string[];
  evaluatedAt: string;
}

// ---------------------------------------------------------------------------
// Batch pull ("cart" - download only, never a purchase)
// ---------------------------------------------------------------------------

export type PullItemState =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export interface PullBatchItem {
  id: string;
  reference: string;
  state: PullItemState;
  downloadedBytes: number;
  /** Total bytes for this pull, when Ollama has reported one. */
  totalBytes: number | null;
  /** Present once the batch's preflight estimate ran for this item. */
  estimatedSizeBytes: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
}

export interface PullBatchEstimate {
  items: Array<{
    reference: string;
    estimatedSizeBytes: number | null;
    alreadyInstalled: boolean;
  }>;
  aggregateEstimatedBytes: number;
  /** Conservative extra headroom beyond the raw download size (Ollama
   * stores blobs plus manifests plus working space during extraction). */
  conservativeAdditionalDiskBytes: number;
  currentFreeDiskBytes: number | null;
  /** True only when currentFreeDiskBytes is known and comfortably exceeds
   * the estimate; the 'unknown' case must never be reported as fitting. */
  fitsOnDisk: 'yes' | 'no' | 'unknown';
}

export interface PullBatchState {
  id: string;
  createdAt: string;
  updatedAt: string;
  parallelism: number;
  items: PullBatchItem[];
  cancelled: boolean;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /** Set once a streamed assistant message has finished; used to
   * distinguish a genuinely empty reply from one still streaming. */
  complete: boolean;
  /** Populated only when generation stopped abnormally (server error,
   * cancellation). Never silently dropped from history. */
  error?: string;
}

export interface ChatGenerationParams {
  temperature?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  numCtx?: number;
  seed?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  params: ChatGenerationParams;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  model: string;
  messageCount: number;
  updatedAt: string;
}
