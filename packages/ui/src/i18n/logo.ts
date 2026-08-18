import { registerCopy } from "./index";

registerCopy({
  "settings.tab.logo": { en: { 1: "Logo" }, yue: { 1: "標誌" } },
  "logo.explanation": {
    en: { 1: "Choose one of the shipped presets, or upload your own PNG. Applying a selection either fully replaces the active logo or leaves the previous one completely unchanged." },
    yue: { 1: "揀個現成嘅樣,或者上載自己嘅PNG。揀咗之後,標誌會完全換晒,或者完全冇變,唔會有中間嘅怪狀態。" },
  },
  "logo.loading": { en: { 1: "Loading..." }, yue: { 1: "載入緊..." } },
  "logo.applying": { en: { 1: "Applying..." }, yue: { 1: "應用緊..." } },
  "logo.applyFailed": { en: { 1: "Could not apply: {reason}" }, yue: { 1: "應用唔到:{reason}" } },
  "logo.resetting": { en: { 1: "Resetting to the shipped default..." }, yue: { 1: "還原緊去出廠設定..." } },
  "logo.currentPreviewAlt": { en: { 1: "The currently active app logo" }, yue: { 1: "而家用緊嘅app標誌" } },
  "logo.currentDefault": { en: { 1: "Using the shipped default logo." }, yue: { 1: "用緊出廠嘅標誌。" } },
  "logo.currentCustom": { en: { 1: "Using a custom uploaded logo." }, yue: { 1: "用緊自己上載嘅標誌。" } },
  "logo.currentPreset": { en: { 1: "Using the \"{presetId}\" preset." }, yue: { 1: "用緊「{presetId}」呢個樣。" } },
  "logo.resetAction": { en: { 1: "Reset to default" }, yue: { 1: "還原出廠設定" } },
  "logo.presetsHeading": { en: { 1: "Presets" }, yue: { 1: "現成嘅樣" } },
  "logo.customHeading": { en: { 1: "Custom upload" }, yue: { 1: "自訂上載" } },
  "logo.customExplanation": {
    en: { 1: "PNG only for now. The upload is decoded and converted locally -- nothing is ever sent anywhere." },
    yue: { 1: "而家淨係support PNG。上載嘅嘢會喺本機解碼同轉換,唔會send去邊度。" },
  },
  "logo.uploadAction": { en: { 1: "Upload a PNG..." }, yue: { 1: "上載PNG..." } },
  "logo.waitingForFile": { en: { 1: "Waiting for a file..." }, yue: { 1: "等緊揀檔案..." } },
  "logo.canceled": { en: { 1: "Upload canceled." }, yue: { 1: "上載取消咗。" } },
  "logo.unavailable": {
    en: { 1: "Logo customization is only available in the installed app." },
    yue: { 1: "標誌自訂淨係喺裝好嘅app入面先用得。" },
  },
});
