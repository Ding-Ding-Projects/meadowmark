import { registerCopy } from "./index";

registerCopy({
  "settings.tab.history": { en: { 1: "History" }, yue: { 1: "歷史紀錄" } },
  "history.loading": { en: { 1: "Checking local history..." }, yue: { 1: "檢查緊本機歷史紀錄..." } },
  "history.searchLabel": { en: { 1: "Search history" }, yue: { 1: "搵歷史紀錄" } },
  "history.exportAction": { en: { 1: "Copy changelog" }, yue: { 1: "複製更改紀錄" } },
  "history.unavailableReason": { en: { 1: "History is not available yet." }, yue: { 1: "歷史紀錄暫時未有得用。" } },
  "history.unavailable": {
    en: { 1: "Local history is unavailable: {reason}" },
    yue: { 1: "本機歷史紀錄用唔到：{reason}" },
  },
  "history.available": {
    en: { 1: "{count} recorded revisions." },
    yue: { 1: "已記錄 {count} 個版本。" },
  },
  "history.empty": {
    en: { 1: "No revisions recorded yet. Saving the farm or changing a setting creates the first one." },
    yue: { 1: "重未有紀錄。儲返個農場或者改個設定,就會有第一個版本。" },
  },
  "history.labelAction": { en: { 1: "Label" }, yue: { 1: "貼標籤" } },
  "history.restoreAction": { en: { 1: "Restore" }, yue: { 1: "還原" } },
  "history.labelDialogTitle": { en: { 1: "Label this revision" }, yue: { 1: "幫呢個版本貼標籤" } },
  "history.labelPromptLabel": { en: { 1: "Label" }, yue: { 1: "標籤" } },
  "history.restoreDialogTitle": { en: { 1: "Restore \"{path}\"?" }, yue: { 1: "還原「{path}」?" } },
  "history.restoreDialogBody": {
    en: {
      1: "This writes the content from \"{message}\" back over the current version, recorded as a new revision. The version you have now stays in history and can itself be restored.",
    },
    yue: {
      1: "呢個動作會將「{message}」嗰陣嘅內容寫返落去,當成一個新版本紀錄低。而家嘅版本仲會留喺歷史紀錄度,想返轉頭都得。",
    },
  },
});
