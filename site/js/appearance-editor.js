/* Meadowmark site — per-element appearance customisation.
 * Any element with [data-editable] gets "Edit appearance…" on its right
 * -click context menu (and Shift+right-click opens the editor directly).
 * The non-modal editor anchors beside the element and offers Word-depth
 * typography plus the infinite colour picker. Settings persist per
 * element id in localStorage, with per-element and global reset. */
(function (global) {
  "use strict";

  const KEY = "mm-element-appearance";

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; }
  }
  let store = load();
  function save() { localStorage.setItem(KEY, JSON.stringify(store)); }

  function applyTo(el) {
    const id = el.getAttribute("data-editable");
    const s = store[id];
    if (!s) { el.style.cssText = el.dataset.mmBaseStyle || el.style.cssText; return; }
    if (s.fontFamily) el.style.fontFamily = s.fontFamily;
    if (s.fontSize) el.style.fontSize = s.fontSize + "px";
    if (s.fontWeight) el.style.fontWeight = s.fontWeight;
    el.style.fontStyle = s.italic ? "italic" : "";
    let decoration = [];
    if (s.underline) decoration.push("underline");
    if (s.strike) decoration.push("line-through");
    el.style.textDecorationLine = decoration.join(" ") || "";
    if (s.letterSpacing !== undefined) el.style.letterSpacing = s.letterSpacing + "px";
    if (s.lineHeight !== undefined) el.style.lineHeight = s.lineHeight;
    if (s.align) el.style.textAlign = s.align;
    if (s.color) el.style.color = "rgba(" + s.color.r + "," + s.color.g + "," + s.color.b + "," + s.color.a + ")";
  }

  function applyAll() {
    document.querySelectorAll("[data-editable]").forEach(applyTo);
  }

  function resetElement(id) {
    delete store[id];
    save();
    applyAll();
  }

  function resetAll() {
    store = {};
    save();
    applyAll();
  }

  function openEditorFor(el) {
    const id = el.getAttribute("data-editable");
    const s = Object.assign({
      fontFamily: "", fontSize: 16, fontWeight: "400", italic: false, underline: false, strike: false,
      letterSpacing: 0, lineHeight: 1.5, align: "left", color: { r: 25, g: 29, b: 23, a: 1 },
    }, store[id] || {});

    MMOverlay.openAnchored(el, (root, close) => {
      root.classList.add("wide");
      const title = document.createElement("div");
      title.style.fontWeight = "700";
      title.style.marginBottom = "8px";
      title.textContent = "Edit appearance / 編輯外觀";
      root.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "mm-ae-grid";
      root.appendChild(grid);

      function field(labelText, node) {
        const f = document.createElement("div");
        f.className = "field";
        const l = document.createElement("label");
        l.textContent = labelText;
        f.appendChild(l);
        f.appendChild(node);
        grid.appendChild(f);
        return f;
      }

      const fontSelect = document.createElement("select");
      ["", "Georgia, serif", "'Courier New', monospace", "'Segoe UI', sans-serif", "Verdana, sans-serif", "'Comic Sans MS', cursive"].forEach((f) => {
        const o = document.createElement("option");
        o.value = f; o.textContent = f || "(inherit)";
        if (f === s.fontFamily) o.selected = true;
        fontSelect.appendChild(o);
      });
      field("Font family / 字體", fontSelect);

      const sizeInput = document.createElement("input");
      sizeInput.type = "number"; sizeInput.min = 8; sizeInput.max = 96; sizeInput.value = s.fontSize;
      field("Size (px) / 大小", sizeInput);

      const weightSelect = document.createElement("select");
      ["300", "400", "500", "600", "700", "800"].forEach((w) => {
        const o = document.createElement("option");
        o.value = w; o.textContent = w;
        if (w === String(s.fontWeight)) o.selected = true;
        weightSelect.appendChild(o);
      });
      field("Weight / 粗幼", weightSelect);

      const alignSelect = document.createElement("select");
      ["left", "center", "right", "justify"].forEach((a) => {
        const o = document.createElement("option");
        o.value = a; o.textContent = a;
        if (a === s.align) o.selected = true;
        alignSelect.appendChild(o);
      });
      field("Align / 對齊", alignSelect);

      const letterInput = document.createElement("input");
      letterInput.type = "number"; letterInput.step = "0.1"; letterInput.value = s.letterSpacing;
      field("Letter spacing (px) / 字距", letterInput);

      const lineInput = document.createElement("input");
      lineInput.type = "number"; lineInput.step = "0.05"; lineInput.value = s.lineHeight;
      field("Line height / 行高", lineInput);

      const toggles = document.createElement("div");
      toggles.style.gridColumn = "1 / -1";
      toggles.innerHTML =
        '<label style="margin-right:12px;font-weight:400"><input type="checkbox" id="mm-ae-italic"' + (s.italic ? " checked" : "") + '> Italic / 斜體</label>' +
        '<label style="margin-right:12px;font-weight:400"><input type="checkbox" id="mm-ae-underline"' + (s.underline ? " checked" : "") + '> Underline / 底線</label>' +
        '<label style="font-weight:400"><input type="checkbox" id="mm-ae-strike"' + (s.strike ? " checked" : "") + '> Strikethrough / 刪除線</label>';
      grid.appendChild(toggles);

      const colorLabel = document.createElement("div");
      colorLabel.className = "hint";
      colorLabel.style.marginTop = "10px";
      colorLabel.textContent = "Text colour / 文字顏色";
      root.appendChild(colorLabel);
      const colorHost = document.createElement("div");
      root.appendChild(colorHost);
      const picker = MMColor.build(colorHost, s.color, (rgba) => { s.color = rgba; });

      const actions = document.createElement("div");
      actions.className = "mm-ae-actions";
      const applyBtn = document.createElement("button");
      applyBtn.className = "mm-btn";
      applyBtn.textContent = "Apply / 套用";
      applyBtn.addEventListener("click", () => {
        s.fontFamily = fontSelect.value;
        s.fontSize = parseFloat(sizeInput.value) || 16;
        s.fontWeight = weightSelect.value;
        s.align = alignSelect.value;
        s.letterSpacing = parseFloat(letterInput.value) || 0;
        s.lineHeight = parseFloat(lineInput.value) || 1.5;
        s.italic = root.querySelector("#mm-ae-italic").checked;
        s.underline = root.querySelector("#mm-ae-underline").checked;
        s.strike = root.querySelector("#mm-ae-strike").checked;
        s.color = picker.getRgba();
        store[id] = s;
        save();
        applyTo(el);
        close();
      });
      const resetBtn = document.createElement("button");
      resetBtn.className = "mm-btn outlined";
      resetBtn.setAttribute("data-str", "appearance.reset");
      resetBtn.addEventListener("click", () => { resetElement(id); close(); });
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "mm-btn tonal";
      cancelBtn.textContent = "Cancel / 取消";
      cancelBtn.addEventListener("click", close);
      actions.appendChild(applyBtn);
      actions.appendChild(resetBtn);
      actions.appendChild(cancelBtn);
      root.appendChild(actions);
    }, { wide: true });
  }

  // A deterministic (not random) id, built from the element's position in
  // the DOM relative to a stable root plus the current page path. Random
  // ids would reset on every page load and silently forget every
  // auto-tagged element's saved appearance — this is what makes an
  // auto-tagged paragraph's customisation actually survive a reload.
  function domPathId(el, root) {
    const parts = [];
    let node = el;
    while (node && node !== root && node.parentElement) {
      const parent = node.parentElement;
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
      parts.unshift(node.tagName.toLowerCase() + sameTag.indexOf(node));
      node = parent;
    }
    return parts.join(">");
  }

  function ensureEditableId(el, root) {
    if (!el.getAttribute("data-editable")) {
      el.setAttribute("data-editable", "auto:" + location.pathname + "::" + domPathId(el, root || document.body));
    }
  }

  // Elements that carry visible text or their own background, in every
  // content region of every page — not just a hand-picked sample. This is
  // what "Edit appearance…" is scoped to. It deliberately EXCLUDES three
  // classes of element, named here so the gap is a documented decision
  // rather than a silent one (see also the matching note in
  // settings.js's Appearance panel caption):
  //   1. Site chrome (the top bar, the tab strip, the footer's own nav
  //      links) — these are navigation controls, not content, and users
  //      already retool them from Settings > Tabs / the tab strip itself.
  //   2. Anything inside a transient overlay (menus, the command palette,
  //      toasts, the appearance editor's own popover) — editing a menu
  //      item's appearance while the menu that opened the editor is still
  //      open is not a coherent action.
  //   3. Form controls (button/input/select/textarea/a) — these have
  //      their own Settings-driven styling contract; free-form appearance
  //      edits on a control risk making it illegible or inoperable.
  const AUTO_EDITABLE_SELECTOR = [
    "p", "li", "h1", "h2", "h3", "h4", "h5", "h6",
    "td", "th", "blockquote", "dt", "dd", "summary", "caption",
    ".mm-card", ".mm-hero", "article", "table.mm-table",
  ].join(", ");
  const AUTO_EDITABLE_ROOTS = "#main, #mm-footer-host";
  const AUTO_EDITABLE_EXCLUDE = ".mm-overlay, .mm-menu, .mm-palette, .mm-toast-region, .mm-tabstrip, .mm-topbar, nav";

  function autoTagEditableElements() {
    document.querySelectorAll(AUTO_EDITABLE_ROOTS).forEach((root) => {
      root.querySelectorAll(AUTO_EDITABLE_SELECTOR).forEach((el) => {
        if (el.closest(AUTO_EDITABLE_EXCLUDE)) return;
        ensureEditableId(el, root);
      });
    });
  }

  function installContextMenus() {
    autoTagEditableElements();
    document.querySelectorAll("[data-editable]").forEach((el) => ensureEditableId(el, document.body));
    applyAll();
    document.addEventListener("contextmenu", (e) => {
      const el = e.target.closest("[data-editable]");
      if (!el) return;
      e.preventDefault();
      if (e.shiftKey) { openEditorFor(el); return; }
      MMOverlay.openAnchored(el, (root, close) => {
        const ul = document.createElement("ul");
        ul.className = "mm-menu";
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.className = "item";
        btn.setAttribute("data-str", "appearance.edit");
        btn.addEventListener("click", () => { close(); openEditorFor(el); });
        li.appendChild(btn);
        ul.appendChild(li);
        root.appendChild(ul);
        document.dispatchEvent(new CustomEvent("mm:lang-changed"));
      }, {});
    });
  }

  applyAll();
  global.MMAppearanceEditor = { applyAll, resetAll, resetElement, openEditorFor, installContextMenus };
})(window);
