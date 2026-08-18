import { registerCopy } from "./index";

registerCopy({
  "settings.tab.exports": { en: { 1: "Export" }, yue: { 1: "匯出" } },
  "exports.explanation": {
    en: {
      1: "Every format that can faithfully represent the data is offered. A lossy format is still offered, but the loss report below always says exactly what it cannot carry before anything is written.",
    },
    yue: {
      1: "淨係可以完整保存資料嘅格式先會出現。就算會走漏嘢嘅格式都照樣有得揀,但下面嘅損失報告一定會講清楚寫落磁碟之前會走漏咗啲乜。",
    },
  },
  "exports.datasetLabel": { en: { 1: "What to export" }, yue: { 1: "揀樣嘢匯出" } },
  "exports.dataset.settings": { en: { 1: "Settings" }, yue: { 1: "設定" } },
  "exports.dataset.save": { en: { 1: "Farm save" }, yue: { 1: "農場存檔" } },
  "exports.formatLabel": { en: { 1: "Format" }, yue: { 1: "格式" } },
  "exports.format.json": { en: { 1: "JSON" }, yue: { 1: "JSON" } },
  "exports.format.jsonl": { en: { 1: "JSONL / NDJSON" }, yue: { 1: "JSONL / NDJSON" } },
  "exports.format.yaml": { en: { 1: "YAML" }, yue: { 1: "YAML" } },
  "exports.format.toml": { en: { 1: "TOML" }, yue: { 1: "TOML" } },
  "exports.format.xml": { en: { 1: "XML" }, yue: { 1: "XML" } },
  "exports.format.csv": { en: { 1: "CSV" }, yue: { 1: "CSV" } },
  "exports.format.tsv": { en: { 1: "TSV" }, yue: { 1: "TSV" } },
  "exports.format.markdown": { en: { 1: "Markdown" }, yue: { 1: "Markdown" } },
  "exports.format.html": { en: { 1: "HTML" }, yue: { 1: "HTML" } },
  "exports.format.sql": { en: { 1: "SQL" }, yue: { 1: "SQL" } },
  "exports.exportAction": { en: { 1: "Export..." }, yue: { 1: "匯出..." } },
  "exports.checking": { en: { 1: "Checking what this format can carry..." }, yue: { 1: "睇緊呢個格式承唔承載得起..." } },
  "exports.lossless": {
    en: { 1: "Nothing is lost in this format. Every field round-trips exactly." },
    yue: { 1: "呢個格式完全冇走漏,每個欄位都保存得原原本本。" },
  },
  "exports.lossyHeading": {
    en: { 1: "This format cannot carry {count} thing(s):" },
    yue: { 1: "呢個格式帶唔起 {count} 樣嘢:" },
  },
  "exports.writing": { en: { 1: "Waiting for a save location..." }, yue: { 1: "等緊揀個儲存位置..." } },
  "exports.canceled": { en: { 1: "Export canceled." }, yue: { 1: "匯出取消咗。" } },
  "exports.written": {
    en: { 1: "Exported {bytes} bytes to {path}." },
    yue: { 1: "已經匯出 {bytes} 個位元組去 {path}。" },
  },
  "exports.failed": {
    en: { 1: "Export failed: {reason}" },
    yue: { 1: "匯出失敗:{reason}" },
  },
  "exports.unavailable": {
    en: { 1: "Export is only available in the installed app." },
    yue: { 1: "匯出功能淨係喺裝好嘅app入面先用得。" },
  },
});
