/* Meadowmark site — language mode and per-language funny-level sliders.
 * Persisted per-visitor. Applies to:
 *  - static dual-authored prose: <span/p/div class="i18n-en"> / "i18n-yue"
 *    pairs, toggled via [data-lang] on <html> (see css/base.css).
 *  - chrome copy driven by strings.js: elements with [data-str="id"],
 *    re-rendered on every language or funny-level change. */
(function (global) {
  "use strict";

  const KEY = "mm-lang-settings";
  const DEFAULTS = { lang: "en", funnyEn: 1, funnyYue: 1 };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch (e) {
      return { ...DEFAULTS };
    }
  }

  let state = load();

  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

  function renderStrings() {
    document.querySelectorAll("[data-str]").forEach((el) => {
      const id = el.getAttribute("data-str");
      const level = state.lang === "yue" ? state.funnyYue : state.funnyEn;
      el.textContent = window.MMStrings ? MMStrings.get(id, state.lang, level) : id;
    });
  }

  function apply() {
    document.documentElement.setAttribute("data-lang", state.lang);
    document.documentElement.setAttribute("lang", state.lang === "yue" ? "yue" : "en");
    renderStrings();
    document.dispatchEvent(new CustomEvent("mm:lang-changed", { detail: { ...state } }));
  }

  function set(patch) {
    state = { ...state, ...patch };
    save();
    apply();
  }

  function get() { return { ...state }; }

  apply();
  global.MMI18n = { get, set, DEFAULTS };
})(window);
