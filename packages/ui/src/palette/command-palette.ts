/**
 * Command palette, activated by Ctrl+Shift+F. Lists every command,
 * destination, and setting; rich results render a live control inline
 * wired to the same code/state as the originating surface, and selecting a
 * destination teleports directly to the exact element (opens the owning
 * surface, selects the right tab, scrolls into view, focuses, briefly
 * highlights).
 */

import { h, Store } from "../dom";
import { t } from "../i18n";

export interface PaletteCommandResult {
  kind: "command";
  id: string;
  label: string;
  onRun: () => void;
}

export interface PaletteDestinationResult {
  kind: "destination";
  id: string;
  label: string;
  /** Performs the full teleport: open surface, select tab/group, scroll into
   * view, focus, and briefly highlight the target element. */
  teleport: () => void;
}

export interface PaletteSettingResult {
  kind: "setting";
  id: string;
  label: string;
  /** Renders the LIVE control (switch/slider/etc) — wired to the real
   * setting, not a read-only label. */
  renderControl: () => HTMLElement;
}

export type PaletteResult = PaletteCommandResult | PaletteDestinationResult | PaletteSettingResult;

export type PaletteSourceFn = () => PaletteResult[];

const sources: PaletteSourceFn[] = [];

/** Feature surfaces register their palette-searchable items here at module
 * load time (commands, destinations, and live setting controls). */
export function registerPaletteSource(source: PaletteSourceFn): void {
  sources.push(source);
}

function allResults(): PaletteResult[] {
  return sources.flatMap((s) => {
    try {
      return s();
    } catch {
      return [];
    }
  });
}

export type PaletteSize = "card" | "fullscreen";
export const paletteSizeStore = new Store<PaletteSize>(
  (() => {
    try {
      return (localStorage.getItem("meadowmark.palette.size") as PaletteSize) ?? "card";
    } catch {
      return "card";
    }
  })()
);
paletteSizeStore.subscribe((v) => {
  try {
    localStorage.setItem("meadowmark.palette.size", v);
  } catch {
    // ignore
  }
});

let openState: { root: HTMLDivElement; scrim: HTMLDivElement } | null = null;

export function isPaletteOpen(): boolean {
  return openState !== null;
}

export function openCommandPalette(): void {
  if (openState) return;
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const size = paletteSizeStore.getSnapshot();

  const input = h("input.mm-search-field__input", {
    type: "search",
    "aria-label": t("palette.searchLabel"),
    placeholder: t("palette.placeholder"),
  }) as HTMLInputElement;

  const resultsList = h("div", { role: "listbox", "aria-label": t("palette.resultsLabel") });

  function highlight(el: HTMLElement): void {
    el.animate(
      [
        { boxShadow: "0 0 0 3px var(--mm-color-primary)" },
        { boxShadow: "0 0 0 3px transparent" },
      ],
      { duration: 900, easing: "ease-out" }
    );
  }

  function renderResults(query: string): void {
    resultsList.textContent = "";
    const needle = query.trim().toLowerCase();
    const results = allResults().filter((r) => !needle || r.label.toLowerCase().includes(needle));
    if (results.length === 0) {
      resultsList.appendChild(h("div", { style: { padding: "12px" } }, t("common.state.noMatches")));
      return;
    }
    for (const result of results.slice(0, 100)) {
      const row = h("div.mm-list-item", { role: "option", tabindex: "0" });
      row.appendChild(h("div.mm-list-item__body", {}, h("div.mm-list-item__title", {}, result.label)));
      if (result.kind === "setting") {
        const control = result.renderControl();
        row.appendChild(h("div.mm-list-item__trailing", {}, control));
      } else {
        row.addEventListener("click", () => {
          if (result.kind === "command") result.onRun();
          else {
            result.teleport();
          }
          close();
        });
        row.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") {
            if (result.kind === "command") result.onRun();
            else result.teleport();
            close();
          }
        });
      }
      resultsList.appendChild(row);
    }
  }

  input.addEventListener("input", () => renderResults(input.value));

  function close(): void {
    if (!openState) return;
    openState.root.remove();
    openState.scrim.remove();
    openState = null;
    document.removeEventListener("keydown", onKeydown);
    previouslyFocused?.focus?.();
  }

  function onKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  }

  const scrim = h("div.mm-scrim", { style: { zIndex: "var(--mm-z-palette)" }, onclick: close });
  const surface = h(
    "div.mm-dialog__surface",
    {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": t("palette.title"),
      style: size === "fullscreen" ? { width: "96vw", height: "92vh", maxWidth: "96vw", maxHeight: "92vh" } : { width: "640px" },
    },
    h("div.mm-search-field", { role: "search" }, input),
    resultsList
  );
  const root = h("div.mm-dialog", { style: { zIndex: "var(--mm-z-palette)" } }, surface);

  document.body.appendChild(scrim);
  document.body.appendChild(root);
  document.addEventListener("keydown", onKeydown);
  openState = { root, scrim };
  input.focus();
  renderResults("");
}

export function installCommandPaletteHotkey(): () => void {
  function onKeydown(ev: KeyboardEvent): void {
    if (ev.ctrlKey && ev.shiftKey && (ev.key === "F" || ev.key === "f")) {
      ev.preventDefault();
      if (isPaletteOpen()) return;
      openCommandPalette();
    }
  }
  document.addEventListener("keydown", onKeydown);
  return () => document.removeEventListener("keydown", onKeydown);
}
