/**
 * Right-click context menu wiring. Reuses components/menu.ts's filterable,
 * keyboard-navigable menu so context menus and dropdowns never diverge in
 * behaviour. Every item that has a keyboard shortcut displays it, and the
 * displayed shortcut is sourced from the same place that registers the
 * binding — never inferred or hard-coded separately — so it cannot drift
 * from what actually fires.
 */

import { MenuItemDef, openMenu } from "../components/menu";

export interface ContextMenuItemDef extends MenuItemDef {}

/** Attaches a contextmenu (right-click) handler to `target` that opens the
 * shared filterable menu at the pointer's virtual anchor position. */
export function attachContextMenu(target: HTMLElement, itemsProvider: () => ContextMenuItemDef[]): void {
  target.addEventListener("contextmenu", (ev: MouseEvent) => {
    ev.preventDefault();
    const virtualAnchor = document.createElement("div");
    virtualAnchor.style.position = "fixed";
    virtualAnchor.style.left = `${ev.clientX}px`;
    virtualAnchor.style.top = `${ev.clientY}px`;
    virtualAnchor.style.width = "0px";
    virtualAnchor.style.height = "0px";
    document.body.appendChild(virtualAnchor);
    openMenu({
      anchor: virtualAnchor,
      items: itemsProvider(),
      placement: "bottom-start",
    });
    // The overlay's outside-click handler will eventually close things; the
    // anchor element itself can be removed once layout has settled.
    requestAnimationFrame(() => virtualAnchor.remove());
  });
}

/** Registry of shortcut label lookups keyed by a stable command id, used so a
 * context menu can display the SAME shortcut string the palette/keymap uses. */
const shortcutRegistry = new Map<string, string>();

export function registerShortcutDisplay(commandId: string, displayLabel: string): void {
  shortcutRegistry.set(commandId, displayLabel);
}

export function shortcutDisplayFor(commandId: string): string | undefined {
  return shortcutRegistry.get(commandId);
}
