/* Meadowmark site — interface chrome copy.
 * Each string has five funny-level variants per language (1 = fully
 * serious, 5 = maximum playfulness). Facts (version numbers, states,
 * counts) are never varied by funny level — only the surrounding voice
 * is. Long-form docs prose lives directly in each article's HTML and is
 * kept in a single, readable voice per the documented scope note on the
 * Settings > Language page; this dictionary covers the chrome: nav,
 * buttons, notifications, palette, settings labels, and empty states. */
(function (global) {
  "use strict";

  const STR = {
    "nav.home": {
      en: ["Home", "Home", "Home base", "Home turf", "HOME (the good kind)"],
      yue: ["主頁", "主頁", "屋企（網站版）", "老巢", "首頁！（好嗰種）"],
    },
    "nav.docs": {
      en: ["Documentation", "Documentation", "The docs", "The big book of how", "The lore dump"],
      yue: ["文件", "說明文件", "文件庫", "大百科", "全部設定嘅八卦"],
    },
    "nav.changelog": {
      en: ["Changelog", "Changelog", "What changed", "The receipts", "The paper trail"],
      yue: ["更新日誌", "更新記錄", "改咗乜嘢", "證據簿", "紙仔記錄"],
    },
    "nav.settings": {
      en: ["Settings", "Settings", "Preferences", "Knobs & dials", "The fun buttons"],
      yue: ["設定", "設定", "偏好設定", "掣同掣", "得意小掣"],
    },
    "topbar.palette_hint": {
      en: ["Press Ctrl+Shift+F to search everything", "Press Ctrl+Shift+F to search everything", "Ctrl+Shift+F finds anything on this site", "Ctrl+Shift+F, and the whole site is yours", "Ctrl+Shift+F — it is basically a teleporter"],
      yue: ["撳 Ctrl+Shift+F 搜尋成個網站", "撳 Ctrl+Shift+F 搵晒成個網站", "Ctrl+Shift+F 乜都搵到", "Ctrl+Shift+F，成個網任你搵", "Ctrl+Shift+F —— 傳送門嚟㗎"],
    },
    "lang.label": {
      en: ["Language", "Language", "Language mode", "Which words today", "Word settings, basically"],
      yue: ["語言", "語言", "語言模式", "今日用邊種話", "文字設定，即係咁"],
    },
    "funny.label.en": {
      en: ["English funny level", "English funny level", "English playfulness", "How silly should English be", "English chaos dial"],
      yue: ["英文抵死程度", "英文抵死程度", "英文玩味", "英文應該有幾百厭", "英文混亂調節掣"],
    },
    "funny.label.yue": {
      en: ["Cantonese funny level", "Cantonese funny level", "Cantonese playfulness", "How silly should Cantonese be", "廣東話 chaos dial"],
      yue: ["廣東話抵死程度", "廣東話抵死程度", "廣東話玩味", "廣東話應該有幾百厭", "廣東話混亂調節掣"],
    },
    "theme.label": {
      en: ["Theme", "Theme", "Light or dark", "Pick your side", "Day mode? Night mode? Both?"],
      yue: ["主題", "主題", "光暗選擇", "揀邊隊", "日行定夜行？"],
    },
    "download.title": {
      en: ["Download", "Download", "Get the game", "Grab the installer", "Come and get it"],
      yue: ["下載", "下載", "攞遊戲", "攞安裝程式", "快啲攞喇"],
    },
    "download.not_yet": {
      en: [
        "No release has been published yet.",
        "No release has been published yet.",
        "There is nothing to download yet — the first release has not shipped.",
        "The download button is on a coffee break: no release exists yet.",
        "Patience! No release has shipped, so there is nothing here to grab.",
      ],
      yue: [
        "暫時未有發佈版本。",
        "暫時未有發佈版本。",
        "而家未有嘢好下載——第一個版本仲未出。",
        "下載掣去咗飲茶：暫時未有版本。",
        "忍手先！仲未有版本出，暫時攞唔到。",
      ],
    },
    "download.view_releases": {
      en: ["View releases on GitHub", "View releases on GitHub", "See the Releases page", "Go peek at the Releases page", "Stalk the Releases page"],
      yue: ["去 GitHub 睇發佈頁", "去 GitHub 睇發佈頁", "睇吓發佈頁", "去發佈頁行下", "去發佈頁打卡"],
    },
    "notif.center": {
      en: ["Notifications", "Notifications", "Notification centre", "The notice board", "The gossip corner"],
      yue: ["通知", "通知", "通知中心", "告示板", "八卦角"],
    },
    "notif.empty": {
      en: ["Nothing here yet.", "Nothing here yet.", "All quiet — no notifications.", "Empty. Nothing to see, sadly.", "Crickets. Nobody has said anything."],
      yue: ["暫時未有嘢。", "暫時未有嘢。", "靜英英，冇通知。", "空㗎，冇嘢好睇。", "靜到聽到蟋蟀叫。"],
    },
    "notif.dismiss": {
      en: ["Dismiss", "Dismiss", "Dismiss", "Wave it off", "Shoo it away"],
      yue: ["消除", "消除", "消除", "揮走佢", "趕走佢"],
    },
    "notif.select_all": {
      en: ["Select all on this page", "Select all on this page", "Select everything shown", "Grab the whole lot on screen", "All of them, right now, on screen"],
      yue: ["揀晒呢版", "揀晒呢版", "揀晒眼前嘅", "眼前全部一齊揀", "全部！眼前呢啲！"],
    },
    "notif.select_all_matches": {
      en: ["Select every match", "Select every match", "Select all matching items", "Grab absolutely everything that matches", "Every single match, no exceptions"],
      yue: ["揀晒所有相符", "揀晒所有相符", "揀晒相符項目", "相符嘅全部一齊揀", "相符嘅一個都唔留"],
    },
    "notif.bulk_dismiss": {
      en: ["Dismiss selected", "Dismiss selected", "Dismiss the selected items", "Clear out the selected ones", "Sweep away the selected pile"],
      yue: ["消除已揀項目", "消除已揀項目", "清除已揀項目", "清走已揀嗰堆", "掃走已揀嗰疊"],
    },
    "notif.bulk_export": {
      en: ["Export selected", "Export selected", "Export the selected items", "Take the selected ones with you", "Pack up the selected ones and go"],
      yue: ["匯出已揀項目", "匯出已揀項目", "匯出已揀項目", "帶埋已揀嘅走", "打包已揀嘅帶走"],
    },
    "palette.placeholder": {
      en: ["Search pages and settings…", "Search pages and settings…", "Type to find anything…", "What are you looking for?", "Ask and ye shall find…"],
      yue: ["搜尋頁面同設定…", "搜尋頁面同設定…", "打字搵嘢…", "你想搵乜？", "問啦，一定搵到…"],
    },
    "palette.empty": {
      en: ["No results.", "No results.", "Nothing matches that.", "Came up empty — try another word.", "Zero results. Even the palette is confused."],
      yue: ["冇結果。", "冇結果。", "冇相符結果。", "搵唔到，試第二個字啦。", "零結果，連個 palette 都懵咗。"],
    },
    "appearance.edit": {
      en: ["Edit appearance…", "Edit appearance…", "Customise this…", "Make this yours…", "Give this a makeover…"],
      yue: ["編輯外觀…", "編輯外觀…", "自訂呢個…", "整成你想要嘅樣…", "同佢執靚啲…"],
    },
    "appearance.reset": {
      en: ["Reset to default", "Reset to default", "Back to default", "Undo my tinkering", "Put it back the way it was"],
      yue: ["回復預設", "回復預設", "返去預設", "撤銷我啱啱嘅改動", "變番原本個樣"],
    },
    "settings.provenance_default": {
      en: ["Using the built-in default: ", "Using the built-in default: ", "Currently the shipped default: ", "Still on the factory setting: ", "Untouched — the out-of-the-box value: "],
      yue: ["用緊內建預設值：", "用緊內建預設值：", "而家係出廠設定：", "仲係原廠設定：", "未郁過——原裝值："],
    },
    "settings.provenance_set": {
      en: ["Set by you.", "Set by you.", "You set this value.", "This is your own doing.", "You did this — and it looks great."],
      yue: ["你自己設定嘅。", "你自己設定嘅。", "呢個值你自己揀嘅。", "呢個係你手筆。", "你搞嘅——幾靚仔喎。"],
    },
  };

  function get(id, lang, level) {
    const entry = STR[id];
    if (!entry) return id;
    const l = Math.min(5, Math.max(1, level || 1));
    if (lang === "yue") return entry.yue[l - 1];
    if (lang === "bi") return entry.en[l - 1] + " / " + entry.yue[l - 1];
    return entry.en[l - 1];
  }

  global.MMStrings = { STR, get };
})(window);
