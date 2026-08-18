/* Meadowmark site — changelog viewer.
 * Reads data/changelog.json. Provides a date-range filter with an
 * advanced anchored calendar (month/year jump, range selection, typed
 * ISO dates, presets), a regex-wired text search, and export/copy of
 * the current filtered view to Markdown, JSON, CSV, and HTML, honouring
 * the active filter. Every entry links to the exact commit that made
 * the change. */
(function (global) {
  "use strict";

  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseIso(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || "").trim()); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d) ? null : d; }

  function buildCalendar(container, state, onChange) {
    let viewDate = state.start ? parseIso(state.start) : new Date();

    function draw() {
      container.innerHTML = "";
      const head = document.createElement("div");
      head.className = "mm-calendar-head";
      const prev = document.createElement("button"); prev.className = "mm-btn icon"; prev.textContent = "‹"; prev.setAttribute("aria-label", "Previous month");
      const next = document.createElement("button"); next.className = "mm-btn icon"; next.textContent = "›"; next.setAttribute("aria-label", "Next month");
      const monthYear = document.createElement("select");
      const yearSelect = document.createElement("select");
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      months.forEach((m, i) => { const o = document.createElement("option"); o.value = i; o.textContent = m; if (i === viewDate.getMonth()) o.selected = true; monthYear.appendChild(o); });
      for (let y = viewDate.getFullYear() - 5; y <= viewDate.getFullYear() + 5; y++) { const o = document.createElement("option"); o.value = y; o.textContent = y; if (y === viewDate.getFullYear()) o.selected = true; yearSelect.appendChild(o); }
      monthYear.addEventListener("change", () => { viewDate = new Date(viewDate.getFullYear(), +monthYear.value, 1); draw(); });
      yearSelect.addEventListener("change", () => { viewDate = new Date(+yearSelect.value, viewDate.getMonth(), 1); draw(); });
      prev.addEventListener("click", () => { viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1); draw(); });
      next.addEventListener("click", () => { viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1); draw(); });
      head.appendChild(prev); head.appendChild(monthYear); head.appendChild(yearSelect); head.appendChild(next);
      container.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "mm-calendar";
      ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].forEach((d) => { const c = document.createElement("div"); c.className = "cell muted"; c.textContent = d; grid.appendChild(c); });
      const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
      const startOffset = firstOfMonth.getDay();
      const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
      const today = iso(new Date());
      for (let i = 0; i < startOffset; i++) { const c = document.createElement("div"); c.className = "cell muted"; grid.appendChild(c); }
      for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(viewDate.getFullYear(), viewDate.getMonth(), d);
        const dateStr = iso(dateObj);
        const c = document.createElement("div");
        c.className = "cell";
        c.textContent = String(d);
        c.setAttribute("role", "button");
        c.tabIndex = 0;
        if (dateStr === today) c.classList.add("today");
        if (dateStr === state.start || dateStr === state.end) c.classList.add("selected");
        else if (state.start && state.end && dateStr > state.start && dateStr < state.end) c.style.background = "var(--mm-surface-4)";
        function pick() {
          if (!state.start || (state.start && state.end)) { state.start = dateStr; state.end = null; }
          else if (dateStr < state.start) { state.end = state.start; state.start = dateStr; }
          else { state.end = dateStr; }
          onChange(state);
          draw();
        }
        c.addEventListener("click", pick);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
        grid.appendChild(c);
      }
      container.appendChild(grid);

      const presets = document.createElement("div");
      presets.className = "mm-calendar-presets";
      [
        ["7d", "Last 7 days / 過去7日", 7],
        ["30d", "Last 30 days / 過去30日", 30],
        ["all", "All time / 全部時間", null],
      ].forEach(([id, label, days]) => {
        const b = document.createElement("button");
        b.className = "mm-btn tonal";
        b.textContent = label;
        b.addEventListener("click", () => {
          if (days === null) { state.start = null; state.end = null; }
          else {
            const end = new Date();
            const start = new Date(); start.setDate(start.getDate() - days);
            state.start = iso(start); state.end = iso(end);
          }
          onChange(state);
          draw();
        });
        presets.appendChild(b);
      });
      container.appendChild(presets);
    }
    draw();
  }

  function init(container) {
    fetch("data/changelog.json").then((r) => r.json()).then((entries) => render(entries)).catch(() => {
      container.innerHTML = '<p class="hint">Changelog data failed to load locally.</p>';
    });

    function render(entries) {
      const state = { start: null, end: null };
      const toolbar = document.createElement("div");
      toolbar.className = "mm-changelog-toolbar";

      const searchWrap = document.createElement("div");
      searchWrap.className = "field";
      const searchLabel = document.createElement("label");
      searchLabel.textContent = "Search / 搜尋";
      const searchInputWrap = document.createElement("div");
      searchInputWrap.className = "mm-search";
      const search = document.createElement("input");
      search.type = "search";
      search.setAttribute("aria-label", "Search the changelog");
      searchInputWrap.appendChild(search);
      searchWrap.appendChild(searchLabel);
      searchWrap.appendChild(searchInputWrap);
      toolbar.appendChild(searchWrap);
      if (window.MMRegexBuilder) MMRegexBuilder.attach(search, {});

      const dateWrap = document.createElement("div");
      dateWrap.className = "field mm-date-input";
      const dateLabel = document.createElement("label");
      dateLabel.textContent = "Date range / 日期範圍";
      const dateBtn = document.createElement("button");
      dateBtn.type = "button";
      dateBtn.className = "mm-btn outlined";
      dateBtn.textContent = "Any date / 任何日期";
      const typedRow = document.createElement("div");
      typedRow.style.display = "flex";
      typedRow.style.gap = "6px";
      const startInput = document.createElement("input");
      startInput.type = "text"; startInput.placeholder = "YYYY-MM-DD"; startInput.setAttribute("aria-label", "Start date, ISO format");
      const endInput = document.createElement("input");
      endInput.type = "text"; endInput.placeholder = "YYYY-MM-DD"; endInput.setAttribute("aria-label", "End date, ISO format");
      typedRow.appendChild(startInput);
      typedRow.appendChild(endInput);
      const typedError = document.createElement("div");
      typedError.className = "hint";
      typedError.style.color = "var(--mm-error)";
      dateWrap.appendChild(dateLabel);
      dateWrap.appendChild(dateBtn);
      dateWrap.appendChild(typedRow);
      dateWrap.appendChild(typedError);
      toolbar.appendChild(dateWrap);

      const categoryWrap = document.createElement("div");
      categoryWrap.className = "field";
      const categoryLabel = document.createElement("label");
      categoryLabel.textContent = "Category / 分類";
      const categorySelect = document.createElement("select");
      const cats = Array.from(new Set(entries.map((e) => e.category)));
      const anyOpt = document.createElement("option"); anyOpt.value = ""; anyOpt.textContent = "All / 全部"; categorySelect.appendChild(anyOpt);
      cats.forEach((c) => { const o = document.createElement("option"); o.value = c; o.textContent = c; categorySelect.appendChild(o); });
      categoryWrap.appendChild(categoryLabel);
      categoryWrap.appendChild(categorySelect);
      toolbar.appendChild(categoryWrap);

      const exportWrap = document.createElement("div");
      exportWrap.className = "field";
      const exportLabel = document.createElement("label");
      exportLabel.textContent = "Export current view / 匯出目前畫面";
      const exportRow = document.createElement("div");
      exportRow.style.display = "flex";
      exportRow.style.gap = "4px";
      ["json", "csv", "markdown", "html"].forEach((fmt) => {
        const b = document.createElement("button");
        b.className = "mm-btn tonal";
        b.textContent = fmt.toUpperCase();
        b.addEventListener("click", () => {
          MMExport.exportRows(filtered(), [
            { key: "version", label: "Version" }, { key: "date", label: "Date" }, { key: "status", label: "Status" },
            { key: "category", label: "Category" }, { key: "commit", label: "Commit" }, { key: "en", label: "English" }, { key: "yue", label: "Cantonese" },
          ], "meadowmark-changelog", fmt);
        });
        exportRow.appendChild(b);
      });
      const copyBtn = document.createElement("button");
      copyBtn.className = "mm-btn tonal";
      copyBtn.textContent = "Copy / 複製";
      copyBtn.addEventListener("click", () => {
        const md = MMExport.toMarkdown(filtered(), [
          { key: "version", label: "Version" }, { key: "date", label: "Date" }, { key: "category", label: "Category" }, { key: "en", label: "English" },
        ]);
        if (navigator.clipboard) navigator.clipboard.writeText(md).catch(() => {});
        MMNotifications.toast("Copied the visible changelog to the clipboard. / 已將目前顯示嘅更新日誌複製咗。");
      });
      exportRow.appendChild(copyBtn);
      exportWrap.appendChild(exportLabel);
      exportWrap.appendChild(exportRow);
      toolbar.appendChild(exportWrap);

      container.appendChild(toolbar);

      const listHost = document.createElement("div");
      container.appendChild(listHost);

      function applyTyped() {
        typedError.textContent = "";
        if (startInput.value) {
          const d = parseIso(startInput.value);
          if (!d) { typedError.textContent = "Start date must be YYYY-MM-DD. / 開始日期要用 YYYY-MM-DD 格式。"; return; }
          state.start = startInput.value;
        } else state.start = null;
        if (endInput.value) {
          const d = parseIso(endInput.value);
          if (!d) { typedError.textContent = "End date must be YYYY-MM-DD. / 結束日期要用 YYYY-MM-DD 格式。"; return; }
          state.end = endInput.value;
        } else state.end = null;
        redraw();
      }
      startInput.addEventListener("change", applyTyped);
      endInput.addEventListener("change", applyTyped);

      dateBtn.addEventListener("click", () => {
        MMOverlay.openAnchored(dateBtn, (el, close) => {
          const host = document.createElement("div");
          el.appendChild(host);
          buildCalendar(host, state, (s) => {
            startInput.value = s.start || "";
            endInput.value = s.end || "";
            redraw();
          });
        }, {});
      });

      function filtered() {
        const matcher = window.MMRegexBuilder ? MMRegexBuilder.attach(search, {}) : null;
        return entries.filter((e) => {
          if (state.start && e.date < state.start) return false;
          if (state.end && e.date > state.end) return false;
          if (categorySelect.value && e.category !== categorySelect.value) return false;
          if (matcher && !matcher.matches(e.en + " " + e.yue + " " + e.category + " " + e.version)) return false;
          return true;
        });
      }

      function redraw() {
        dateBtn.textContent = state.start ? (state.start + (state.end && state.end !== state.start ? " → " + state.end : "")) : "Any date / 任何日期";
        const rows = filtered();
        listHost.innerHTML = "";
        if (!rows.length) {
          const empty = document.createElement("p");
          empty.className = "hint";
          empty.textContent = "No changelog entries match this filter. / 冇更新日誌符合呢個篩選。";
          listHost.appendChild(empty);
          return;
        }
        const byVersion = {};
        rows.forEach((e) => { (byVersion[e.version] = byVersion[e.version] || []).push(e); });
        Object.keys(byVersion).forEach((v) => {
          const group = byVersion[v];
          const h = document.createElement("h2");
          h.textContent = v + " — " + group[0].status;
          listHost.appendChild(h);
          const ul = document.createElement("ul");
          group.forEach((e) => {
            const li = document.createElement("li");
            li.style.marginBottom = "10px";
            const commitUrl = "https://github.com/Ding-Ding-Projects/meadowmark/commit/" + encodeURIComponent(e.commit);
            const badge = document.createElement("span"); badge.className = "mm-badge"; badge.textContent = e.category;
            const date = document.createElement("span"); date.className = "hint"; date.textContent = " " + e.date + " ";
            const link = document.createElement("a"); link.href = commitUrl; link.className = "hint"; link.textContent = e.commit.slice(0, 7);
            const english = document.createElement("span"); english.className = "i18n-en"; english.textContent = e.en;
            const cantonese = document.createElement("span"); cantonese.className = "i18n-yue"; cantonese.lang = "yue"; cantonese.textContent = e.yue;
            li.append(badge, date, link, document.createElement("br"), english, cantonese);
            ul.appendChild(li);
          });
          listHost.appendChild(ul);
        });
        document.dispatchEvent(new CustomEvent("mm:lang-changed"));
      }

      search.addEventListener("input", redraw);
      categorySelect.addEventListener("change", redraw);
      redraw();
    }
  }

  global.MMChangelog = { init };
})(window);
