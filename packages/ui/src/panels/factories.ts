/**
 * Factory list, per-factory production queue with slots, a recipe picker
 * showing ingredient availability, queue timers, and an honest
 * "queue paused: barn full" state rather than silently dropping output.
 */

import { h, formatDuration } from "../dom";
import { button } from "../components/button";
import { openMenu } from "../components/menu";
import { t } from "../i18n";
import { BarnView, FactoriesView, FactoryInstance, HostBridge, RecipeDef } from "../contracts";

function recipeAvailable(recipe: RecipeDef, barn: BarnView): boolean {
  return recipe.inputs.every((input) => (barn.stock[input.goodId] ?? 0) >= input.amount);
}

function renderRecipePicker(anchor: HTMLElement, factory: FactoryInstance, slotIndex: number, barn: BarnView, bridge: HostBridge): void {
  openMenu({
    anchor,
    filterAriaLabel: t("panel.factories.recipeFilterLabel"),
    items: factory.availableRecipes.map((recipe) => {
      const available = recipeAvailable(recipe, barn);
      const ingredientSummary = recipe.inputs
        .map((i) => `${t(barn.goodDefs[i.goodId]?.nameKey ?? i.goodId)} x${i.amount} (${barn.stock[i.goodId] ?? 0})`)
        .join(", ");
      return {
        id: recipe.id,
        label: `${t(recipe.nameKey)} — ${ingredientSummary}`,
        disabled: !available,
        disabledReason: available ? undefined : t("panel.factories.recipeMissingIngredients"),
        onSelect: () => bridge.dispatch({ type: "factory/queue", factoryId: factory.id, slotIndex, recipeId: recipe.id }),
      };
    }),
  });
}

function renderFactoryCard(factory: FactoryInstance, barn: BarnView, bridge: HostBridge, onNavigateToBarn: () => void): HTMLDivElement {
  const slotsRow = h("div.mm-queue-row", {});
  for (const slot of factory.slots) {
    let slotEl: HTMLElement;
    if (slot.recipeId === null) {
      const emptyBtn: HTMLButtonElement = h(
        "button.mm-queue-slot",
        { type: "button" },
        h("span", {}, t("panel.factories.emptySlot"))
      );
      emptyBtn.addEventListener("click", () => renderRecipePicker(emptyBtn, factory, slot.index, barn, bridge));
      slotEl = emptyBtn;
    } else {
      const recipe = factory.availableRecipes.find((r) => r.id === slot.recipeId);
      const ready = slot.readyAt !== null && slot.readyAt <= Date.now();
      const remaining = slot.readyAt ? Math.max(0, slot.readyAt - Date.now()) : 0;
      const paused = slot.pausedBarnFull;

      let statusEl: HTMLElement;
      let actionBtn: HTMLElement;
      if (paused) {
        statusEl = h("strong", { role: "status" }, t("panel.factories.pausedBarnFull"));
        // Barn-full is a cross-panel blocker: the fix (sell or upgrade the
        // barn) lives on a different tab, so the control jumps there
        // rather than sitting inert.
        actionBtn = button({ label: t("panel.factories.viewBarn"), variant: "text", onClick: onNavigateToBarn });
      } else if (ready) {
        statusEl = h("strong", { role: "status" }, t("common.state.ready"));
        actionBtn = button({
          label: t("panel.factories.collect"),
          variant: "filled",
          onClick: () => bridge.dispatch({ type: "factory/collect", factoryId: factory.id, slotIndex: slot.index }),
        });
      } else {
        statusEl = h("span", {}, formatDuration(remaining));
        actionBtn = button({
          label: t("common.action.cancel"),
          variant: "text",
          onClick: () => bridge.dispatch({ type: "factory/cancel", factoryId: factory.id, slotIndex: slot.index }),
        });
      }

      slotEl = h(
        "div.mm-queue-slot",
        { class: `mm-queue-slot mm-queue-slot--filled ${paused ? "mm-queue-slot--paused" : ""}`.trim() },
        h("span", {}, recipe ? t(recipe.nameKey) : slot.recipeId),
        statusEl,
        actionBtn
      );
    }
    slotsRow.appendChild(slotEl);
  }

  return h(
    "div.mm-card.mm-card--outlined",
    { style: { padding: "12px" } },
    h("h3", { style: { margin: "0 0 8px" } }, t(factory.nameKey)),
    slotsRow
  );
}

export function renderFactoriesPanel(host: HTMLElement, view: FactoriesView, barn: BarnView, bridge: HostBridge, onNavigateToBarn: () => void): () => void {
  const list = h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } });
  let tickHandle: number;

  function render(): void {
    list.textContent = "";
    if (view.factories.length === 0) {
      list.appendChild(h("div", {}, t("common.state.empty")));
      return;
    }
    for (const factory of view.factories) {
      list.appendChild(renderFactoryCard(factory, barn, bridge, onNavigateToBarn));
    }
  }

  render();
  tickHandle = window.setInterval(render, 1000);

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.factories.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.factories.title"))),
    list
  );
  host.appendChild(panel);

  return () => {
    clearInterval(tickHandle);
    panel.remove();
  };
}
