import { h } from "../dom";
import { openOverlay } from "../overlays";
import { t } from "../i18n";

export interface MenuItemDef {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  onSelect?: () => void;
}

export interface OpenMenuOptions {
  anchor: HTMLElement;
  items: MenuItemDef[];
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  /** Every menu — dropdown or context menu — carries its own filter field, no exceptions. */
  filterAriaLabel?: string;
}

/**
 * Opens a keyboard-navigable menu with a built-in filter field. Used for both
 * dropdown selects and right-click context menus, so the two never diverge in
 * behaviour. Filtering never changes what an item does — only which are shown.
 */
export function openMenu(opts: OpenMenuOptions): void {
  openOverlay({
    anchor: opts.anchor,
    surfaceClass: "mm-menu",
    placement: opts.placement ?? "bottom-start",
    build: (close) => {
      const root = h("div", { role: "menu" });
      const filterInput = h("input.mm-text-field__input", {
        type: "text",
        placeholder: t("common.search.placeholder"),
        "aria-label": opts.filterAriaLabel ?? t("common.search.placeholder"),
      }) as HTMLInputElement;

      const listEl = h("div");
      let activeIndex = -1;
      let visibleItems: { def: MenuItemDef; el: HTMLDivElement }[] = [];

      function renderItems(filterText: string): void {
        listEl.textContent = "";
        visibleItems = [];
        const needle = filterText.trim().toLowerCase();
        const matched = needle ? opts.items.filter((i) => i.label.toLowerCase().includes(needle)) : opts.items;
        if (matched.length === 0) {
          listEl.appendChild(h("div", { style: { padding: "8px 16px", color: "var(--mm-color-on-surface-variant)" } }, t("common.state.noMatches")));
          return;
        }
        matched.forEach((def) => {
          const el = h(
            "div.mm-menu__item",
            {
              role: "menuitem",
              "aria-disabled": def.disabled ? "true" : undefined,
              title: def.disabled && def.disabledReason ? def.disabledReason : undefined,
              onclick: () => {
                if (def.disabled) return;
                def.onSelect?.();
                close();
              },
            },
            h("span", {}, def.label),
            def.shortcut ? h("span.mm-menu__shortcut", { "aria-hidden": "true" }, def.shortcut) : null
          );
          listEl.appendChild(el);
          visibleItems.push({ def, el });
        });
        activeIndex = -1;
      }

      function setActive(index: number): void {
        visibleItems.forEach((it, i) => it.el.classList.toggle("mm-menu__item--active", i === index));
        if (index >= 0) visibleItems[index]?.el.scrollIntoView({ block: "nearest" });
        activeIndex = index;
      }

      filterInput.addEventListener("input", () => renderItems(filterInput.value));
      filterInput.addEventListener("keydown", (ev) => {
        if (ev.key === "ArrowDown") {
          ev.preventDefault();
          setActive(Math.min(visibleItems.length - 1, activeIndex + 1));
        } else if (ev.key === "ArrowUp") {
          ev.preventDefault();
          setActive(Math.max(0, activeIndex - 1));
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          const item = visibleItems[activeIndex];
          if (item && !item.def.disabled) {
            item.def.onSelect?.();
            close();
          }
        }
      });

      renderItems("");
      root.appendChild(h("div.mm-menu__filter", {}, filterInput));
      root.appendChild(listEl);
      return root;
    },
  });
}
