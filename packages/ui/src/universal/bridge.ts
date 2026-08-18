/** Renderer-owned optional mirror of the public preload contract. */
export interface AppInfoView { name: string; version: string; platform: string; isDev: boolean }
export type UpdateStateView = { status: string } & Record<string, unknown>;
export interface OllamaDiagnosisView { state: string; detail: string; checkedAt: string; serverVersion?: string; baseUrl: string }
export interface RuntimeStatusView { checkedAt: string; secureVaultAvailable: boolean; updater: UpdateStateView; ollama: OllamaDiagnosisView; narrator: Record<string, unknown>; history: Record<string, unknown> }
export interface CatalogTagView { tag: string; fullReference: string; sizeBytes?: number; parameterSize?: string; quantization?: string }
export interface CatalogStateView {
  snapshot: null | { models: Array<{ name: string; description?: string; tags: CatalogTagView[] }>; sourceRevision: string; fetchedAt: string; pageCount: number; completeness: "complete" | "partial" | "unavailable"; notes: string[] };
  stale: boolean; offline: boolean; lastRefreshError?: string;
}
export interface LockSummaryView { id: string; target: { elementId: string; label: string }; method: "password" | "totp"; unlockDuration: { kind: string; minutes?: number }; lockedOnLaunch: boolean; isLockedOut: boolean }
export interface AuthEntryView { id: string; issuer: string; account: string; algorithm: string; digits: number; period: number }
export interface RevisionView { hash?: string; committedAt?: string; action?: string; label?: string; [key: string]: unknown }
export interface SelectedSourceFileView { handle: string; name: string; size: number }
export interface ConverterEntryView { id: string; category: string; sourceFormat: { id: string; label: string }; targetFormat: { id: string; label: string }; bundled: boolean; unavailableReason?: string; metadataBehavior: string; lossiness: "lossless" | "lossy"; lossDisclosure: Array<{ aspect: string; detail: string }>; userFacingName: string }
export interface DetectionCandidateView { formatId: string; label: string; category: string; confidence: string; hasEnabledAdapter: boolean }
export interface ScheduledRuleView { id: string; label: string; enabled: boolean; startDate?: string; endDate?: string; startTime?: string; endTime?: string; recurrence: { kind: "everyDay" } | { kind: "weekdays"; days: readonly number[] }; source: { type: string; values?: Record<string, unknown> } & Record<string, unknown> }

export interface UniversalHostBridge {
  appInfo?: () => Promise<AppInfoView>;
  settings?: { load?: () => Promise<unknown>; set?: (key: string, value: unknown) => Promise<unknown>; setMany?: (values: Record<string, unknown>) => Promise<unknown>; resetToDefault?: (key: string) => Promise<unknown>; resetAllToDefaults?: () => Promise<unknown> };
  schedules?: { list?: () => Promise<readonly ScheduledRuleView[]>; replace?: (rules: readonly ScheduledRuleView[]) => Promise<readonly ScheduledRuleView[]>; effective?: (atIso?: string) => Promise<unknown> };
  logo?: { listPresets?: () => Promise<ReadonlyArray<{ id: string; name: string }>>; current?: () => Promise<unknown>; applyPreset?: (presetId: string) => Promise<unknown>; applyCustom?: (sourceBytes: Uint8Array, edits: Record<string, unknown>) => Promise<unknown>; reset?: () => Promise<void> };
  converter?: { listCatalog?: () => Promise<readonly ConverterEntryView[]>; pickSource?: () => Promise<SelectedSourceFileView | null>; detect?: (sourceHandle: string) => Promise<readonly DetectionCandidateView[]>; convert?: (sourceHandle: string, entryId: string, suggestedFileName?: string) => Promise<{ cancelled: boolean; bytesWritten?: number; fileName?: string }> };
  exports?: { preview?: (source: unknown, format: string) => Promise<unknown>; lossReport?: (source: unknown, format: string) => Promise<unknown>; save?: (source: unknown, format: string) => Promise<{ cancelled: boolean; bytesWritten?: number; fileName?: string }> };
  ollama?: {
    diagnose?: () => Promise<OllamaDiagnosisView>;
    listInstalled?: () => Promise<Array<{ name: string; tag: string; sizeBytes: number; details: Record<string, unknown> }>>;
    listRunning?: () => Promise<Array<{ name: string }>>;
    refreshCatalog?: () => Promise<CatalogStateView>; catalogState?: () => Promise<CatalogStateView>;
    pulls?: { create?: (references: string[], parallelism?: number) => Promise<{ id: string }>; run?: (batchId: string) => Promise<unknown>; cancel?: (batchId: string) => Promise<void> };
    chat?: Record<string, unknown>;
  };
  narrator?: { loadSettings?: () => Promise<Record<string, unknown>>; updateSettings?: (settings: Record<string, unknown>) => Promise<void>; status?: () => Promise<Record<string, unknown>>; vocabulary?: { load?: (sourceBytes: Uint8Array) => Promise<{ ok: boolean; detail?: string }>; state?: () => Promise<{ kind: "no-file" } | { kind: "active"; entryCount: number } | { kind: "rejected"; detail: string }>; clear?: () => Promise<void> } };
  authenticator?: { listEntries?: () => Promise<AuthEntryView[]>; removeEntry?: (entryId: string) => Promise<void>; currentCode?: (entryId: string) => Promise<unknown>; beginRegistration?: (options?: Record<string, unknown>) => Promise<unknown> };
  locks?: { list?: () => Promise<LockSummaryView[]>; create?: (target: { elementId: string; label: string }, credential: unknown, duration: unknown) => Promise<LockSummaryView>; remove?: (lockId: string) => Promise<boolean> };
  history?: { revisions?: (recordPath?: string, limit?: number) => Promise<RevisionView[]>; exportRedacted?: (format?: "json" | "text") => Promise<string> };
  updater?: { state?: () => Promise<UpdateStateView>; check?: () => Promise<UpdateStateView>; cancel?: () => Promise<void>; dismiss?: () => Promise<void>; apply?: () => Promise<void>; onStateChanged?: (callback: (state: UpdateStateView) => void) => () => void };
  status?: { snapshot?: () => Promise<RuntimeStatusView>; onChanged?: (callback: (snapshot: RuntimeStatusView) => void) => () => void };
}

export function universalHostBridge(): UniversalHostBridge {
  const candidate = (window as unknown as { meadowmark?: unknown }).meadowmark;
  return typeof candidate === "object" && candidate !== null ? (candidate as UniversalHostBridge) : {};
}
export async function safeHostCall<T>(operation: (() => Promise<T>) | undefined, unavailable: string): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  if (typeof operation !== "function") return { ok: false, error: `Unavailable in this build: ${unavailable}.` };
  try { return { ok: true, value: await operation() }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}
export function capabilityReason(operation: unknown, seam: string): string | null { return typeof operation === "function" ? null : `Unavailable in this build: the preload bridge must provide ${seam}.`; }
