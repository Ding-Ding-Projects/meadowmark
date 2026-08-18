/* Meadowmark site — non-blocking toast notifications with a reviewable
 * notification centre. Modal dialogs are reserved for genuine decisions
 * elsewhere; this is the informational/success/progress channel. Every
 * dismissed toast stays in the centre until the visitor clears it. The
 * centre supports multi-select, an honestly-scoped select-all, bulk
 * dismiss and bulk export, honouring the active filter. */
(function (global) {
  "use strict";

  const KEY = "mm-notifications";
  const MAX_STORED = 200;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
  }
  let items = load();

  function save() { localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_STORED))); }

  function region() {
    let r = document.querySelector(".mm-toast-region");
    if (!r) {
      r = document.createElement("div");
      r.className = "mm-toast-region";
      r.setAttribute("aria-live", "polite");
      document.body.appendChild(r);
    }
    return r;
  }

  function toast(message, opts) {
    opts = opts || {};
    const id = "n" + Date.now() + Math.random().toString(36).slice(2, 7);
    const record = { id, message, kind: opts.kind || "info", at: new Date().toISOString(), read: false };
    items.push(record);
    save();
    const r = region();
    const el = document.createElement("div");
    el.className = "mm-toast" + (opts.kind === "error" ? " error" : "");
    el.setAttribute("role", "status");
    const span = document.createElement("div");
    span.style.flex = "1";
    span.textContent = message;
    const dismiss = document.createElement("button");
    dismiss.className = "dismiss";
    dismiss.setAttribute("aria-label", "Dismiss notification");
    dismiss.textContent = "×";
    dismiss.addEventListener("click", () => el.remove());
    el.appendChild(span);
    el.appendChild(dismiss);
    r.appendChild(el);
    const timeout = opts.kind === "error" || opts.kind === "warning" ? 0 : 6000;
    if (timeout) setTimeout(() => el.remove(), timeout);
    document.dispatchEvent(new CustomEvent("mm:notifications-changed"));
    return id;
  }

  function all() { return items.slice().reverse(); }

  function removeMany(ids) {
    items = items.filter((i) => !ids.includes(i.id));
    save();
    document.dispatchEvent(new CustomEvent("mm:notifications-changed"));
  }

  function clearAll() { items = []; save(); document.dispatchEvent(new CustomEvent("mm:notifications-changed")); }

  /** Render a full notification centre with bulk actions into `container`. */
  function renderCentre(container) {
    function draw() {
      container.innerHTML = "";
      const list = all();
      const searchWrap = document.createElement("div");
      searchWrap.className = "mm-search";
      searchWrap.style.marginBottom = "10px";
      const search = document.createElement("input");
      search.type = "search";
      search.placeholder = "Filter notifications… / 篩選通知…";
      search.setAttribute("aria-label", "Filter notifications");
      searchWrap.appendChild(search);
      container.appendChild(searchWrap);
      if (window.MMRegexBuilder) MMRegexBuilder.attach(search, {});

      const bulkbar = document.createElement("div");
      bulkbar.className = "mm-bulkbar";
      container.appendChild(bulkbar);

      const listEl = document.createElement("ul");
      listEl.className = "mm-notif-list";
      container.appendChild(listEl);

      function filtered() {
        if (!window.MMRegexBuilder) return list;
        const matcher = MMRegexBuilder.attach(search, {});
        return list.filter((i) => matcher.matches(i.message));
      }

      function redraw() {
        const rows = filtered();
        listEl.innerHTML = "";
        if (!rows.length) {
          const empty = document.createElement("div");
          empty.className = "hint";
          empty.setAttribute("data-str", "notif.empty");
          listEl.appendChild(empty);
        }
        rows.forEach((n) => {
          const li = document.createElement("li");
          li.className = "mm-notif-row";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.dataset.id = n.id;
          const body = document.createElement("div");
          body.style.flex = "1";
          const msg = document.createElement("div");
          msg.textContent = n.message;
          const meta = document.createElement("div");
          meta.className = "hint";
          meta.textContent = new Date(n.at).toLocaleString() + " · " + n.kind;
          body.appendChild(msg);
          body.appendChild(meta);
          const dismissBtn = document.createElement("button");
          dismissBtn.className = "mm-btn icon";
          dismissBtn.setAttribute("aria-label", "Dismiss");
          dismissBtn.textContent = "×";
          dismissBtn.addEventListener("click", () => { removeMany([n.id]); draw(); });
          li.appendChild(cb);
          li.appendChild(body);
          li.appendChild(dismissBtn);
          listEl.appendChild(li);
        });
        renderBulkbar(rows);
        if (window.MMI18n) document.dispatchEvent(new CustomEvent("mm:lang-changed"));
      }

      function renderBulkbar(rows) {
        bulkbar.innerHTML = "";
        const selectPageBtn = document.createElement("button");
        selectPageBtn.className = "mm-btn tonal";
        selectPageBtn.setAttribute("data-str", "notif.select_all");
        selectPageBtn.addEventListener("click", () => {
          listEl.querySelectorAll('input[type=checkbox]').forEach((cb) => (cb.checked = true));
        });
        const dismissBtn = document.createElement("button");
        dismissBtn.className = "mm-btn secondary";
        dismissBtn.setAttribute("data-str", "notif.bulk_dismiss");
        dismissBtn.addEventListener("click", () => {
          const ids = Array.from(listEl.querySelectorAll("input[type=checkbox]:checked")).map((c) => c.dataset.id);
          removeMany(ids);
          draw();
        });
        const exportBtn = document.createElement("button");
        exportBtn.className = "mm-btn outlined";
        exportBtn.setAttribute("data-str", "notif.bulk_export");
        exportBtn.addEventListener("click", () => {
          const ids = Array.from(listEl.querySelectorAll("input[type=checkbox]:checked")).map((c) => c.dataset.id);
          const selected = rows.filter((r) => ids.includes(r.id));
          if (window.MMExport) {
            MMExport.exportRows(selected, [
              { key: "at", label: "Time" }, { key: "kind", label: "Kind" }, { key: "message", label: "Message" },
            ], "meadowmark-notifications", "json");
          }
        });
        const countEl = document.createElement("span");
        countEl.className = "hint";
        countEl.textContent = rows.length + " shown / " + list.length + " total";
        bulkbar.appendChild(selectPageBtn);
        bulkbar.appendChild(dismissBtn);
        bulkbar.appendChild(exportBtn);
        bulkbar.appendChild(countEl);
      }

      search.addEventListener("input", redraw);
      redraw();
    }
    draw();
    document.addEventListener("mm:notifications-changed", draw);
  }

  global.MMNotifications = { toast, all, removeMany, clearAll, renderCentre };
})(window);
