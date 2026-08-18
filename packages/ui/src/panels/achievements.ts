/** Tiered achievements with per-tier progress and claim actions. */

import { h, clamp } from "../dom";
import { button } from "../components/button";
import { t } from "../i18n";
import { AchievementDef, HostBridge } from "../contracts";

export function renderAchievementsPanel(host: HTMLElement, achievements: AchievementDef[], bridge: HostBridge): () => void {
  const list = h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } });

  for (const achievement of achievements) {
    const tierRow = h(
      "div.mm-achievement-tier-row",
      {},
      ...achievement.tiers.map((tier, i) =>
        h("div.mm-achievement-tier", { class: `mm-achievement-tier ${achievement.claimed[i] ? "mm-achievement-tier--claimed" : ""}`.trim() })
      )
    );
    const currentTier = achievement.tiers[achievement.currentTierIndex];
    const canClaim = currentTier && achievement.progress >= currentTier.goal && !achievement.claimed[achievement.currentTierIndex];

    list.appendChild(
      h(
        "div.mm-card.mm-card--outlined",
        { style: { padding: "12px" } },
        h("strong", {}, t(achievement.nameKey)),
        h("div", { style: { fontSize: "var(--mm-type-body-small-size)", color: "var(--mm-color-on-surface-variant)" } }, t(achievement.descriptionKey)),
        tierRow,
        currentTier
          ? h("div", {}, t("panel.achievements.progress", { progress: achievement.progress, goal: currentTier.goal }))
          : h("div", {}, t("panel.achievements.maxed")),
        button({
          label: t("panel.achievements.claim"),
          variant: "filled",
          disabled: !canClaim,
          disabledReason: canClaim ? undefined : t("panel.achievements.notReady"),
          onClick: () => bridge.dispatch({ type: "achievement/claim", achievementId: achievement.id, tier: achievement.currentTierIndex }),
        })
      )
    );
  }

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.achievements.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.achievements.title"))),
    list
  );
  host.appendChild(panel);
  return () => panel.remove();
}
