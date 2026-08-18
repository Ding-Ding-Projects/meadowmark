/**
 * Local version history panel. Browses every revision the app has recorded
 * (game saves, settings changes), diffs and restores from them, and labels
 * revisions worth keeping — the UI half of packages/app/src/services/history.
 *
 * Mounted as its own "History" tab inside the settings surface (see
 * ../settings/index.ts), following the same wiring pattern the settings
 * tabs already use: a bridge module talks to window.meadowmark, this module
 * only renders what the bridge reports.
 */

import { h } from "../dom";
import { button } from "../components/button";
import { list, listItem } from "../components/list";
import { openDialog } from "../components/dialog";
import { compileGuardedRegex, searchField } from "../search/regex-builder";
import { t } from "../i18n";
import {
  exportHistory,
  hasHistoryBridge,
  initHistory,
  labelRevision,
  listRevisions,
  restoreRevision,
  Revision,
} from "./bridge";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function renderHistoryPanel(): HTMLElement {
  const statusEl = h("p.mm-history__status", { role: "status" }, t("history.loading"));
  const searchResultsEl = h("div.mm-history__list", {});
  const exportBtn = button({
    label: t("history.exportAction"),
    variant: "outlined",
    disabled: true,
    disabledReason: t("history.unavailableReason"),
  });

  let allRevisions: Revision[] = [];
  let currentQuery = "";

  function matchesQuery(revision: Revision, query: string): boolean {
    if (!query) return true;
    const regex = compileGuardedRegex(query, "i");
    const haystack = `${revision.message} ${revision.action ?? ""} ${revision.filesChanged.join(" ")}`;
    if (regex) return regex.test(haystack);
    return haystack.toLowerCase().includes(query.toLowerCase());
  }

  function renderList(): void {
    searchResultsEl.textContent = "";
    const filtered = allRevisions.filter((rev) => matchesQuery(rev, currentQuery));
    if (filtered.length === 0) {
      searchResultsEl.appendChild(h("div", {}, t(allRevisions.length === 0 ? "history.empty" : "common.state.noMatches")));
      return;
    }
    const items = filtered.map((revision) =>
      listItem({
        titleText: revision.message,
        subtitleText: `${formatDate(revision.date)} · ${revision.filesChanged.join(", ")}${
          revision.labels.length ? ` · ${revision.labels.join(", ")}` : ""
        }`,
        trailing: h(
          "div",
          { style: { display: "flex", gap: "8px" } },
          button({
            label: t("history.labelAction"),
            variant: "text",
            onClick: () => void promptLabel(revision),
          }),
          button({
            label: t("history.restoreAction"),
            variant: "tonal",
            onClick: () => void confirmRestore(revision),
          })
        ),
      })
    );
    searchResultsEl.appendChild(list(...items));
  }

  async function promptLabel(revision: Revision): Promise<void> {
    const input = h("input.mm-text-field__input", {
      type: "text",
      "aria-label": t("history.labelPromptLabel"),
      placeholder: t("history.labelPromptLabel"),
    }) as HTMLInputElement;
    const dialog = openDialog({
      titleKey: "history.labelDialogTitle",
      body: [input],
      actions: [
        button({
          label: t("common.action.cancel"),
          variant: "text",
          onClick: () => dialog.close(),
        }),
        button({
          label: t("history.labelAction"),
          variant: "filled",
          onClick: () => {
            const value = input.value.trim();
            dialog.close();
            if (value) {
              void labelRevision(revision.hash, value).then((ok) => {
                if (ok) void refresh();
              });
            }
          },
        }),
      ],
    });
    input.focus();
  }

  async function confirmRestore(revision: Revision): Promise<void> {
    const firstPath = revision.filesChanged[0];
    if (!firstPath) return;
    const dialog = openDialog({
      titleKey: "history.restoreDialogTitle",
      titleVars: { path: firstPath },
      body: [h("p", {}, t("history.restoreDialogBody", { message: revision.message }))],
      actions: [
        button({
          label: t("common.action.cancel"),
          variant: "text",
          onClick: () => dialog.close(),
        }),
        button({
          label: t("history.restoreAction"),
          variant: "danger",
          onClick: () => {
            dialog.close();
            void restoreRevision(revision.hash, firstPath).then(() => void refresh());
          },
        }),
      ],
    });
  }

  async function refresh(): Promise<void> {
    const availability = await initHistory();
    if (!availability.available) {
      statusEl.textContent = t("history.unavailable", { reason: availability.reason ?? "" });
      searchResultsEl.textContent = "";
      return;
    }
    allRevisions = await listRevisions({ limit: 100 });
    exportBtn.disabled = false;
    exportBtn.removeAttribute("title");
    statusEl.textContent = t("history.available", { count: allRevisions.length });
    renderList();
  }

  exportBtn.addEventListener("click", () => {
    void exportHistory({ format: "text" }).then((text) => {
      if (text) void navigator.clipboard?.writeText(text).catch(() => undefined);
    });
  });

  const { el: searchEl } = searchField({
    ariaLabel: t("history.searchLabel"),
    onChange: (state) => {
      currentQuery = state.mode === "regex" ? state.pattern : state.query;
      renderList();
    },
  });

  const root = h(
    "div.mm-history",
    { style: { display: "flex", flexDirection: "column", gap: "12px" } },
    statusEl,
    hasHistoryBridge() ? h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, searchEl, exportBtn) : null,
    searchResultsEl
  );

  void refresh();

  return root;
}
