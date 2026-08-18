/* Meadowmark site — theme, density, accent colour and font customisation.
 * Persisted per-visitor in localStorage; applied live via CSS custom
 * properties on the document root. Named presets can be exported and
 * imported as JSON. */
(function (global) {
  "use strict";

  const KEY = "mm-appearance";
  const DEFAULTS = {
    theme: "system",       // "system" | "light" | "dark"
    density: "default",    // "compact" | "default" | "comfortable"
    accent: null,          // hex override for --mm-accent, or null = built-in
    fontFamily: null,      // override for --mm-font-family, or null = built-in
    fontScale: 1,          // 0.85 - 1.4
    tabDock: "left",       // "left" | "right" | "top" | "bottom"
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULTS, _source: "builtin" };
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed, _source: "stored" };
    } catch (e) {
      return { ...DEFAULTS, _source: "builtin" };
    }
  }

  let state = load();

  function save() {
    const { _source, ...toSave } = state;
    localStorage.setItem(KEY, JSON.stringify(toSave));
    state._source = "stored";
  }

  function apply() {
    const root = document.documentElement;
    if (state.theme === "light") root.setAttribute("data-theme", "light");
    else if (state.theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");

    root.setAttribute("data-density", state.density === "default" ? "" : state.density);
    root.style.setProperty("--mm-font-scale", String(state.fontScale));
    if (state.accent) root.style.setProperty("--mm-accent", state.accent);
    else root.style.removeProperty("--mm-accent");
    if (state.fontFamily) root.style.setProperty("--mm-font-family", state.fontFamily);
    else root.style.removeProperty("--mm-font-family");
    document.dispatchEvent(new CustomEvent("mm:appearance-changed", { detail: state }));
  }

  function set(patch) {
    state = { ...state, ...patch };
    save();
    apply();
  }

  function get() { return { ...state }; }

  function reset() {
    localStorage.removeItem(KEY);
    state = { ...DEFAULTS, _source: "builtin" };
    apply();
  }

  function exportJson() {
    const { _source, ...toSave } = state;
    return JSON.stringify(toSave, null, 2);
  }

  function importJson(json) {
    try {
      const parsed = JSON.parse(json);
      set(parsed);
      return true;
    } catch (e) {
      return false;
    }
  }

  apply();
  global.MMTheme = { get, set, reset, exportJson, importJson, DEFAULTS };
})(window);
