/* Meadowmark site — per-page bootstrap. Injects the shared header/footer
 * partials, wires the tab strip, language/theme controls, notification
 * bell, and command palette shortcut. Call MMApp.init({ rootPrefix })
 * once per page, after the other js/*.js modules have loaded. */
(function (global) {
  "use strict";

  function fetchPartial(path) {
    return fetch(path).then((r) => { if (!r.ok) throw new Error("partial " + path + " failed"); return r.text(); });
  }

  function applyLocalBrand() {
    const displayName = (localStorage.getItem("mm-display-name") || "Meadowmark").slice(0, 64);
    let storedLogo = null;
    try {
      const candidate = JSON.parse(localStorage.getItem("mm-logo-v1"));
      if (candidate && candidate.version === 1 && typeof candidate.png === "string" && candidate.png.length <= 512000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(candidate.png)) storedLogo = candidate.png;
    } catch (_) { storedLogo = null; }
    document.querySelectorAll(".mm-topbar .brand").forEach((brand) => {
      let label = brand.querySelector(".mm-site-brand-label");
      if (!label) {
        brand.textContent = "";
        label = document.createElement("span");
        label.className = "mm-site-brand-label";
        brand.appendChild(label);
      }
      label.textContent = displayName;
      let mark = brand.querySelector(".mm-site-brand-mark");
      if (!mark) {
        mark = storedLogo ? document.createElement("img") : document.createElement("span");
        mark.className = "mm-site-brand-mark";
        brand.insertBefore(mark, label);
      }
      if (storedLogo && mark.tagName !== "IMG") {
        const image = document.createElement("img"); image.className = mark.className; mark.replaceWith(image); mark = image;
      } else if (!storedLogo && mark.tagName === "IMG") {
        const fallback = document.createElement("span"); fallback.className = mark.className; mark.replaceWith(fallback); mark = fallback;
      }
      if (storedLogo) { mark.src = storedLogo; mark.alt = ""; }
      else { mark.textContent = "🌾"; mark.setAttribute("aria-hidden", "true"); }
    });
  }

  function init(opts) {
    opts = opts || {};
    const rootPrefix = opts.rootPrefix || "";
    const currentHref = opts.currentHref || "";

    const headerHost = document.getElementById("mm-header-host");
    const footerHost = document.getElementById("mm-footer-host");

    const headerReady = fetchPartial(rootPrefix + "partials/header.html").then((html) => {
      headerHost.innerHTML = html.replaceAll("__ROOT__", rootPrefix);
      wireHeader();
      applyLocalBrand();
    }).catch(() => {
      headerHost.innerHTML = '<div class="mm-topbar"><a class="brand" href="' + rootPrefix + 'index.html">Meadowmark</a></div><div class="mm-tabpanel" id="mm-tabpanel"></div>';
      applyLocalBrand();
    });

    const footerReady = fetchPartial(rootPrefix + "partials/footer.html").then((html) => {
      footerHost.innerHTML = html.replaceAll("__ROOT__", rootPrefix);
    }).catch(() => { footerHost.innerHTML = ""; });

    function wireHeader() {
      const tabpanel = document.getElementById("mm-tabpanel");
      MMTabs.init(tabpanel, { rootPrefix, currentHref });

      const langMini = document.getElementById("mm-lang-mini");
      langMini.value = MMI18n.get().lang;
      langMini.addEventListener("change", () => MMI18n.set({ lang: langMini.value }));
      document.addEventListener("mm:lang-changed", (e) => { langMini.value = e.detail.lang; });

      document.getElementById("mm-theme-toggle").addEventListener("click", () => {
        const cur = MMTheme.get().theme;
        const next = cur === "dark" ? "light" : cur === "light" ? "system" : "dark";
        MMTheme.set({ theme: next });
        MMNotifications.toast("Theme set to " + next + " / 主題設咗做 " + next);
      });

      document.getElementById("mm-palette-btn").addEventListener("click", () => MMPalette.open(rootPrefix));

      document.getElementById("mm-tab-toggle").addEventListener("click", (e) => {
        tabpanel.classList.toggle("open");
        e.target.setAttribute("aria-expanded", String(tabpanel.classList.contains("open")));
      });
      tabpanel.addEventListener("click", (e) => {
        if (e.target.closest("a.mm-tab") && window.innerWidth < 768) tabpanel.classList.remove("open");
      });

      document.getElementById("mm-notif-btn").addEventListener("click", (e) => {
        MMOverlay.openAnchored(e.currentTarget, (el, close) => {
          el.classList.add("wide");
          const title = document.createElement("div");
          title.style.fontWeight = "700";
          title.style.marginBottom = "8px";
          title.setAttribute("data-str", "notif.center");
          el.appendChild(title);
          const host = document.createElement("div");
          el.appendChild(host);
          MMNotifications.renderCentre(host);
          document.dispatchEvent(new CustomEvent("mm:lang-changed"));
        }, { align: "right" });
      });
    }

    MMPalette.installShortcut(rootPrefix);

    // Wait for both partials so the footer's own text (loaded
    // asynchronously, same as the header) is tagged for "Edit
    // appearance…" too, not just the statically-rendered #main content.
    Promise.all([headerReady, footerReady]).then(() => {
      if (window.MMAppearanceEditor) MMAppearanceEditor.installContextMenus();
    });

    return headerReady;
  }

  global.MMApp = { init, applyLocalBrand };
})(window);
