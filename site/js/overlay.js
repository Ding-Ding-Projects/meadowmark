/* Meadowmark site — anchored overlay helper.
 * Every popover/menu/tooltip on the site paints its own surface (see
 * .mm-overlay in css/base.css), stays bounded to the viewport, scrolls
 * internally rather than clipping its content, never covers the control
 * that opened it, and returns focus to that control on close. */
(function (global) {
  "use strict";

  let openOverlay = null;

  function closeOverlay() {
    if (!openOverlay) return;
    const { el, scrim, anchor } = openOverlay;
    el.remove();
    if (scrim) scrim.remove();
    openOverlay = null;
    if (anchor && typeof anchor.focus === "function") anchor.focus();
    document.removeEventListener("keydown", onKeydown, true);
    document.removeEventListener("mousedown", onOutside, true);
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeOverlay();
    }
  }

  function onOutside(e) {
    if (!openOverlay) return;
    if (openOverlay.el.contains(e.target) || (openOverlay.anchor && openOverlay.anchor.contains(e.target))) return;
    closeOverlay();
  }

  function place(el, anchor, opts) {
    const rect = anchor.getBoundingClientRect();
    el.style.visibility = "hidden";
    document.body.appendChild(el);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let top = rect.bottom + 6;
    let left = rect.left;
    if (opts && opts.align === "right") left = rect.right - w;
    // Bound to viewport on every axis; never let the overlay run off-screen.
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (left < 8) left = 8;
    if (top + h > window.innerHeight - 8) {
      // flip above if there's more room there
      const above = rect.top - h - 6;
      top = above > 8 ? above : Math.max(8, window.innerHeight - h - 8);
    }
    el.style.top = top + "px";
    el.style.left = left + "px";
    el.style.visibility = "";
  }

  /**
   * Open an anchored, non-modal overlay next to `anchor`.
   * `render(container)` fills the overlay's DOM. Returns a close() fn.
   */
  function openAnchored(anchor, render, opts) {
    closeOverlay();
    opts = opts || {};
    const el = document.createElement("div");
    el.className = "mm-overlay" + (opts.wide ? " wide" : "");
    el.setAttribute("role", opts.role || "dialog");
    el.tabIndex = -1;
    render(el, closeOverlay);
    place(el, anchor, opts);
    anchor.setAttribute("aria-expanded", "true");
    openOverlay = { el, anchor, scrim: null };
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("mousedown", onOutside, true);
    const focusable = el.querySelector("input,button,select,textarea,[tabindex]");
    (focusable || el).focus();
    const origClose = closeOverlay;
    return function () {
      anchor.removeAttribute("aria-expanded");
      origClose();
    };
  }

  /** Open a modal (scrim-backed) overlay, centred, for genuine decisions. */
  function openModal(render, opts) {
    closeOverlay();
    opts = opts || {};
    const scrim = document.createElement("div");
    scrim.className = "mm-scrim";
    const el = document.createElement("div");
    el.className = "mm-overlay" + (opts.wide ? " wide" : "");
    el.style.position = "fixed";
    el.style.top = "10vh";
    el.style.left = "50%";
    el.style.transform = "translateX(-50%)";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.tabIndex = -1;
    render(el, closeOverlay);
    document.body.appendChild(scrim);
    document.body.appendChild(el);
    openOverlay = { el, scrim, anchor: opts.returnFocusTo || document.activeElement };
    document.addEventListener("keydown", onKeydown, true);
    scrim.addEventListener("mousedown", closeOverlay);
    const focusable = el.querySelector("input,button,select,textarea,[tabindex]");
    (focusable || el).focus();
  }

  global.MMOverlay = { openAnchored, openModal, close: closeOverlay };
})(window);
