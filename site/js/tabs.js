/* Meadowmark site — browser-style tabbed navigation.
 * Docks to any edge (default left), overflow-safe, reorderable,
 * pinnable, grouped, and persisted. Ships all four required
 * tab-discovery searches: (1) the current strip search, (2) a search
 * inside each tab group, (3) a search over group names, (4) a master
 * search across every tab on the site — each with its own state and
 * its own regex-builder popover. */
(function (global) {
  "use strict";

  const GROUP_LABELS = {
    core: { en: "Core", yue: "主要" },
    foundations: { en: "Foundations", yue: "基礎" },
    farm: { en: "Farm", yue: "農場" },
    production: { en: "Production", yue: "生產" },
    consumers: { en: "Consumers", yue: "消耗途徑" },
    town: { en: "Town", yue: "小鎮" },
    meta: { en: "Meta systems", yue: "後設系統" },
  };

  const LS_ORDER = "mm-tabs-order";
  const LS_PINNED = "mm-tabs-pinned";
  const LS_COLLAPSED = "mm-tabs-collapsed";
  const LS_DOCK = "mm-appearance"; // tabDock lives in theme state

  let NAV = [];

  function lsGet(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function currentLang() { return (window.MMI18n ? MMI18n.get().lang : "en"); }
  function label(item) {
    const lang = currentLang();
    if (lang === "yue") return item.yue;
    if (lang === "bi") return item.en + " / " + item.yue;
    return item.en;
  }
  function groupLabel(g) {
    const l = GROUP_LABELS[g] || { en: g, yue: g };
    const lang = currentLang();
    if (lang === "yue") return l.yue;
    if (lang === "bi") return l.en + " / " + l.yue;
    return l.en;
  }

  function orderedNav() {
    const order = lsGet(LS_ORDER, null);
    const pinned = new Set(lsGet(LS_PINNED, []));
    let items = NAV.slice();
    if (order) {
      const byId = new Map(items.map((i) => [i.id, i]));
      const sorted = order.map((id) => byId.get(id)).filter(Boolean);
      const missing = items.filter((i) => !order.includes(i.id));
      items = sorted.concat(missing);
    }
    items.forEach((i) => (i._pinned = pinned.has(i.id)));
    return items;
  }

  function buildBase(rootPath) {
    // rootPath: "" for site root pages, "../" for docs/*.html
    return rootPath;
  }

  function init(container, opts) {
    opts = opts || {};
    const rootPrefix = opts.rootPrefix || "";
    const currentHref = opts.currentHref || "";

    fetch(rootPrefix + "data/nav.json")
      .then((r) => r.json())
      .then((data) => {
        NAV = data;
        render();
      })
      .catch(() => {
        container.innerHTML = '<div class="hint" style="padding:12px">Navigation failed to load locally.</div>';
      });

    function isCurrent(item) {
      if (!currentHref) return false;
      const norm = (s) => s.replace(/^\/+/, "").replace(/index\.html$/, "");
      return norm(item.href) === norm(currentHref);
    }

    function href(item) {
      // nav.json hrefs are site-root-relative ("/", "/docs/x.html"); convert to the page's relative prefix.
      let h = item.href;
      if (h === "/") h = rootPrefix + "index.html";
      else h = rootPrefix + h.replace(/^\//, "");
      return h;
    }

    function pinToggle(id) {
      const pinned = new Set(lsGet(LS_PINNED, []));
      if (pinned.has(id)) pinned.delete(id); else pinned.add(id);
      lsSet(LS_PINNED, Array.from(pinned));
      render();
    }

    function moveItem(id, dir) {
      const order = orderedNav().map((i) => i.id);
      const idx = order.indexOf(id);
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= order.length) return;
      [order[idx], order[swapWith]] = [order[swapWith], order[idx]];
      lsSet(LS_ORDER, order);
      render();
    }

    function toggleCollapsed(group) {
      const collapsed = lsGet(LS_COLLAPSED, {});
      collapsed[group] = !collapsed[group];
      lsSet(LS_COLLAPSED, collapsed);
      render();
    }

    function render() {
      const dock = (window.MMTheme ? MMTheme.get().tabDock : "left") || "left";
      const shell = document.querySelector(".mm-shell");
      if (shell) shell.setAttribute("data-dock", dock);
      const vertical = dock === "left" || dock === "right";

      container.innerHTML = "";
      container.setAttribute("role", "navigation");
      container.setAttribute("aria-label", "Site navigation");

      const strip = document.createElement("div");
      strip.className = "mm-tabstrip";

      // (1) Current strip search
      const searchWrap = document.createElement("div");
      searchWrap.className = "mm-tabstrip-search mm-search";
      const stripSearch = document.createElement("input");
      stripSearch.type = "search";
      stripSearch.placeholder = "Search this tab strip… / 搜尋呢個 tab strip…";
      stripSearch.setAttribute("aria-label", "Search the current tab strip");
      searchWrap.appendChild(stripSearch);
      strip.appendChild(searchWrap);
      if (window.MMRegexBuilder) MMRegexBuilder.attach(stripSearch, {});

      const listRoot = document.createElement("div");
      listRoot.setAttribute("role", vertical ? "tablist" : "tablist");
      listRoot.setAttribute("aria-orientation", vertical ? "vertical" : "horizontal");
      strip.appendChild(listRoot);

      function stripMatches(item) {
        if (!window.MMRegexBuilder) return true;
        const matcher = MMRegexBuilder.attach(stripSearch, {});
        return matcher.matches(item.en + " " + item.yue);
      }

      const items = orderedNav();
      const pinnedItems = items.filter((i) => i._pinned && stripMatches(i));
      const rest = items.filter((i) => !i._pinned);
      const groups = {};
      rest.forEach((i) => { (groups[i.group] = groups[i.group] || []).push(i); });

      if (pinnedItems.length) {
        const pinGroup = document.createElement("div");
        pinGroup.className = "mm-tab-group";
        const h = document.createElement("div");
        h.className = "mm-tab-group-header";
        h.textContent = "📌 Pinned / 已釘選";
        pinGroup.appendChild(h);
        const ul = document.createElement("ul");
        ul.className = "mm-tab-list";
        pinnedItems.forEach((item) => ul.appendChild(renderTab(item)));
        pinGroup.appendChild(ul);
        listRoot.appendChild(pinGroup);
      }

      Object.keys(groups).forEach((g) => {
        const groupItems = groups[g].filter(stripMatches);
        if (!groupItems.length) return;
        const groupWrap = document.createElement("div");
        groupWrap.className = "mm-tab-group";
        const header = document.createElement("div");
        header.className = "mm-tab-group-header";
        const collapsed = lsGet(LS_COLLAPSED, {})[g];
        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.textContent = (collapsed ? "▸ " : "▾ ") + groupLabel(g);
        toggleBtn.setAttribute("aria-expanded", String(!collapsed));
        toggleBtn.addEventListener("click", () => toggleCollapsed(g));
        header.appendChild(toggleBtn);
        groupWrap.appendChild(header);

        if (!collapsed) {
          // (2) Search inside this tab group
          const gSearchWrap = document.createElement("div");
          gSearchWrap.className = "mm-search";
          gSearchWrap.style.padding = "0 8px 4px";
          const gSearch = document.createElement("input");
          gSearch.type = "search";
          gSearch.placeholder = "Filter " + groupLabel(g) + "… / 篩選…";
          gSearch.setAttribute("aria-label", "Search inside the " + groupLabel(g) + " group");
          gSearchWrap.appendChild(gSearch);
          groupWrap.appendChild(gSearchWrap);
          if (window.MMRegexBuilder) MMRegexBuilder.attach(gSearch, {});

          const ul = document.createElement("ul");
          ul.className = "mm-tab-list";
          function drawGroupTabs() {
            ul.innerHTML = "";
            const matcher = window.MMRegexBuilder ? MMRegexBuilder.attach(gSearch, {}) : null;
            groupItems.filter((i) => !matcher || matcher.matches(i.en + " " + i.yue)).forEach((item) => ul.appendChild(renderTab(item)));
          }
          gSearch.addEventListener("input", drawGroupTabs);
          drawGroupTabs();
          groupWrap.appendChild(ul);
        }
        listRoot.appendChild(groupWrap);
      });

      function renderTab(item) {
        const li = document.createElement("li");
        li.draggable = true;
        li.dataset.id = item.id;
        li.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/mm-tab-id", item.id));
        li.addEventListener("dragover", (e) => e.preventDefault());
        li.addEventListener("drop", (e) => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData("text/mm-tab-id");
          if (draggedId && draggedId !== item.id) {
            const order = orderedNav().map((i) => i.id);
            const from = order.indexOf(draggedId);
            const to = order.indexOf(item.id);
            order.splice(to, 0, order.splice(from, 1)[0]);
            lsSet(LS_ORDER, order);
            render();
          }
        });
        const a = document.createElement("a");
        a.className = "mm-tab";
        a.href = href(item);
        a.setAttribute("role", "tab");
        a.setAttribute("aria-selected", String(isCurrent(item)));
        a.tabIndex = isCurrent(item) ? 0 : -1;
        const textSpan = document.createElement("span");
        textSpan.textContent = label(item);
        a.appendChild(textSpan);
        const pinBtn = document.createElement("button");
        pinBtn.type = "button";
        pinBtn.className = "pin-btn";
        pinBtn.setAttribute("aria-label", item._pinned ? "Unpin tab" : "Pin tab");
        pinBtn.textContent = item._pinned ? "📌" : "☆";
        pinBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); pinToggle(item.id); });
        a.appendChild(pinBtn);
        a.addEventListener("keydown", (e) => {
          const dir = vertical ? (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0) : (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0);
          if (dir) {
            e.preventDefault();
            const all = Array.from(listRoot.querySelectorAll("a.mm-tab"));
            const idx = all.indexOf(a);
            const next = all[idx + dir];
            if (next) next.focus();
          }
          if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowLeft")) { e.preventDefault(); moveItem(item.id, -1); }
          if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowRight")) { e.preventDefault(); moveItem(item.id, 1); }
        });
        li.appendChild(a);
        return li;
      }

      container.appendChild(strip);
      document.dispatchEvent(new CustomEvent("mm:tabs-rendered"));
    }

    document.addEventListener("mm:lang-changed", render);
    document.addEventListener("mm:appearance-changed", render);
    global.MMTabsRerender = render;
  }

  /** (3) Search by group name — used from Settings and the palette. */
  function searchGroups(query) {
    const q = (query || "").toLowerCase();
    return Object.keys(GROUP_LABELS).filter((g) => GROUP_LABELS[g].en.toLowerCase().includes(q) || GROUP_LABELS[g].yue.includes(q));
  }

  /** (4) Master search across every tab on the site, regardless of group collapse state. */
  function allTabs() { return NAV; }

  function tabDockEdgePicker(container) {
    container.innerHTML = "";
    const current = window.MMTheme ? MMTheme.get().tabDock : "left";
    ["left", "top", "right", "bottom"].forEach((edge) => {
      const btn = document.createElement("button");
      btn.className = "mm-btn" + (edge === current ? "" : " outlined");
      btn.textContent = edge[0].toUpperCase() + edge.slice(1);
      btn.style.marginRight = "6px";
      btn.addEventListener("click", () => { MMTheme.set({ tabDock: edge }); tabDockEdgePicker(container); });
      container.appendChild(btn);
    });
  }

  global.MMTabs = { init, GROUP_LABELS, groupLabel, allTabs, searchGroups, tabDockEdgePicker, orderedNav };
})(window);
