import { registerCopy } from "../i18n";

/**
 * Copy for the bottom navigation dock's own chrome (destination labels
 * still come from each panel's existing "panel.*.title" keys — this file
 * only covers the dock's scroll affordances, which did not exist before).
 */
registerCopy({
  "nav.scrollStart": {
    en: { 1: "Scroll navigation left", 3: "See what's further left" },
    yue: { 1: "導覽向左捲", 3: "睇下左邊仲有咩" },
  },
  "nav.scrollEnd": {
    en: { 1: "Scroll navigation right", 3: "See what's further right" },
    yue: { 1: "導覽向右捲", 3: "睇下右邊仲有咩" },
  },
});
