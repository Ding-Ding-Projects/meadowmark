/** The 5 daily tasks with a streak, plus a streak-claim action. */

import { h } from "../dom";
import { button } from "../components/button";
import { t } from "../i18n";
import { DailiesView, HostBridge } from "../contracts";

export function renderDailiesPanel(host: HTMLElement, view: DailiesView, bridge: HostBridge): () => void {
  const list = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });

  for (const task of view.tasks) {
    list.appendChild(
      h(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
        h("div", {}, t(task.descriptionKey, { progress: task.progress, goal: task.goal })),
        task.completed
          ? button({
              label: task.claimed ? t("panel.dailies.claimed") : t("panel.dailies.claim"),
              variant: task.claimed ? "text" : "tonal",
              disabled: task.claimed,
              disabledReason: task.claimed ? t("panel.dailies.alreadyClaimed") : undefined,
              onClick: () => bridge.dispatch({ type: "daily/claim", taskIndex: task.index }),
            })
          : h("span", { style: { fontSize: "var(--mm-type-body-small-size)", color: "var(--mm-color-on-surface-variant)" } }, t("panel.dailies.inProgress"))
      )
    );
  }

  const streakBlock = h(
    "div.mm-card.mm-card--outlined",
    { style: { padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" } },
    h("span", {}, t("panel.dailies.streak", { days: view.streakDays })),
    button({
      label: t("panel.dailies.claimStreak"),
      variant: "filled",
      disabled: view.streakRewardClaimedToday,
      disabledReason: view.streakRewardClaimedToday ? t("panel.dailies.streakAlreadyClaimed") : undefined,
      onClick: () => bridge.dispatch({ type: "daily/claimStreak" }),
    })
  );

  const panel = h(
    "section.mm-panel",
    { "aria-label": t("panel.dailies.title") },
    h("div.mm-panel__header", {}, h("h2.mm-panel__title", {}, t("panel.dailies.title"))),
    streakBlock,
    list
  );
  host.appendChild(panel);
  return () => panel.remove();
}
