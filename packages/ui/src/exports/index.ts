/**
 * Universal export panel: every application-owned record the export engine
 * knows about (packages/app/src/services/exports), offered in every format
 * it can serialize. Follows the "never silently drop a field" usage
 * contract: choosing a format always computes and shows the loss report
 * before the native save dialog opens, so the user accepts what a lossy
 * format will drop before anything is written.
 *
 * Mounted as its own "Export" tab inside the settings surface (see
 * ../settings/index.ts), following the same wiring pattern the History tab
 * already uses: a bridge module talks to window.meadowmark, this module
 * only renders what the bridge reports.
 */

import { h } from "../dom";
import { button } from "../components/button";
import { select } from "../components/select";
import { t } from "../i18n";
import {
  computeLossReport,
  EXPORT_FORMATS,
  ExportDatasetId,
  ExportFormat,
  hasExportsBridge,
  LossReport,
  writeExport,
} from "./bridge";

const DATASETS: { id: ExportDatasetId; labelKey: string }[] = [
  { id: "settings", labelKey: "exports.dataset.settings" },
  { id: "save", labelKey: "exports.dataset.save" },
];

function formatLabel(format: ExportFormat): string {
  return t(`exports.format.${format}`);
}

export function renderExportsPanel(): HTMLElement {
  if (!hasExportsBridge()) {
    return h(
      "div.mm-exports",
      { style: { display: "flex", flexDirection: "column", gap: "12px" } },
      h("p", { role: "status" }, t("exports.unavailable"))
    );
  }

  let datasetId: ExportDatasetId = "settings";
  let format: ExportFormat = "json";

  const lossReportEl = h("div.mm-exports__loss-report", { role: "status", "aria-live": "polite" });
  const statusEl = h("p.mm-exports__status", { role: "status" });

  function renderLossReport(report: LossReport | null): void {
    lossReportEl.textContent = "";
    if (!report) return;
    if (report.lossless) {
      lossReportEl.appendChild(h("p", {}, t("exports.lossless")));
      return;
    }
    lossReportEl.appendChild(h("p", {}, t("exports.lossyHeading", { count: report.entries.length })));
    const listEl = h("ul", {});
    for (const entry of report.entries) {
      listEl.appendChild(h("li", {}, entry.detail));
    }
    lossReportEl.appendChild(listEl);
  }

  async function refreshLossReport(): Promise<void> {
    lossReportEl.textContent = t("exports.checking");
    const report = await computeLossReport(datasetId, format);
    renderLossReport(report);
  }

  const datasetSelect = select({
    labelText: t("exports.datasetLabel"),
    options: DATASETS.map((d) => ({ value: d.id, label: t(d.labelKey) })),
    value: datasetId,
    onChange: (v) => {
      datasetId = v as ExportDatasetId;
      void refreshLossReport();
    },
  });

  const formatSelect = select({
    labelText: t("exports.formatLabel"),
    options: EXPORT_FORMATS.map((f) => ({ value: f, label: formatLabel(f) })),
    value: format,
    onChange: (v) => {
      format = v as ExportFormat;
      void refreshLossReport();
    },
  });

  const exportButton = button({
    label: t("exports.exportAction"),
    variant: "filled",
    onClick: () => void runExport(),
  });

  async function runExport(): Promise<void> {
    exportButton.disabled = true;
    statusEl.textContent = t("exports.writing");
    try {
      const result = await writeExport(datasetId, format);
      if (!result) {
        statusEl.textContent = t("exports.unavailable");
      } else if ("canceled" in result) {
        statusEl.textContent = t("exports.canceled");
      } else {
        statusEl.textContent = t("exports.written", { path: result.path, bytes: result.bytesWritten });
      }
    } catch (err) {
      statusEl.textContent = t("exports.failed", { reason: err instanceof Error ? err.message : String(err) });
    } finally {
      exportButton.disabled = false;
    }
  }

  void refreshLossReport();

  return h(
    "div.mm-exports",
    { style: { display: "flex", flexDirection: "column", gap: "16px" } },
    h("p", {}, t("exports.explanation")),
    datasetSelect,
    formatSelect,
    lossReportEl,
    h("div", { style: { display: "flex", gap: "12px", alignItems: "center" } }, exportButton, statusEl)
  );
}
