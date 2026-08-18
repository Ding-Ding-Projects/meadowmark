/**
 * Persistent heads-up display: coins, cash, XP bar with level, population,
 * energy, barn fill. Each stat has an icon and a live value bound to the
 * game state store, so this never needs to be told to refresh.
 *
 * The stat tiles are built ONCE and updated in place on every state change
 * rather than torn down and rebuilt: that is what lets a resource gain read
 * as a *change* (an animated count-up, a floating "+N", a level-up pulse)
 * instead of a value that silently snaps to something new. The very first
 * render never animates or celebrates anything — there is no "previous
 * value" to compare against on boot, only a real change earns the readout.
 *
 * Visually this is styled as game furniture (capsule readouts with an
 * overhanging circular badge, a glossy XP bar) rather than flat design-
 * system chips — see hud.css. Nothing here changes what a readout means or
 * what number it shows; the value-change "pop" below is a presentation
 * layer over an already-correct figure, never a delay of it, and the
 * accessible label always carries the real (final) value regardless of
 * whether the pop animation is currently running.
 */

import { h, formatCompactNumber, formatMoney, clamp, animateValue, prefersReducedMotion } from "../dom";
import { progressLinear, updateProgressLinear } from "../components/progress";
import { attachTooltip } from "../components/tooltip";
import { spawnFloatingText, celebrate } from "../effects/feedback";
import { notifySuccess } from "../notifications";
import { t } from "../i18n";
import { GameStateView, ReadonlyStore } from "../contracts";

interface StatTileHandle {
  el: HTMLDivElement;
  valueEl: HTMLSpanElement;
  fillBarEl: HTMLDivElement | null;
}

/** Options for a fill-capable stat (population, energy): the readout shows
 * a "how full" track under the number, not only the bare N/cap figure. */
interface StatTileOptions {
  withFill?: boolean;
}

function statTile(modifierClass: string, iconHtml: string, ariaLabel: string, options: StatTileOptions = {}): StatTileHandle {
  const badge = h("span.mm-hud-stat__badge", { "aria-hidden": "true" });
  badge.innerHTML = iconHtml;
  const valueEl = h("span.mm-hud-stat__value", {}, "");

  const withFill = options.withFill === true;
  const fillBarEl = h("div.mm-hud-stat__fill-bar", { style: { width: "0%" } });
  const fillEl = h("div.mm-hud-stat__fill", { "aria-hidden": "true" }, fillBarEl);

  const classes = ["mm-hud-stat", modifierClass];
  if (withFill) classes.push("mm-hud-stat--with-fill");

  const el = h(
    "div",
    { class: classes.join(" "), role: "group", "aria-label": ariaLabel },
    badge,
    valueEl,
    withFill ? fillEl : null
  );
  attachTooltip(el, ariaLabel);
  return { el, valueEl, fillBarEl: withFill ? fillBarEl : null };
}

const ICONS = {
  coins: "🪙",
  cash: "💵",
  population: "🏠",
  energy: "⚡",
  barn: "🏚️",
};

/** Briefly pops and colour-flashes a value span to mark a real change.
 * Restartable: a second change arriving mid-animation removes and
 * re-adds the class after a reflow, exactly like the existing
 * effects/feedback.ts `celebrate()` helper, so rapid-fire gains each get
 * their own visible pop instead of the first one being swallowed. */
function popValue(el: HTMLElement): void {
  el.classList.remove("mm-hud-stat__value--pop");
  void el.offsetWidth;
  el.classList.add("mm-hud-stat__value--pop");
  const durationMs = prefersReducedMotion() ? 50 : 400;
  window.setTimeout(() => el.classList.remove("mm-hud-stat__value--pop"), durationMs);
}

export function mountHud(host: HTMLElement, state$: ReadonlyStore<GameStateView>): () => void {
  const root = h("div.mm-hud", { role: "region", "aria-label": t("hud.regionLabel") });
  const currencyCluster = h("div.mm-hud-cluster.mm-hud-cluster--currency", {});
  const statusCluster = h("div.mm-hud-cluster.mm-hud-cluster--status", {});
  root.appendChild(currencyCluster);
  root.appendChild(statusCluster);
  host.appendChild(root);

  const coinsTile = statTile("mm-hud-stat--coins", ICONS.coins, t("hud.coins.label", { value: 0 }));
  const cashTile = statTile("mm-hud-stat--cash", ICONS.cash, t("hud.cash.label", { value: formatMoney(0) }));
  const populationTile = statTile("mm-hud-stat--population", ICONS.population, t("hud.population.label", { current: 0, cap: 0 }), {
    withFill: true,
  });
  const energyTile = statTile("mm-hud-stat--energy", ICONS.energy, t("hud.energy.label", { current: 0, cap: 0 }), {
    withFill: true,
  });

  const xpLevelBadge = h("span.mm-hud-xp__level", {}, "");
  const xpBar = progressLinear(0, "");
  const xpBlock = h("div.mm-hud-xp", { role: "group", "aria-label": "" }, xpLevelBadge, h("div.mm-hud-xp__bar", {}, xpBar));

  const barnIcon = h("span.mm-hud-barn__icon", { "aria-hidden": "true" }, ICONS.barn);
  const barnBar = progressLinear(0, "");
  const barnBlock = h("div.mm-hud-barn", { role: "group", "aria-label": "" }, barnIcon, h("div.mm-hud-barn__bar", {}, barnBar));

  currencyCluster.appendChild(coinsTile.el);
  currencyCluster.appendChild(cashTile.el);
  statusCluster.appendChild(xpBlock);
  statusCluster.appendChild(populationTile.el);
  statusCluster.appendChild(energyTile.el);
  statusCluster.appendChild(barnBlock);

  // Live-displayed (mid-tween) values, distinct from the real state values,
  // so a second resource gain arriving mid-animation restarts the tween
  // from wherever the number currently reads rather than from the old
  // target — no visible jump backwards.
  let displayedCoins = 0;
  let displayedCash = 0;
  let firstRender = true;
  let previous: GameStateView["resources"] | null = null;

  // aria-label is set to the real (final) value separately, right below,
  // regardless of animation state — the tween is a sighted-only readability
  // aid and must never delay the true value reaching assistive technology.
  function animateStat(tile: StatTileHandle, from: number, to: number, format: (n: number) => string): void {
    animateValue(from, to, 500, (v) => {
      tile.valueEl.textContent = format(v);
    });
  }

  function setFill(tile: StatTileHandle, fraction: number): void {
    if (!tile.fillBarEl) return;
    tile.fillBarEl.style.width = `${Math.round(clamp(fraction, 0, 1) * 100)}%`;
  }

  function render(state: GameStateView): void {
    const r = state.resources;
    const xpFraction = clamp(r.xp / Math.max(1, r.xpForNextLevel), 0, 1);

    if (firstRender) {
      coinsTile.valueEl.textContent = formatCompactNumber(r.coins);
      cashTile.valueEl.textContent = formatMoney(r.cash);
      displayedCoins = r.coins;
      displayedCash = r.cash;
    } else if (previous) {
      if (r.coins !== previous.coins) {
        animateStat(coinsTile, displayedCoins, r.coins, (n) => formatCompactNumber(Math.round(n)));
        popValue(coinsTile.valueEl);
        if (r.coins > previous.coins) {
          const gainText = `+${formatCompactNumber(r.coins - previous.coins)}`;
          spawnFloatingText(coinsTile.el, gainText, "coins", t("hud.coins.label", { value: r.coins }));
        }
        displayedCoins = r.coins;
      }
      if (r.cash !== previous.cash) {
        animateStat(cashTile, displayedCash, r.cash, (n) => formatMoney(Math.round(n)));
        popValue(cashTile.valueEl);
        if (r.cash > previous.cash) {
          const gainText = `+${formatMoney(r.cash - previous.cash)}`;
          spawnFloatingText(cashTile.el, gainText, "cash", t("hud.cash.label", { value: formatMoney(r.cash) }));
        }
        displayedCash = r.cash;
      }
      if (r.population !== previous.population) popValue(populationTile.valueEl);
      if (r.energy !== previous.energy) popValue(energyTile.valueEl);
      if (r.xp > previous.xp) {
        const xpGainText = t("hud.gain.xp", { value: r.xp - previous.xp });
        spawnFloatingText(xpBlock, xpGainText, "xp", xpGainText);
      }
      if (r.level > previous.level) {
        celebrate(xpBlock);
        notifySuccess(t("hud.levelUp.toast", { level: r.level }));
      }
    }

    coinsTile.el.setAttribute("aria-label", t("hud.coins.label", { value: r.coins }));
    cashTile.el.setAttribute("aria-label", t("hud.cash.label", { value: formatMoney(r.cash) }));
    populationTile.valueEl.textContent = `${r.population}/${r.populationCap}`;
    populationTile.el.setAttribute("aria-label", t("hud.population.label", { current: r.population, cap: r.populationCap }));
    setFill(populationTile, r.population / Math.max(1, r.populationCap));
    energyTile.valueEl.textContent = `${r.energy}/${r.energyCap}`;
    energyTile.el.setAttribute("aria-label", t("hud.energy.label", { current: r.energy, cap: r.energyCap }));
    setFill(energyTile, r.energy / Math.max(1, r.energyCap));

    xpLevelBadge.textContent = t("hud.xp.levelBadge", { level: r.level });
    xpBlock.setAttribute("aria-label", t("hud.xp.label", { level: r.level }));
    updateProgressLinear(xpBar, xpFraction, t("hud.xp.progressLabel", { xp: r.xp, next: r.xpForNextLevel }));

    const barnFraction = clamp(state.barn.used / Math.max(1, state.barn.capacity), 0, 1);
    barnBlock.setAttribute("aria-label", t("hud.barn.label", { used: state.barn.used, cap: state.barn.capacity }));
    updateProgressLinear(barnBar, barnFraction, t("hud.barn.progressLabel", { used: state.barn.used, cap: state.barn.capacity }));

    previous = r;
    firstRender = false;
  }

  const unsubscribe = state$.subscribe(render);
  render(state$.getSnapshot());

  return () => {
    unsubscribe();
    root.remove();
  };
}
