/* Meadowmark static-site capabilities.
 *
 * Every operation in this module is deliberately browser-local. The static
 * site never claims an operating-system vault, background service, process
 * launch, server inbox, durable unlimited queue, or installed-app authority.
 */
(function (global) {
  "use strict";

  const KEYS = {
    name: "mm-display-name",
    vocabulary: "mm-personal-vocabulary-v1",
    schedules: "mm-schedules-v1",
    logo: "mm-logo-v1",
    lock: "mm-toy-lock-v1",
    tickets: "mm-support-tickets-v1",
    history: "mm-local-history-v1",
  };
  const MAX_HISTORY = 250;
  const MAX_VOCAB_BYTES = 128 * 1024;
  const MAX_VOCAB_ENTRIES = 256;
  const MAX_LOGO_BYTES = 2 * 1024 * 1024;
  const MAX_LOGO_PIXELS = 2048 * 2048;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch (_) { return fallback; }
  }

  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function notify(message, kind) {
    if (global.MMNotifications) MMNotifications.toast(message, { kind: kind || "info" });
  }

  function record(action, summary, details) {
    const history = read(KEYS.history, []);
    history.push({
      id: "h-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      at: new Date().toISOString(), action, summary,
      details: details || null, archived: false,
    });
    write(KEYS.history, history.slice(-MAX_HISTORY));
    document.dispatchEvent(new CustomEvent("mm:cap-history-changed"));
  }

  function wireSectionTabs() {
    const tabs = Array.from(document.querySelectorAll(".mm-cap-tabs [role=tab]"));
    const panels = Array.from(document.querySelectorAll(".mm-cap-panel[role=tabpanel]"));
    function select(tab, focus) {
      tabs.forEach((item) => { item.setAttribute("aria-selected", String(item === tab)); item.tabIndex = item === tab ? 0 : -1; });
      panels.forEach((panel) => { panel.hidden = panel.id !== tab.getAttribute("aria-controls"); });
      history.replaceState(null, "", "#" + tab.getAttribute("aria-controls"));
      if (focus) tab.focus();
    }
    tabs.forEach((tab, index) => {
      tab.tabIndex = index === 0 ? 0 : -1;
      tab.addEventListener("click", () => select(tab, false));
      tab.addEventListener("keydown", (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let next = index;
        if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        select(tabs[next], true);
      });
    });
    const requested = (location.hash || "").slice(1);
    const match = tabs.find((tab) => tab.getAttribute("aria-controls") === requested);
    if (match) select(match, false);
  }

  async function renderStatus() {
    const host = document.getElementById("cap-status-host");
    try {
      const release = await fetch("data/release.json", { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("release metadata returned " + response.status);
        return response.json();
      });
      const cards = [
        { state: "verified", title: "Verified historical baseline", value: release.currentBaseline.tag, body: "Published " + release.currentBaseline.publishedAt + ". Installer and update assets are recorded from the release itself." },
        { state: "pending", title: "Next release", value: release.pendingRelease.label, body: release.pendingRelease.note },
        { state: "verified", title: "This page", value: "Browser-local", body: "No account, analytics, server delivery, background process, or native application authority." },
      ];
      cards.forEach((card) => {
        const box = el("article", "mm-card mm-status-card");
        box.dataset.state = card.state;
        box.append(el("h3", "", card.title));
        box.append(el("div", "status-value", card.value));
        box.append(el("p", "hint", card.body));
        host.appendChild(box);
      });
    } catch (error) {
      host.append(el("p", "mm-disclosure", "Release state could not be loaded: " + error.message));
    }
  }

  function applyDisplayName() {
    const name = localStorage.getItem(KEYS.name) || "Meadowmark";
    document.querySelectorAll("[data-personalizable]").forEach((node) => {
      if (node.dataset.baseText === undefined) node.dataset.baseText = node.textContent;
      if (node.matches("h1")) node.textContent = name + " local tools and site capabilities";
    });
    if (global.MMApp && MMApp.applyLocalBrand) MMApp.applyLocalBrand();
    return name;
  }

  function wireDisplayName() {
    const input = document.getElementById("cap-display-name");
    const provenance = document.getElementById("cap-display-name-provenance");
    const current = localStorage.getItem(KEYS.name);
    input.value = current || "Meadowmark";
    provenance.textContent = current ? "Set by you in this browser." : "Built-in default: Meadowmark";
    document.getElementById("cap-display-name-save").addEventListener("click", () => {
      const value = input.value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
      if (!value) { notify("Display name must not be empty.", "error"); return; }
      localStorage.setItem(KEYS.name, value.slice(0, 64));
      provenance.textContent = "Set by you in this browser.";
      applyDisplayName();
      record("settings changed", "Changed the site display name", { value: "redacted from ordinary history" });
      notify("Display name changed locally.");
    });
    document.getElementById("cap-display-name-reset").addEventListener("click", () => {
      localStorage.removeItem(KEYS.name); input.value = "Meadowmark";
      provenance.textContent = "Built-in default: Meadowmark"; applyDisplayName();
      record("settings changed", "Reset the site display name");
    });
    document.addEventListener("mm:tabs-rendered", applyDisplayName);
  }

  /* A small recursive JSON tokenizer used before JSON.parse. JSON.parse alone
     silently accepts duplicate keys, which is unsuitable for settings input. */
  function assertNoDuplicateKeys(source) {
    let index = 0;
    function fail(message) { throw new Error(message + " at byte " + index); }
    function ws() { while (/\s/.test(source[index] || "")) index++; }
    function stringToken() {
      if (source[index] !== '"') fail("Expected a string");
      const start = index++;
      while (index < source.length) {
        const ch = source[index++];
        if (ch === "\\") { if (index >= source.length) fail("Incomplete escape"); index++; continue; }
        if (ch === '"') return JSON.parse(source.slice(start, index));
        if (ch < " ") fail("Control character in string");
      }
      fail("Unterminated string");
    }
    function value(depth) {
      if (depth > 8) fail("Maximum nesting depth is 8");
      ws();
      if (source[index] === "{") return object(depth + 1);
      if (source[index] === "[") return array(depth + 1);
      if (source[index] === '"') { stringToken(); return; }
      const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(index));
      if (!match) fail("Invalid JSON value");
      index += match[0].length;
    }
    function object(depth) {
      index++; ws(); const keys = new Set();
      if (source[index] === "}") { index++; return; }
      while (index < source.length) {
        ws(); const key = stringToken();
        if (keys.has(key)) fail("Duplicate key " + JSON.stringify(key));
        keys.add(key); ws(); if (source[index++] !== ":") fail("Expected colon");
        value(depth); ws();
        if (source[index] === "}") { index++; return; }
        if (source[index++] !== ",") fail("Expected comma");
      }
      fail("Unterminated object");
    }
    function array(depth) {
      index++; ws(); if (source[index] === "]") { index++; return; }
      while (index < source.length) {
        value(depth); ws();
        if (source[index] === "]") { index++; return; }
        if (source[index++] !== ",") fail("Expected comma");
      }
      fail("Unterminated array");
    }
    value(0); ws(); if (index !== source.length) fail("Unexpected trailing content");
  }

  function validateVocabulary(text) {
    if (new Blob([text]).size > MAX_VOCAB_BYTES) throw new Error("File exceeds 128 KiB");
    assertNoDuplicateKeys(text);
    const parsed = JSON.parse(text);
    if (!parsed || Object.getPrototypeOf(parsed) !== Object.prototype) throw new Error("Root must be an object");
    const rootKeys = Object.keys(parsed);
    if (rootKeys.some((key) => !["version", "replacements"].includes(key))) throw new Error("Unexpected root field");
    if (parsed.version !== 1) throw new Error("Only schema version 1 is supported");
    if (!parsed.replacements || Object.getPrototypeOf(parsed.replacements) !== Object.prototype) throw new Error("replacements must be an object");
    const entries = Object.entries(parsed.replacements);
    if (entries.length > MAX_VOCAB_ENTRIES) throw new Error("Maximum 256 replacements");
    const safe = Object.create(null);
    entries.forEach(([key, value]) => {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Unsafe replacement key");
      if (typeof value !== "string") throw new Error("Replacement values must be strings");
      if (!key || key.length > 80 || value.length > 160) throw new Error("Replacement key or value is outside length bounds");
      safe[key] = value;
    });
    return { version: 1, replacements: safe };
  }

  function applyVocabulary() {
    const state = read(KEYS.vocabulary, null);
    const replacements = state && state.replacements ? state.replacements : {};
    document.querySelectorAll("[data-personalizable]").forEach((node) => {
      const base = node.dataset.vocabBase || node.textContent;
      node.dataset.vocabBase = base;
      let next = base;
      Object.entries(replacements).forEach(([from, to]) => { next = next.split(from).join(to); });
      node.textContent = next;
      const aria = node.getAttribute("aria-label");
      if (aria) {
        let nextAria = node.dataset.vocabAria || aria; node.dataset.vocabAria = nextAria;
        Object.entries(replacements).forEach(([from, to]) => { nextAria = nextAria.split(from).join(to); });
        node.setAttribute("aria-label", nextAria);
      }
    });
  }

  function wireVocabulary() {
    const file = document.getElementById("cap-vocab-file");
    const status = document.getElementById("cap-vocab-status");
    const existing = read(KEYS.vocabulary, null);
    if (existing) { status.textContent = Object.keys(existing.replacements || {}).length + " local replacements loaded."; applyVocabulary(); }
    file.addEventListener("change", async () => {
      const selected = file.files && file.files[0]; if (!selected) return;
      try {
        if (selected.size > MAX_VOCAB_BYTES) throw new Error("File exceeds 128 KiB");
        const parsed = validateVocabulary(await selected.text());
        write(KEYS.vocabulary, parsed); applyVocabulary();
        status.textContent = Object.keys(parsed.replacements).length + " local replacements loaded.";
        record("settings changed", "Loaded a personal vocabulary file", { entries: Object.keys(parsed.replacements).length, contents: "omitted" });
        notify("Personal vocabulary loaded locally.");
      } catch (error) { status.textContent = "Rejected: " + error.message + ". The last valid vocabulary remains active."; notify("Personal vocabulary was rejected: " + error.message, "error"); }
      file.value = "";
    });
    document.getElementById("cap-vocab-clear").addEventListener("click", () => {
      localStorage.removeItem(KEYS.vocabulary); applyVocabulary();
      status.textContent = "No file loaded. Shipped wording is active.";
      record("settings changed", "Cleared the personal vocabulary cache");
    });
    document.getElementById("cap-vocab-export").addEventListener("click", () => {
      const state = read(KEYS.vocabulary, null);
      MMExport.downloadText("meadowmark-personal-vocabulary-state.json", JSON.stringify({ schemaVersion: 1, loaded: !!state, entryCount: state ? Object.keys(state.replacements || {}).length : 0, omitted: "Replacement keys and values are private and are not exported." }, null, 2), "application/json");
    });
  }

  function minutes(value) { const parts = value.split(":").map(Number); return parts[0] * 60 + parts[1]; }
  function scheduleMatches(rule, date) {
    if (!rule.enabled || !rule.days.includes(date.getDay())) return false;
    const now = date.getHours() * 60 + date.getMinutes();
    const start = minutes(rule.start), end = minutes(rule.end);
    return start === end || (start < end ? now >= start && now < end : now >= start || now < end);
  }
  let scheduleBaseTheme = null;
  function paintTheme(theme) {
    if (theme === "light" || theme === "dark") document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }
  function applySchedules() {
    const matches = read(KEYS.schedules, []).filter((rule) => scheduleMatches(rule, new Date()));
    const active = matches[matches.length - 1];
    paintTheme(active ? active.theme : scheduleBaseTheme || (global.MMTheme ? MMTheme.get().theme : "system"));
  }
  function wireSchedules() {
    const list = document.getElementById("cap-schedule-list");
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local timezone";
    document.getElementById("cap-timezone").textContent = "Timezone: " + timezone + ". Daylight-saving changes follow the browser's clock.";
    function draw() {
      list.innerHTML = "";
      const rules = read(KEYS.schedules, []);
      if (!rules.length) list.append(el("li", "", "No schedule rules yet."));
      rules.forEach((rule) => {
        const row = el("li"); const body = el("div", "record-body");
        body.append(el("strong", "", rule.label));
        body.append(el("div", "hint", rule.start + "–" + rule.end + " · " + rule.theme + " · days " + rule.days.join(",") + (scheduleMatches(rule, new Date()) ? " · active now" : "")));
        const toggle = el("button", "mm-btn tonal", rule.enabled ? "Disable" : "Enable");
        toggle.addEventListener("click", () => { const all = read(KEYS.schedules, []); const found = all.find((item) => item.id === rule.id); found.enabled = !found.enabled; write(KEYS.schedules, all); record("settings changed", (found.enabled ? "Enabled" : "Disabled") + " schedule " + found.label); draw(); applySchedules(); });
        const remove = el("button", "mm-btn outlined", "Remove");
        remove.addEventListener("click", () => { write(KEYS.schedules, read(KEYS.schedules, []).filter((item) => item.id !== rule.id)); record("deleted", "Removed schedule " + rule.label); draw(); applySchedules(); });
        row.append(body, toggle, remove); list.appendChild(row);
      });
    }
    document.getElementById("cap-schedule-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const days = Array.from(event.currentTarget.querySelectorAll(".mm-weekdays input:checked")).map((node) => Number(node.value));
      if (!days.length) { notify("Choose at least one weekday.", "error"); return; }
      const rule = { id: "s-" + Date.now(), label: document.getElementById("cap-schedule-label").value.trim().slice(0, 48), start: document.getElementById("cap-schedule-start").value, end: document.getElementById("cap-schedule-end").value, theme: document.getElementById("cap-schedule-theme").value, days, enabled: true };
      const rules = read(KEYS.schedules, []); rules.push(rule); write(KEYS.schedules, rules);
      record("created", "Added schedule " + rule.label); draw(); applySchedules();
    });
    scheduleBaseTheme = global.MMTheme ? MMTheme.get().theme : "system";
    document.addEventListener("mm:appearance-changed", (event) => { scheduleBaseTheme = event.detail.theme; applySchedules(); });
    draw(); applySchedules(); setInterval(applySchedules, 60000);
  }

  const logoState = { bitmap: null, preset: "sprout" };
  function detectImage(bytes) {
    const hex = Array.from(new Uint8Array(bytes.slice(0, 16))).map((n) => n.toString(16).padStart(2, "0")).join("");
    if (hex.startsWith("89504e470d0a1a0a")) return "png";
    if (hex.startsWith("ffd8ff")) return "jpeg";
    if (hex.startsWith("52494646") && hex.slice(16, 24) === "57454250") return "webp";
    if (hex.startsWith("47494638")) throw new Error("Animated GIF is not accepted");
    throw new Error("Bytes are not PNG, JPEG, or WebP");
  }
  function drawLogo() {
    const canvas = document.getElementById("cap-logo-preview"); const ctx = canvas.getContext("2d");
    const bg = document.getElementById("cap-logo-bg").value; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (logoState.bitmap) {
      const fit = document.getElementById("cap-logo-fit").value;
      const scale = fit === "cover" ? Math.max(canvas.width / logoState.bitmap.width, canvas.height / logoState.bitmap.height) : Math.min(canvas.width / logoState.bitmap.width, canvas.height / logoState.bitmap.height);
      const w = logoState.bitmap.width * scale, h = logoState.bitmap.height * scale;
      const fx = Number(document.getElementById("cap-logo-x").value) / 100, fy = Number(document.getElementById("cap-logo-y").value) / 100;
      const x = (canvas.width - w) * fx, y = (canvas.height - h) * fy;
      ctx.drawImage(logoState.bitmap, x, y, w, h); return;
    }
    const symbols = { sprout: "🌱", barn: "🏡", sun: "🌄" };
    ctx.font = "112px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(symbols[logoState.preset] || symbols.sprout, 96, 100);
  }
  async function wireLogo() {
    const saved = read(KEYS.logo, null);
    if (saved && saved.version === 1 && typeof saved.png === "string" && saved.png.length <= 512000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(saved.png)) {
      try {
        const blob = await fetch(saved.png).then((response) => response.blob());
        logoState.bitmap = await createImageBitmap(blob);
        document.getElementById("cap-logo-fit").value = saved.fit === "cover" ? "cover" : "contain";
        if (/^#[0-9a-f]{6}$/i.test(saved.background || "")) document.getElementById("cap-logo-bg").value = saved.background;
        document.getElementById("cap-logo-x").value = String(Math.max(0, Math.min(100, Number(saved.focalX) || 50)));
        document.getElementById("cap-logo-y").value = String(Math.max(0, Math.min(100, Number(saved.focalY) || 50)));
        document.getElementById("cap-logo-status").textContent = "Saved local logo is active in the site header.";
      } catch (_) { document.getElementById("cap-logo-status").textContent = "The saved logo cache could not be decoded. The built-in mark remains active."; }
    }
    drawLogo();
    document.querySelectorAll(".cap-logo-preset").forEach((button) => button.addEventListener("click", () => { logoState.bitmap = null; logoState.preset = button.dataset.preset; drawLogo(); document.getElementById("cap-logo-status").textContent = button.textContent + " preset previewed; choose Apply preview to persist."; }));
    document.getElementById("cap-logo-file").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0]; if (!file) return;
      try {
        if (file.size > MAX_LOGO_BYTES) throw new Error("Image exceeds 2 MiB");
        detectImage(await file.arrayBuffer());
        const bitmap = await createImageBitmap(file);
        if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_LOGO_PIXELS) { bitmap.close(); throw new Error("Decoded image exceeds 2048 × 2048 pixels"); }
        if (logoState.bitmap) logoState.bitmap.close(); logoState.bitmap = bitmap; drawLogo();
        document.getElementById("cap-logo-status").textContent = "Valid local image decoded. Nothing has been persisted yet.";
      } catch (error) { document.getElementById("cap-logo-status").textContent = "Conversion failed: " + error.message + ". The previous valid logo remains active."; notify("Logo rejected: " + error.message, "error"); }
      event.target.value = "";
    });
    ["cap-logo-fit", "cap-logo-bg", "cap-logo-x", "cap-logo-y"].forEach((id) => document.getElementById(id).addEventListener("input", drawLogo));
    document.getElementById("cap-logo-apply").addEventListener("click", () => {
      drawLogo(); const dataUrl = document.getElementById("cap-logo-preview").toDataURL("image/png");
      write(KEYS.logo, { version: 1, png: dataUrl, fit: document.getElementById("cap-logo-fit").value, background: document.getElementById("cap-logo-bg").value, focalX: Number(document.getElementById("cap-logo-x").value), focalY: Number(document.getElementById("cap-logo-y").value) });
      if (global.MMApp && MMApp.applyLocalBrand) MMApp.applyLocalBrand();
      record("settings changed", "Applied a local site logo", { image: "omitted" }); document.getElementById("cap-logo-status").textContent = "Converted 192 × 192 PNG stored only in this browser and applied to the site header.";
    });
    document.getElementById("cap-logo-reset").addEventListener("click", () => { localStorage.removeItem(KEYS.logo); if (logoState.bitmap) logoState.bitmap.close(); logoState.bitmap = null; logoState.preset = "sprout"; drawLogo(); if (global.MMApp && MMApp.applyLocalBrand) MMApp.applyLocalBrand(); record("settings changed", "Reset the local site logo"); document.getElementById("cap-logo-status").textContent = "Built-in Sprout preset is active in the site header."; });
  }

  const ADAPTERS = [
    { id: "text-json", category: "Code / Text", label: "Text → JSON string", enabled: true, output: ".json" },
    { id: "json-pretty", category: "Structured Data / Spreadsheets", label: "JSON → formatted JSON", enabled: true, output: ".pretty.json" },
    { id: "text-base64", category: "Binary Encodings", label: "Text → Base64", enabled: true, output: ".base64.txt" },
    { id: "image-png", category: "Images", label: "PNG/JPEG/WebP → PNG", enabled: true, output: ".png" },
    { id: "pdf-tools", category: "Documents / PDF", label: "PDF inspect/split/merge/rotate", enabled: false, reason: "No bundled offline PDF adapter in the static site" },
    { id: "audio", category: "Audio", label: "Audio conversion", enabled: false, reason: "No bundled offline audio codec" },
    { id: "video", category: "Video", label: "Video conversion", enabled: false, reason: "No bundled offline video codec" },
    { id: "archives", category: "Archives", label: "ZIP / 7z conversion", enabled: false, reason: "No bundled offline archive adapter" },
  ];
  const queueState = { items: [], active: false, paused: false, cancelled: false, adapter: "text-json" };
  function wireAdapters() {
    const host = document.getElementById("cap-adapter-catalog");
    const categories = Array.from(new Set(ADAPTERS.map((adapter) => adapter.category)));
    categories.forEach((category) => {
      const card = el("section", "mm-adapter-category"); card.append(el("h4", "", category));
      const searchWrap = el("div", "mm-search"); const search = el("input"); search.type = "search"; search.setAttribute("aria-label", "Search " + category + " adapters"); searchWrap.append(search, el("span")); card.append(searchWrap);
      if (global.MMRegexBuilder) MMRegexBuilder.attach(search, {});
      const list = el("div"); card.append(list); host.append(card);
      function draw() {
        list.innerHTML = ""; const matcher = global.MMRegexBuilder ? MMRegexBuilder.attach(search, {}) : { matches: () => true };
        ADAPTERS.filter((adapter) => adapter.category === category && matcher.matches(adapter.label + " " + (adapter.reason || ""))).forEach((adapter) => {
          const row = el("label", "mm-adapter"); row.setAttribute("aria-disabled", String(!adapter.enabled));
          const radio = el("input"); radio.type = "radio"; radio.name = "cap-adapter"; radio.value = adapter.id; radio.disabled = !adapter.enabled; radio.checked = adapter.id === queueState.adapter; radio.addEventListener("change", () => { queueState.adapter = adapter.id; });
          const copy = el("span", "adapter-copy"); copy.append(el("strong", "", adapter.label)); if (adapter.reason) copy.append(el("span", "hint", adapter.reason));
          row.append(radio, copy, el("span", "adapter-state", adapter.enabled ? "Available" : "Unavailable")); list.append(row);
        });
      }
      search.addEventListener("input", draw); draw();
    });
  }
  function detectFile(file) {
    const name = file.name.toLowerCase();
    if (/\.(png|jpe?g|webp)$/.test(name)) return "image";
    if (/\.json$/.test(name)) return "json";
    return "text";
  }
  function downloadBlob(name, blob) {
    const url = URL.createObjectURL(blob); const link = el("a"); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function convertItem(item) {
    const adapter = ADAPTERS.find((entry) => entry.id === item.adapter);
    if (!adapter || !adapter.enabled) throw new Error("Selected adapter is unavailable");
    if (item.file.size > 8 * 1024 * 1024) throw new Error("Static-site per-file limit is 8 MiB");
    if (adapter.id === "image-png") {
      detectImage(await item.file.arrayBuffer()); const bitmap = await createImageBitmap(item.file);
      if (bitmap.width * bitmap.height > MAX_LOGO_PIXELS) { bitmap.close(); throw new Error("Decoded image exceeds 2048 × 2048 pixels"); }
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext("2d").drawImage(bitmap, 0, 0); bitmap.close();
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG encoder returned no output")), "image/png"));
      downloadBlob(item.file.name.replace(/\.[^.]+$/, "") + ".png", blob); return blob.size;
    }
    const text = await item.file.text(); let output;
    if (adapter.id === "json-pretty") output = JSON.stringify(JSON.parse(text), null, 2) + "\n";
    else if (adapter.id === "text-json") output = JSON.stringify(text) + "\n";
    else {
      const bytes = new TextEncoder().encode(text); let binary = "";
      for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
      output = btoa(binary) + "\n";
    }
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" }); downloadBlob(item.file.name + adapter.output, blob); return blob.size;
  }
  function wireQueue() {
    const list = document.getElementById("cap-queue"), estimate = document.getElementById("cap-storage-estimate");
    function draw() {
      list.innerHTML = "";
      queueState.items.forEach((item) => {
        const row = el("li"); const body = el("div", "record-body"); body.append(el("strong", "", item.file.name)); body.append(el("div", "hint", detectFile(item.file) + " · " + item.file.size.toLocaleString() + " bytes · " + item.status));
        const progress = el("progress", "mm-progress"); progress.max = 1; progress.value = item.status === "done" ? 1 : item.status === "running" ? 0.5 : 0; body.append(progress); if (item.error) body.append(el("div", "hint", item.error)); row.append(body); list.append(row);
      });
      const bytes = queueState.items.filter((item) => ["pending", "running"].includes(item.status)).reduce((sum, item) => sum + item.file.size, 0);
      estimate.textContent = queueState.items.length + " queued record(s); " + bytes.toLocaleString() + " source bytes remain. Outputs may require similar or greater space.";
    }
    document.getElementById("cap-convert-files").addEventListener("change", (event) => {
      Array.from(event.target.files || []).forEach((file) => queueState.items.push({ id: "q-" + Date.now() + Math.random(), file, adapter: queueState.adapter, status: "pending" })); event.target.value = ""; draw();
    });
    async function run() {
      if (queueState.active) return; queueState.active = true; queueState.paused = false; queueState.cancelled = false;
      try {
        for (const item of queueState.items) {
          if (queueState.cancelled) break;
          while (queueState.paused && !queueState.cancelled) await new Promise((resolve) => setTimeout(resolve, 200));
          if (item.status !== "pending") continue;
          item.status = "running"; draw();
          try { item.outputBytes = await convertItem(item); item.status = "done"; record("created", "Converted " + item.file.name, { adapter: item.adapter, outputBytes: item.outputBytes }); }
          catch (error) { item.status = "failed"; item.error = error.message; notify("Conversion failed for " + item.file.name + ": " + error.message, "error"); }
          draw();
        }
      } finally { queueState.active = false; draw(); }
    }
    document.getElementById("cap-queue-start").addEventListener("click", run);
    document.getElementById("cap-queue-pause").addEventListener("click", (event) => { queueState.paused = !queueState.paused; event.currentTarget.textContent = queueState.paused ? "Resume" : "Pause"; });
    document.getElementById("cap-queue-cancel").addEventListener("click", () => { queueState.cancelled = true; queueState.items.forEach((item) => { if (item.status === "pending") item.status = "cancelled"; }); draw(); });
    document.getElementById("cap-queue-clear").addEventListener("click", () => { queueState.items = queueState.items.filter((item) => ["pending", "running"].includes(item.status)); draw(); });
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((result) => { estimate.textContent = "Browser storage estimate: " + Number(result.usage || 0).toLocaleString() + " used of " + Number(result.quota || 0).toLocaleString() + " bytes. Outputs are direct downloads and do not count against this quota."; });
    draw();
  }

  async function ollamaFetch(path) {
    if (!["/api/version", "/api/tags"].includes(path)) throw new Error("Endpoint is not allowlisted");
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch("http://127.0.0.1:11434" + path, { signal: controller.signal, cache: "no-store", credentials: "omit", redirect: "error" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const length = Number(response.headers.get("content-length") || 0); if (length > 1024 * 1024) throw new Error("Response exceeds 1 MiB");
      const body = await response.text(); if (new Blob([body]).size > 1024 * 1024) throw new Error("Response exceeds 1 MiB");
      return JSON.parse(body);
    } finally { clearTimeout(timer); }
  }
  function wireOllama() {
    const status = document.getElementById("cap-ollama-status"), modelsButton = document.getElementById("cap-ollama-models"), list = document.getElementById("cap-ollama-list");
    document.getElementById("cap-ollama-check").addEventListener("click", async () => {
      status.textContent = "Checking documented loopback endpoint…"; modelsButton.disabled = true;
      try { const value = await ollamaFetch("/api/version"); status.textContent = "Healthy local service, version " + String(value.version || "not reported") + "."; modelsButton.disabled = false; modelsButton.title = ""; }
      catch (error) { status.textContent = "Unavailable from this page: " + (error.name === "AbortError" ? "request timed out" : error.message) + ". The service may be stopped or the browser may be enforcing origin or mixed-content rules."; }
    });
    modelsButton.addEventListener("click", async () => {
      list.innerHTML = ""; status.textContent = "Reading installed model tags…";
      try { const value = await ollamaFetch("/api/tags"); const models = Array.isArray(value.models) ? value.models : []; if (models.length > 2000) throw new Error("Model list exceeds the 2,000-item browser limit"); if (!models.length) list.append(el("li", "", "No installed models reported.")); models.forEach((model) => { const row = el("li"); row.append(el("div", "record-body", String(model.name || model.model || "Unnamed model") + " · " + Number(model.size || 0).toLocaleString() + " bytes")); list.append(row); }); status.textContent = models.length + " installed model(s) reported by the local API."; }
      catch (error) { status.textContent = "Model list failed: " + error.message; }
    });
  }

  function bytesToB64(bytes) { return btoa(String.fromCharCode.apply(null, Array.from(bytes))); }
  function b64ToBytes(value) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
  async function lockVerifier(password, salt) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 150000 }, key, 256));
  }
  function wireLock() {
    const target = document.getElementById("cap-lock-target"), overlay = document.getElementById("cap-lock-overlay"), status = document.getElementById("cap-lock-status");
    function configured() { return read(KEYS.lock, null); }
    function render() { const state = configured(); status.textContent = state ? (target.classList.contains("is-locked") ? "Toy lock is active." : "Toy lock is configured and currently open on this page.") : "No lock is configured."; overlay.hidden = !target.classList.contains("is-locked"); }
    document.getElementById("cap-lock-set").addEventListener("click", async () => {
      const password = document.getElementById("cap-lock-password").value; if (!password) { notify("Enter a password for the toy lock.", "error"); return; }
      const salt = crypto.getRandomValues(new Uint8Array(16)), verifier = await lockVerifier(password, salt);
      write(KEYS.lock, { version: 1, salt: bytesToB64(salt), verifier: bytesToB64(verifier), iterations: 150000 }); document.getElementById("cap-lock-password").value = ""; record("created", "Configured the local toy lock", { credential: "omitted" }); render();
    });
    document.getElementById("cap-lock-now").addEventListener("click", () => { if (!configured()) { notify("Configure the toy lock first.", "error"); return; } target.classList.add("is-locked"); render(); document.getElementById("cap-lock-attempt").focus(); });
    document.getElementById("cap-lock-unlock").addEventListener("click", async () => {
      const state = configured(); if (!state) return; const candidate = document.getElementById("cap-lock-attempt").value; const verifier = await lockVerifier(candidate, b64ToBytes(state.salt)); document.getElementById("cap-lock-attempt").value = "";
      if (bytesToB64(verifier) === state.verifier) { target.classList.remove("is-locked"); render(); record("updated", "Unlocked the toy lock for this page"); }
      else { status.textContent = "The value did not match. Wait a moment before trying again, or clear this site's storage to reset."; setTimeout(() => { document.getElementById("cap-lock-unlock").disabled = false; }, 1200); document.getElementById("cap-lock-unlock").disabled = true; }
    });
    document.getElementById("cap-lock-remove").addEventListener("click", () => { localStorage.removeItem(KEYS.lock); target.classList.remove("is-locked"); record("deleted", "Removed the local toy lock", { credential: "omitted" }); render(); });
    render();
  }

  function wireTickets() {
    const list = document.getElementById("cap-ticket-list");
    function draw() {
      list.innerHTML = ""; const tickets = read(KEYS.tickets, []);
      if (!tickets.length) list.append(el("li", "", "No local tickets."));
      tickets.forEach((ticket) => { const row = el("li"); const body = el("div", "record-body"); body.append(el("strong", "", ticket.id + " · " + ticket.category)); body.append(el("div", "", ticket.description)); body.append(el("div", "hint", ticket.status + " · canned response: Clear this site's storage in your browser settings to reset local locks and settings.")); const advance = el("button", "mm-btn tonal", "Advance status"); advance.addEventListener("click", () => { const all = read(KEYS.tickets, []); const found = all.find((item) => item.id === ticket.id); found.status = found.status === "Opened" ? "Investigating locally" : "Resolved with reset instructions"; write(KEYS.tickets, all); record("updated", "Advanced local ticket " + ticket.id); draw(); }); row.append(body, advance); list.append(row); });
    }
    document.getElementById("cap-ticket-form").addEventListener("submit", (event) => { event.preventDefault(); const tickets = read(KEYS.tickets, []); const ticket = { id: "MM-LOCAL-" + String(Date.now()).slice(-8), category: document.getElementById("cap-ticket-category").value, description: document.getElementById("cap-ticket-description").value.trim().slice(0, 500), status: "Opened", createdAt: new Date().toISOString() }; tickets.push(ticket); write(KEYS.tickets, tickets.slice(-100)); document.getElementById("cap-ticket-description").value = ""; record("created", "Created local ticket " + ticket.id); draw(); });
    draw();
  }

  function base32(value) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
    const normalized = String(value).toUpperCase().replace(/\s|=/g, ""); if (!normalized) throw new Error("Secret is missing");
    normalized.split("").forEach((char) => { const index = alphabet.indexOf(char); if (index < 0) throw new Error("Secret is not valid base32"); bits += index.toString(2).padStart(5, "0"); });
    const bytes = []; for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2)); return new Uint8Array(bytes);
  }
  async function totp(config, time) {
    const counter = Math.floor(time / 1000 / config.period); const buffer = new ArrayBuffer(8); const view = new DataView(buffer); view.setUint32(4, counter, false);
    const key = await crypto.subtle.importKey("raw", config.secret, { name: "HMAC", hash: config.algorithm }, false, ["sign"]); const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer)); const offset = signature[signature.length - 1] & 15; const code = ((signature[offset] & 127) << 24 | signature[offset + 1] << 16 | signature[offset + 2] << 8 | signature[offset + 3]) % Math.pow(10, config.digits); return String(code).padStart(config.digits, "0");
  }
  let otpConfig = null, otpTimer = null;
  function parseOtp(uri) {
    const url = new URL(uri); if (url.protocol !== "otpauth:" || url.hostname !== "totp") throw new Error("Only otpauth://totp URIs are accepted");
    const secret = base32(url.searchParams.get("secret") || ""); const algorithm = (url.searchParams.get("algorithm") || "SHA1").toUpperCase().replace("SHA1", "SHA-1").replace("SHA256", "SHA-256").replace("SHA512", "SHA-512");
    if (!["SHA-1", "SHA-256", "SHA-512"].includes(algorithm)) throw new Error("Unsupported HMAC algorithm"); const digits = Number(url.searchParams.get("digits") || 6), period = Number(url.searchParams.get("period") || 30); if (digits < 6 || digits > 8 || period < 15 || period > 120) throw new Error("Digits or period is outside supported bounds");
    return { label: decodeURIComponent(url.pathname.slice(1)), issuer: url.searchParams.get("issuer") || "Unspecified issuer", secret, algorithm, digits, period };
  }
  function wireOtp() {
    const output = document.getElementById("cap-otp-output"), status = document.getElementById("cap-otp-status");
    async function refresh() { if (!otpConfig) return; const now = Date.now(), remaining = otpConfig.period - Math.floor(now / 1000) % otpConfig.period; const code = await totp(otpConfig, now); output.textContent = code.replace(/(.{3})(?=.)/g, "$1 ") + " · " + remaining + "s"; output.setAttribute("aria-label", "Current code for " + otpConfig.issuer + ", " + remaining + " seconds remaining"); }
    async function loadUri(value) { otpConfig = parseOtp(value); document.getElementById("cap-otp-uri").value = ""; if (otpTimer) clearInterval(otpTimer); await refresh(); otpTimer = setInterval(refresh, 1000); status.textContent = "Loaded in page memory only: " + otpConfig.issuer + " · " + otpConfig.label + " · " + otpConfig.algorithm + " · " + otpConfig.digits + " digits · " + otpConfig.period + " seconds."; record("created", "Loaded a temporary TOTP entry", { secret: "omitted", issuer: otpConfig.issuer }); }
    document.getElementById("cap-otp-load").addEventListener("click", async () => { try { await loadUri(document.getElementById("cap-otp-uri").value.trim()); } catch (error) { status.textContent = "Rejected: " + error.message; } });
    document.getElementById("cap-otp-clear").addEventListener("click", () => { otpConfig = null; if (otpTimer) clearInterval(otpTimer); otpTimer = null; output.textContent = "No authenticator entry loaded."; status.textContent = "Temporary authenticator entry cleared from page memory."; });
    document.getElementById("cap-qr-file").addEventListener("click", () => document.getElementById("cap-qr-input").click());
    document.getElementById("cap-qr-input").addEventListener("change", async (event) => { const file = event.target.files && event.target.files[0]; if (!file) return; try { if (!("BarcodeDetector" in window)) throw new Error("BarcodeDetector is unavailable in this browser"); const bitmap = await createImageBitmap(file); const results = await new BarcodeDetector({ formats: ["qr_code"] }).detect(bitmap); bitmap.close(); const value = results.find((item) => String(item.rawValue || "").startsWith("otpauth://")); if (!value) throw new Error("No TOTP QR code was detected"); await loadUri(value.rawValue); } catch (error) { status.textContent = "QR import failed: " + error.message; } event.target.value = ""; });
  }

  function wireDiscovery() {
    const groupInput = document.getElementById("cap-group-search"), tabInput = document.getElementById("cap-master-search"), groupList = document.getElementById("cap-group-results"), tabList = document.getElementById("cap-tab-results");
    if (global.MMRegexBuilder) { MMRegexBuilder.attach(groupInput, {}); MMRegexBuilder.attach(tabInput, {}); }
    function drawGroups() { groupList.innerHTML = ""; const matcher = global.MMRegexBuilder ? MMRegexBuilder.attach(groupInput, {}) : { matches: () => true }; const groups = Object.keys(MMTabs.GROUP_LABELS).filter((id) => matcher.matches(MMTabs.groupLabel(id))); if (!groups.length) groupList.append(el("li", "", "No matching groups.")); groups.forEach((id) => { const row = el("li"); row.append(el("div", "record-body", MMTabs.groupLabel(id))); groupList.append(row); }); }
    function drawTabs() { tabList.innerHTML = ""; const matcher = global.MMRegexBuilder ? MMRegexBuilder.attach(tabInput, {}) : { matches: () => true }; const tabs = MMTabs.allTabs().filter((tab) => matcher.matches(tab.en + " " + tab.yue + " " + tab.group)); if (!tabs.length) tabList.append(el("li", "", "No matching tabs.")); tabs.forEach((tab) => { const row = el("li"); const link = el("a", "record-body", tab.en + " · " + tab.yue + " · group " + tab.group); link.href = tab.href === "/" ? "index.html" : tab.href.replace(/^\//, ""); row.append(link); tabList.append(row); }); }
    groupInput.addEventListener("input", drawGroups); tabInput.addEventListener("input", drawTabs); drawGroups(); drawTabs();
  }

  function wireHistory() {
    const list = document.getElementById("cap-history-list"), search = document.getElementById("cap-history-search"); if (global.MMRegexBuilder) MMRegexBuilder.attach(search, {});
    function visible() { const matcher = global.MMRegexBuilder ? MMRegexBuilder.attach(search, {}) : { matches: () => true }; return read(KEYS.history, []).slice().reverse().filter((item) => !item.archived && matcher.matches(item.action + " " + item.summary)); }
    function draw() { list.innerHTML = ""; const items = visible(); if (!items.length) list.append(el("li", "", "No matching active history entries.")); items.forEach((item) => { const row = el("li"); const checkbox = el("input"); checkbox.type = "checkbox"; checkbox.dataset.id = item.id; checkbox.setAttribute("aria-label", "Select " + item.summary); const body = el("div", "record-body"); body.append(el("strong", "", item.summary)); body.append(el("div", "hint", new Date(item.at).toLocaleString() + " · " + item.action)); row.append(checkbox, body); list.append(row); }); }
    function selectedIds() { return Array.from(list.querySelectorAll("input:checked")).map((node) => node.dataset.id); }
    document.getElementById("cap-history-select-all").addEventListener("click", () => list.querySelectorAll("input[type=checkbox]").forEach((node) => { node.checked = true; }));
    document.getElementById("cap-history-invert").addEventListener("click", () => list.querySelectorAll("input[type=checkbox]").forEach((node) => { node.checked = !node.checked; }));
    document.getElementById("cap-history-export").addEventListener("click", () => { const ids = selectedIds(); const rows = read(KEYS.history, []).filter((item) => ids.includes(item.id)).map((item) => ({ id: item.id, at: item.at, action: item.action, summary: item.summary, omitted: "Secrets, vocabulary values, images, and private file metadata are not stored in ordinary history." })); MMExport.downloadText("meadowmark-local-history.json", JSON.stringify(rows, null, 2), "application/json"); });
    document.getElementById("cap-history-archive").addEventListener("click", () => { const ids = selectedIds(); const rows = read(KEYS.history, []); rows.forEach((item) => { if (ids.includes(item.id)) item.archived = true; }); write(KEYS.history, rows); draw(); });
    search.addEventListener("input", draw); document.addEventListener("mm:cap-history-changed", draw); draw();
  }

  function wireNotifications() { if (global.MMNotifications) MMNotifications.renderCentre(document.getElementById("cap-notification-centre")); }

  function wireCommandPalette() {
    document.querySelectorAll("[data-command-label]").forEach((node) => {
      node.tabIndex = node.tabIndex >= 0 ? node.tabIndex : -1;
    });
  }

  function init() {
    wireSectionTabs(); renderStatus(); wireDisplayName(); wireVocabulary(); wireSchedules(); wireLogo(); wireAdapters(); wireQueue(); wireOllama(); wireLock(); wireTickets(); wireOtp(); wireDiscovery(); wireHistory(); wireNotifications(); wireCommandPalette();
    document.addEventListener("mm:tabs-rendered", applyDisplayName);
  }

  global.MMCapabilities = { init, validateVocabulary, scheduleMatches, parseOtp, totp };
})(window);
