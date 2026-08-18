import { h } from "../dom";

export type TabDock = "top" | "bottom" | "left" | "right";

export interface TabDef {
  id: string;
  label: string;
  panel: HTMLElement;
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
        "aria-controls": `mm-tabpanel-${def.id}`,
        tabindex: def.id === activeId ? "0" : "-1",
        onclick: () => setActive(def.id),
      },
      h("span", {}, def.label),
      def.closable
        ? h(
            "span.mm-tab__close",
            {
              role: "button",
              "aria-label": `Close ${def.label}`,
              onclick: (ev: MouseEvent) => {
                ev.stopPropagation();
                def.onClose?.();
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
    const idx = ids.indexOf(activeId);
    const forwardKey = isVertical ? "ArrowDown" : "ArrowRight";
    const backKey = isVertical ? "ArrowUp" : "ArrowLeft";
    if (ev.key === forwardKey) {
      ev.preventDefault();
      setActive(ids[(idx + 1) % ids.length]);
      buttons.get(activeId)?.focus();
    } else if (ev.key === backKey) {
      ev.preventDefault();
      setActive(ids[(idx - 1 + ids.length) % ids.length]);
      buttons.get(activeId)?.focus();
    }
  });

  function render(): void {
    tabList.textContent = "";
    buttons.clear();
    for (const def of opts.tabs) {
      const btn = renderTabButton(def);
      buttons.set(def.id, btn);
      tabList.appendChild(btn);
    }
    panelHost.textContent = "";
    const activeTab = opts.tabs.find((t) => t.id === activeId) ?? opts.tabs[0];
    if (activeTab) {
      activeTab.panel.setAttribute("role", "tabpanel");
      activeTab.panel.setAttribute("id", `mm-tabpanel-${activeTab.id}`);
      activeTab.panel.setAttribute("aria-labelledby", `mm-tab-${activeTab.id}`);
      activeTab.panel.setAttribute("tabindex", "0");
      panelHost.appendChild(activeTab.panel);
    }
  }

  function setActive(id: string): void {
    activeId = id;
    render();
    opts.onActivate?.(id);
  }

  render();

  const root = h("div", {
    style: { display: "flex", flexDirection: isVertical ? "row" : "column", height: "100%", minHeight: "0" },
  });
  root.appendChild(tabList);
  root.appendChild(panelHost);

  return { root, setActive };
}
