import { registerCopy } from "./index";

/**
 * Shared, cross-surface copy: generic actions, confirm/cancel, empty states.
 * Namespaced under "common.*" so no feature surface should reuse these keys
 * directly for feature-specific meaning — copy an entry into your own
 * namespace instead if you need feature-specific wording.
 */
registerCopy({
  "common.action.confirm": {
    en: { 1: "Confirm", 3: "Confirm", 5: "Let's gooo!" },
    yue: { 1: "確認", 3: "確認啦", 5: "撳落去啦！" },
  },
  "common.action.cancel": {
    en: { 1: "Cancel", 3: "Cancel", 5: "Never mind" },
    yue: { 1: "取消", 3: "算把啦", 5: "唔玩住" },
  },
  "common.action.close": {
    en: { 1: "Close", 3: "Close" },
    yue: { 1: "關閉", 3: "收埋佢" },
  },
  "common.action.save": {
    en: { 1: "Save", 3: "Save" },
    yue: { 1: "儲存", 3: "存返好" },
  },
  "common.action.reset": {
    en: { 1: "Reset", 3: "Reset to defaults" },
    yue: { 1: "重設", 3: "打回原形" },
  },
  "common.state.empty": {
    en: { 1: "Nothing here yet.", 3: "Nothing here yet — quiet, isn't it?" },
    yue: { 1: "呢度暫時冇嘢。", 3: "呢度冇嘢，靜英英咁。" },
  },
  "common.state.noMatches": {
    en: { 1: "No matches.", 3: "No matches found." },
    yue: { 1: "冇搵到。", 3: "乜都搵唔到。" },
  },
  "common.search.placeholder": {
    en: { 1: "Search", 3: "Search…" },
    yue: { 1: "搜尋", 3: "搵嘢…" },
  },
  "common.search.regexToggle": {
    en: { 1: "Regex", 3: "Use regex" },
    yue: { 1: "正規表達式", 3: "用 regex" },
  },
  "nav.regionLabel": {
    en: { 1: "Main navigation", 3: "Where do you want to go?" },
    yue: { 1: "主導航", 3: "想去邊度玩？" },
  },
  "common.action.closeNamed": {
    en: { 1: "Close {name}", 3: "Close {name}" },
    yue: { 1: "關閉{name}", 3: "收埋{name}" },
  },
  "common.action.dismiss": {
    en: { 1: "Dismiss", 3: "Dismiss" },
    yue: { 1: "不理它", 3: "把你抋走" },
  },
});
