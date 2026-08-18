import { h } from "../dom";
import { t } from "../i18n";

export type TabDock = "top" | "bottom" | "left" | "right";

export interface TabDef {
  id: string;
  label: string;
  panel?: HTMLElement;
  /** The real externally-rendered panel controlled by this tab. */
  controlsId?: string;
  closable?: boolean;
  onClose?: () => void;
}

export interface TabsOptions {
  tabs: TabDef[];
  activeId: string;
  dock?: TabDock;
  onActivate?: (id: string) => void;
  ariaLabel: string;
}

/**
 * Browser-style tabs. Docks to any edge (default: left is the caller's
 * choice via settings — this component itself does not choose a default,
 * see settings/ for the persisted docking preference).
 */
export function tabs(opts: TabsOptions): { root: HTMLDivElement; setActive: (id: string) => void } {
  const dock = opts.dock ?? "top";
  const isVertical = dock === "left" || dock === "right";
  const tabList = h("div", {
    class: `mm-tabs mm-tabs--${dock}`,
    role: "tablist",
    "aria-label": opts.ariaLabel,
    "aria-orientation": isVertical ? "vertical" : "horizontal",
  });
  const panelHost = h("div", { style: { flex: "1 1 auto", minWidth: "0", minHeight: "0" } });

  const buttons = new Map<string, HTMLButtonElement>();
  let activeId = opts.activeId;

  function renderTabButton(def: TabDef): HTMLButtonElement {
    const btn = h(
      "button.mm-tab",
      {
        role: "tab",
        id: `mm-tab-${def.id}`,
        "aria-selected": String(def.id === activeId),
        "aria-controls": def.controlsId ?? `mm-tabpanel-${def.id}`,
        tabindex: def.id === activeId ? "0" : "-1",
        onclick: () => setActive(def.id),
      },
      h("span", {}, def.label),
      def.closable
        ? h(
            "button.mm-tab__close",
            {
              type: "button",
              "aria-label": t("common.action.closeNamed", { name: def.label }),
              onclick: (ev: MouseEvent) => {
                ev.stopPropagation();
                def.onClose?.();
              },
              onkeydown: (ev: KeyboardEvent) => {
                // A real <button> already fires click on Enter/Space, but
                // the click handler's stopPropagation only runs on the
                // click event — stop the keydown here too so it never
                // bubbles into the tab's own arrow-key/activation handling.
                if (ev.key === "Enter" || ev.key === " ") ev.stopPropagation();
              },
            },
            "✕"
          )
        : null
    );
    return btn;
  }

  function orderedIds(): string[] {
    return opts.tabs.map((t) => t.id);
  }

  tabList.addEventListener("keydown", (ev) => {
    const ids = orderedIds();
    if (ids.length === 0) return;
    const idx = ids.indexOf(activeId);
    const forwardKey = isVertical ? "ArrowDown" : "ArrowRight";
    const backKey = isVertical ? "ArrowUp" : "ArrowLeft";
    if (ev.key === forwardKey) {
      ev.preventDefault();
      const nextId = ids[(idx + 1) % ids.length];
      if (nextId === undefined) return;
      setActive(nextId);
      buttons.get(activeId)?.focus();
    } else if (ev.key === backKey) {
      ev.preventDefault();
      const prevId = ids[(idx - 1 + ids.length) % ids.length];
      if (prevId === undefined) return;
      setActive(prevId);
      buttons.get(activeId)?.focus();
    } else if (ev.key === "Home" || ev.key === "End") {
      ev.preventDefault();
      const targetId = ev.key === "Home" ? ids[0] : ids[ids.length - 1];
      if (!targetId) return;
      setActive(targetId);
      buttons.get(targetId)?.focus();
    }
  });

  function render(): void {
    for (const [id, btn] of buttons) {
      btn.setAttribute("aria-selected", String(id === activeId));
      btn.tabIndex = id === activeId ? 0 : -1;
    }
    panelHost.textContent = "";
    const activeTab = opts.tabs.find((t) => t.id === activeId) ?? opts.tabs[0];
    if (activeTab?.panel) {
      activeTab.panel.setAttribute("role", "tabpanel");
      activeTab.panel.setAttribute("id", `mm-tabpanel-${activeTab.id}`);
      activeTab.panel.setAttribute("aria-labelledby", `mm-tab-${activeTab.id}`);
      activeTab.panel.setAttribute("tabindex", "0");
      panelHost.appendChild(activeTab.panel);
    }
  }

  function setActive(id: string): void {
    if (!opts.tabs.some((tab) => tab.id === id)) return;
    activeId = id;
    render();
    opts.onActivate?.(id);
  }

  for (const def of opts.tabs) {
    const btn = renderTabButton(def);
    buttons.set(def.id, btn);
    tabList.appendChild(btn);
  }
  render();

  const root = h("div", {
    style: { display: "flex", flexDirection: isVertical ? "row" : "column", height: "100%", minHeight: "0" },
  });
  root.appendChild(tabList);
  root.appendChild(panelHost);

  return { root, setActive };
}
