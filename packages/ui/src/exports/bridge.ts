/**
 * Universal export — renderer-side bridge to the main process's export
 * engine (packages/app/src/services/exports), reached through
 * window.meadowmark.exports. Mirrors the shape of history/bridge.ts and
 * settings/store.ts's hostSettingsBridge(): typed loosely here (this
 * package never imports packages/app), resolved through `unknown` at the
 * boundary.
 */

export type ExportDatasetId = "settings" | "save";

export type ExportFormat = "json" | "jsonl" | "yaml" | "toml" | "xml" | "csv" | "tsv" | "markdown" | "html" | "sql";

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  "json",
  "jsonl",
  "yaml",
  "toml",
  "xml",
  "csv",
  "tsv",
  "markdown",
  "html",
  "sql",
];

export interface LossReportEntry {
  field?: string;
  kind: string;
  detail: string;
}

export interface LossReport {
  format: ExportFormat;
  lossless: boolean;
  entries: LossReportEntry[];
}

export interface ExportWriteResult {
  path: string;
  bytesWritten: number;
}

interface ExportsBridge {
  lossReport: (datasetId: ExportDatasetId, format: ExportFormat) => Promise<LossReport>;
  write: (datasetId: ExportDatasetId, format: ExportFormat) => Promise<ExportWriteResult | { canceled: true }>;
}

function hostExportsBridge(): ExportsBridge | null {
  const maybeWindow = window as unknown as { meadowmark?: { exports?: ExportsBridge } };
  return maybeWindow.meadowmark?.exports ?? null;
}

/** True whenever the app is running inside the Electron host with the
 * exports bridge exposed. The browser/static fallback build has no main
 * process to write files from, so the export panel shows an honest
 * "not available outside the app" state there instead. */
export function hasExportsBridge(): boolean {
  return hostExportsBridge() !== null;
}

export async function computeLossReport(datasetId: ExportDatasetId, format: ExportFormat): Promise<LossReport | null> {
  const bridge = hostExportsBridge();
  if (!bridge) return null;
  return bridge.lossReport(datasetId, format);
}

/** Opens the native save dialog (in the main process) and, unless the user
 * cancels, serializes and writes the dataset via the app's atomic-write
 * path. Returns null when the exports bridge is unavailable, or
 * `{ canceled: true }` when the user dismissed the dialog. */
export async function writeExport(
  datasetId: ExportDatasetId,
  format: ExportFormat,
): Promise<ExportWriteResult | { canceled: true } | null> {
  const bridge = hostExportsBridge();
  if (!bridge) return null;
  return bridge.write(datasetId, format);
}
