/**
 * Shared popover/menu machinery used by dropdowns, context menus, the regex
 * builder popover, the appearance editor, etc.
 *
 * Contract:
 *  - Every overlay PAINTS ITS OWN background/border/elevation/shape (never
 *    relies on the anchor's stacking context leaving it transparent).
 *  - Every overlay is BOUNDED by the viewport and SCROLLS INTERNALLY rather
 *    than clipping content silently.
 *  - An overlay never covers the control that opened it.
 *  - Closing an overlay returns focus to the anchor.
 */

import { h } from "./dom";

export interface OverlayHandle {
  el: HTMLDivElement;
  close: () => void;
  reposition: () => void;
}

export interface OpenOverlayOptions {
  anchor: HTMLElement;
  build: (close: () => void) => HTMLElement;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  onClose?: () => void;
  /** className appended to the overlay surface, e.g. "mm-menu" for its own painted surface. */
  surfaceClass?: string;
}

let openStack: OverlayHandle[] = [];

export function openOverlay(opts: OpenOverlayOptions): OverlayHandle {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const container = h("div", {
    style: {
      position: "fixed",
      zIndex: "var(--mm-z-overlay)",
      maxHeight: "0",
    },
  });
  container.classList.add("mm-overlay-container");
  if (opts.surfaceClass) container.classList.add(opts.surfaceClass);

  function close(): void {
    document.removeEventListener("mousedown", onOutsideClick, true);
    document.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
    container.remove();
    openStack = openStack.filter((h) => h !== handle);
    opts.onClose?.();
    previouslyFocused?.focus?.();
  }

  function onOutsideClick(ev: MouseEvent): void {
    if (!container.contains(ev.target as Node) && ev.target !== opts.anchor && !opts.anchor.contains(ev.target as Node)) {
      close();
    }
  }

  function onKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  }

  function reposition(): void {
    const anchorRect = opts.anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const placement = opts.placement ?? "bottom-start";
    const margin = 4;

    // Measure natural size first.
    container.style.maxHeight = "";
    container.style.visibility = "hidden";
    container.style.left = "0px";
    container.style.top = "0px";
    const rect = container.getBoundingClientRect();
    const naturalWidth = rect.width;
    const naturalHeight = rect.height;

    let left = placement.endsWith("end") ? anchorRect.right - naturalWidth : anchorRect.left;
    let top = placement.startsWith("bottom") ? anchorRect.bottom + margin : anchorRect.top - naturalHeight - margin;

    // Clamp horizontally within viewport.
    left = Math.max(margin, Math.min(left, vw - naturalWidth - margin));

    // If it doesn't fit below, flip above (and vice versa), never covering the anchor.
    const fitsBelow = anchorRect.bottom + margin + Math.min(naturalHeight, vh * 0.6) <= vh;
    const fitsAbove = anchorRect.top - margin - Math.min(naturalHeight, vh * 0.6) >= 0;
    if (placement.startsWith("bottom") && !fitsBelow && fitsAbove) {
      top = Math.max(margin, anchorRect.top - margin - naturalHeight);
    } else if (placement.startsWith("top") && !fitsAbove && fitsBelow) {
      top = anchorRect.bottom + margin;
    }

    const availableHeight = Math.max(120, vh - top - margin);
    container.style.maxHeight = `${Math.min(naturalHeight, availableHeight, vh - margin * 2)}px`;
    container.style.overflowY = "auto";
    container.style.left = `${left}px`;
    container.style.top = `${Math.max(margin, top)}px`;
    container.style.visibility = "visible";
  }

  const content = opts.build(close);
  container.appendChild(content);
  document.body.appendChild(container);

  const handle: OverlayHandle = { el: container, close, reposition };
  openStack.push(handle);

  reposition();
  document.addEventListener("mousedown", onOutsideClick, true);
  document.addEventListener("keydown", onKeydown, true);
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);

  const firstFocusable = container.querySelector<HTMLElement>(
    'input, button, [tabindex]:not([tabindex="-1"])'
  );
  firstFocusable?.focus();

  return handle;
}

export function closeAllOverlays(): void {
  [...openStack].forEach((h) => h.close());
}
