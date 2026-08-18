/**
 * Persistent heads-up display: coins, cash, XP bar with level, population,
 * energy, barn fill. Each stat has an icon and a live value bound to the
 * game state store, so this never needs to be told to refresh.
 */

import { h, formatCompactNumber, formatMoney, clamp } from "../dom";
import { progressLinear } from "../components/progress";
import { attachTooltip } from "../components/tooltip";
import { t } from "../i18n";
import { GameStateView, ReadonlyStore } from "../contracts";

function statTile(iconHtml: string, valueText: string, ariaLabel: string): HTMLDivElement {
  const icon = h("span.mm-hud-stat__icon", { "aria-hidden": "true" });
  icon.innerHTML = iconHtml;
  const el = h("div.mm-hud-stat", { role: "group", "aria-label": ariaLabel }, icon, h("span.mm-hud-stat__value", {}, valueText));
  attachTooltip(el, ariaLabel);
  return el;
}

const ICONS = {
  coins: "🪙",
  cash: "💵",
  population: "🏠",
  energy: "⚡",
  barn: "🏚️",
};

export function mountHud(host: HTMLElement, state$: ReadonlyStore<GameStateView>): () => void {
  const root = h("div.mm-hud", { role: "region", "aria-label": t("hud.regionLabel") });
  host.appendChild(root);

  function render(state: GameStateView): void {
    root.textContent = "";
    const r = state.resources;
    const xpFraction = clamp(r.xp / Math.max(1, r.xpForNextLevel), 0, 1);

    root.appendChild(statTile(ICONS.coins, formatCompactNumber(r.coins), t("hud.coins.label", { value: r.coins })));
    root.appendChild(statTile(ICONS.cash, formatMoney(r.cash), t("hud.cash.label", { value: formatMoney(r.cash) })));

    const xpBlock = h(
      "div.mm-hud-xp",
      { role: "group", "aria-label": t("hud.xp.label", { level: r.level }) },
      h("span.mm-hud-xp__level", {}, t("hud.xp.levelBadge", { level: r.level })),
      h("div.mm-hud-xp__bar", {}, progressLinear(xpFraction, t("hud.xp.progressLabel", { xp: r.xp, next: r.xpForNextLevel })))
    );
    root.appendChild(xpBlock);

    root.appendChild(
      statTile(ICONS.population, `${r.population}/${r.populationCap}`, t("hud.population.label", { current: r.population, cap: r.populationCap }))
    );
    root.appendChild(statTile(ICONS.energy, `${r.energy}/${r.energyCap}`, t("hud.energy.label", { current: r.energy, cap: r.energyCap })));

    const barnFraction = clamp(state.barn.used / Math.max(1, state.barn.capacity), 0, 1);
    const barnBlock = h(
      "div.mm-hud-barn",
      { role: "group", "aria-label": t("hud.barn.label", { used: state.barn.used, cap: state.barn.capacity }) },
      h("span.mm-hud-stat__icon", { "aria-hidden": "true" }, ICONS.barn),
      h("div.mm-hud-barn__bar", {}, progressLinear(barnFraction, t("hud.barn.progressLabel", { used: state.barn.used, cap: state.barn.capacity })))
    );
    root.appendChild(barnBlock);
  }

  const unsubscribe = state$.subscribe(render);
  render(state$.getSnapshot());

  return () => {
    unsubscribe();
    root.remove();
  };
}
