/**
 * The bottom navigation dock — a floating row of large icon badges that
 * replaces the old text-row sidebar entirely.
 *
 * This is a real WAI-ARIA tablist (role="tablist" / role="tab"), exactly
 * like the sidebar it replaces, so every keyboard and screen-reader path
 * that worked before still works: roving tabindex, arrow-key movement
 * between destinations, Home/End to jump to the first/last one, and a
 * visible focus ring on every button. The dock is always horizontal (it
 * only ever docks to the bottom edge — see index.ts for why), so its
 * arrow keys are Left/Right rather than Up/Down.
 *
 * With around sixteen destinations, the row will not fit every screen at
 * once. Rather than hiding any of them behind a second surface, the dock
 * scrolls horizontally — nothing is silently dropped — and grows a pair
 * of chunky chevron affordances at whichever edge still has content to
 * reveal, so a mouse user has an obvious way in as well as a trackpad or
 * touch user's native swipe. Keyboard users never need the chevrons at
 * all: arrow-key movement calls scrollIntoView on the newly-focused tab.
 */

import { h } from "../dom";
import { t } from "../i18n";
import { navGlyphFor } from "./icons";

export interface NavDockItem {
  id: string;
  label: string;
}

export interface NavDockOptions {
  items: NavDockItem[];
  activeId: string;
  ariaLabel: string;
  /** id of the single panel region every tab controls. */
  panelId: string;
  onActivate: (id: string) => void;
}

export interface NavDockHandle {
  root: HTMLElement;
  setActive: (id: string) => void;
  destroy: () => void;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function createNavDock(opts: NavDockOptions): NavDockHandle {
  let activeId = opts.activeId;
  const buttons = new Map<string, HTMLButtonElement>();

  const track = h("div.mm-navdock", {
    role: "tablist",
    "aria-label": opts.ariaLabel,
    "aria-orientation": "horizontal",
  });

  function orderedIds(): string[] {
    return opts.items.map((item) => item.id);
  }

  function focusAndReveal(id: string): void {
    const btn = buttons.get(id);
    if (!btn) return;
    btn.focus();
    btn.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  function render(): void {
    for (const [id, btn] of buttons) {
      const selected = id === activeId;
      btn.setAttribute("aria-selected", String(selected));
      btn.tabIndex = selected ? 0 : -1;
      btn.classList.toggle("mm-navdock__item--active", selected);
    }
  }

  function setActive(id: string): void {
    if (!opts.items.some((item) => item.id === id)) return;
    activeId = id;
    render();
    opts.onActivate(id);
  }

  track.addEventListener("keydown", (ev) => {
    const ids = orderedIds();
    if (ids.length === 0) return;
    const idx = ids.indexOf(activeId);
    if (ev.key === "ArrowRight") {
      ev.preventDefault();
      const nextId = ids[(idx + 1) % ids.length];
      if (nextId === undefined) return;
      setActive(nextId);
      focusAndReveal(nextId);
    } else if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      const prevId = ids[(idx - 1 + ids.length) % ids.length];
      if (prevId === undefined) return;
      setActive(prevId);
      focusAndReveal(prevId);
    } else if (ev.key === "Home") {
      ev.preventDefault();
      const firstId = ids[0];
      if (firstId === undefined) return;
      setActive(firstId);
      focusAndReveal(firstId);
    } else if (ev.key === "End") {
      ev.preventDefault();
      const lastId = ids[ids.length - 1];
      if (lastId === undefined) return;
      setActive(lastId);
      focusAndReveal(lastId);
    }
  });

  for (const item of opts.items) {
    const glyph = navGlyphFor(item.id);
    const btn = h(
      "button.mm-navdock__item",
      {
        type: "button",
        role: "tab",
        id: `mm-navtab-${item.id}`,
        "aria-controls": opts.panelId,
        onclick: () => {
          setActive(item.id);
          buttons.get(item.id)?.focus();
        },
      },
      h(
        "span.mm-navdock__badge",
        { "aria-hidden": "true", style: { "--mm-navdock-badge-color": `var(${glyph.colorVar})` } },
        glyph.glyph
      ),
      h("span.mm-navdock__label", {}, item.label)
    );
    buttons.set(item.id, btn);
    track.appendChild(btn);
  }
  render();

  const scrollStartBtn = h(
    "button.mm-navdock__scrollbtn.mm-navdock__scrollbtn--start",
    {
      type: "button",
      "aria-label": t("nav.scrollStart"),
      tabindex: "-1",
      onclick: () => track.scrollBy({ left: -track.clientWidth * 0.66, behavior: prefersReducedMotion() ? "auto" : "smooth" }),
    },
    "‹"
  );
  const scrollEndBtn = h(
    "button.mm-navdock__scrollbtn.mm-navdock__scrollbtn--end",
    {
      type: "button",
      "aria-label": t("nav.scrollEnd"),
      tabindex: "-1",
      onclick: () => track.scrollBy({ left: track.clientWidth * 0.66, behavior: prefersReducedMotion() ? "auto" : "smooth" }),
    },
    "›"
  );

  function updateScrollAffordances(): void {
    const maxScroll = track.scrollWidth - track.clientWidth;
    const canScrollStart = track.scrollLeft > 4;
    const canScrollEnd = track.scrollLeft < maxScroll - 4;
    scrollStartBtn.classList.toggle("mm-navdock__scrollbtn--visible", canScrollStart);
    scrollEndBtn.classList.toggle("mm-navdock__scrollbtn--visible", canScrollEnd);
  }
  updateScrollAffordances();
  track.addEventListener("scroll", updateScrollAffordances, { passive: true });
  window.addEventListener("resize", updateScrollAffordances);
  let resizeObserver: ResizeObserver | undefined;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(updateScrollAffordances);
    resizeObserver.observe(track);
  }

  const root = h("div.mm-navdock-wrap");
  root.appendChild(scrollStartBtn);
  root.appendChild(track);
  root.appendChild(scrollEndBtn);

  return {
    root,
    setActive,
    destroy(): void {
      track.removeEventListener("scroll", updateScrollAffordances);
      window.removeEventListener("resize", updateScrollAffordances);
      resizeObserver?.disconnect();
    },
  };
}
