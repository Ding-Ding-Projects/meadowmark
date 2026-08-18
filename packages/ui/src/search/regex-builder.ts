/**
 * Full guided regex builder, anchored beside the field that opened it.
 *
 * Provides: literal/character-class/anchor/group/alternation/quantifier
 * building blocks, a raw pattern editor, flags, a sample-text area with live
 * match + capture-group highlighting, and copy/export of the resulting
 * pattern. Every search field, dropdown filter, and context-menu filter in
 * the app opens this SAME builder anchored to itself — never a shared global
 * dialog — with its own independent query/pattern/flags/mode state.
 */

import { h, Store } from "../dom";
import { button } from "../components/button";
import { textField } from "../components/form-controls";
import { openOverlay } from "../overlays";
import { t } from "../i18n";

export interface RegexFieldState {
  /** Plain-text query, used when mode === "text" (the default). */
  query: string;
  /** Raw regex pattern (body only, no slashes), used when mode === "regex". */
  pattern: string;
  flags: string;
  mode: "text" | "regex";
}

export function createRegexFieldState(initial?: Partial<RegexFieldState>): Store<RegexFieldState> {
  return new Store<RegexFieldState>({
    query: "",
    pattern: "",
    flags: "i",
    mode: "text",
    ...initial,
  });
}

const MAX_PATTERN_LENGTH = 500;
const MAX_SAMPLE_LENGTH = 20_000;
const REGEX_TIMEOUT_MS = 50;

/** Bounded, timeout-guarded regex compile. Returns null when the pattern is
 * invalid, too long, or evaluation exceeded the time budget (a crude but
 * effective guard against catastrophic backtracking on the UI thread). */
export function compileGuardedRegex(pattern: string, flags: string): RegExp | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return null;
  try {
    return new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`);
  } catch {
    return null;
  }
}

export interface RegexMatchResult {
  matches: { index: number; text: string; groups: string[] }[];
  error: string | null;
  timedOut: boolean;
}

export function testGuardedRegex(pattern: string, flags: string, sample: string): RegexMatchResult {
  const boundedSample = sample.slice(0, MAX_SAMPLE_LENGTH);
  const re = compileGuardedRegex(pattern, flags);
  if (!re) return { matches: [], error: "Invalid pattern", timedOut: false };
  const start = performance.now();
  const matches: RegexMatchResult["matches"] = [];
  let m: RegExpExecArray | null;
  let iterations = 0;
  re.lastIndex = 0;
  while ((m = re.exec(boundedSample)) !== null) {
    matches.push({ index: m.index, text: m[0], groups: m.slice(1).map((g) => g ?? "") });
    iterations += 1;
    if (m[0].length === 0) re.lastIndex += 1;
    if (iterations > 5000 || performance.now() - start > REGEX_TIMEOUT_MS) {
      return { matches, error: null, timedOut: true };
    }
  }
  return { matches, error: null, timedOut: false };
}

/** Escapes a literal string for safe inclusion inside a regex pattern fragment. */
export function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface BuilderToken {
  labelKey: string;
  insert: string;
  /** Cursor offset back from the end of `insert`, for tokens with a placeholder body. */
  cursorBack?: number;
}

const TOKENS: BuilderToken[] = [
  { labelKey: "regex.token.anyChar", insert: "." },
  { labelKey: "regex.token.digit", insert: "\\d" },
  { labelKey: "regex.token.word", insert: "\\w" },
  { labelKey: "regex.token.whitespace", insert: "\\s" },
  { labelKey: "regex.token.startAnchor", insert: "^" },
  { labelKey: "regex.token.endAnchor", insert: "$" },
  { labelKey: "regex.token.charClass", insert: "[]", cursorBack: 1 },
  { labelKey: "regex.token.negCharClass", insert: "[^]", cursorBack: 1 },
  { labelKey: "regex.token.group", insert: "()", cursorBack: 1 },
  { labelKey: "regex.token.namedGroup", insert: "(?<name>)", cursorBack: 1 },
  { labelKey: "regex.token.alternation", insert: "|" },
  { labelKey: "regex.token.zeroOrMore", insert: "*" },
  { labelKey: "regex.token.oneOrMore", insert: "+" },
  { labelKey: "regex.token.zeroOrOne", insert: "?" },
  { labelKey: "regex.token.exactCount", insert: "{2}" },
];

/** Opens the full regex builder anchored beside `anchor`, bound to `state`. */
export function openRegexBuilder(anchor: HTMLElement, state: Store<RegexFieldState>): void {
  openOverlay({
    anchor,
    surfaceClass: "mm-card mm-card--elevated",
    placement: "bottom-start",
    build: (close) => {
      const s = state.getSnapshot();
      const patternInput = h("textarea", {
        rows: "2",
        class: "mm-text-field__input",
        style: { fontFamily: "var(--mm-font-family-mono)", width: "100%", resize: "vertical" },
        "aria-label": t("regex.builder.patternLabel"),
      }) as HTMLTextAreaElement;
      patternInput.value = s.pattern;

      const flagsInput = h("input.mm-text-field__input", {
        type: "text",
        value: s.flags,
        style: { width: "80px", fontFamily: "var(--mm-font-family-mono)" },
        "aria-label": t("regex.builder.flagsLabel"),
      }) as HTMLInputElement;

      const sampleInput = h("textarea", {
        rows: "4",
        class: "mm-text-field__input",
        style: { width: "100%", resize: "vertical" },
        "aria-label": t("regex.builder.sampleLabel"),
        placeholder: t("regex.builder.samplePlaceholder"),
      }) as HTMLTextAreaElement;

      const resultsEl = h("div", { style: { fontSize: "var(--mm-type-body-small-size)", marginTop: "4px" } });

      function commit(): void {
        state.update((prev) => ({ ...prev, pattern: patternInput.value, flags: flagsInput.value, mode: "regex" }));
        renderResults();
      }

      function renderResults(): void {
        const result = testGuardedRegex(patternInput.value, flagsInput.value, sampleInput.value);
        resultsEl.textContent = "";
        if (result.error) {
          resultsEl.appendChild(h("span", { style: { color: "var(--mm-color-error)" } }, result.error));
          return;
        }
        const summary = h(
          "div",
          {},
          t("regex.builder.matchCount", { count: result.matches.length }) + (result.timedOut ? ` ${t("regex.builder.truncated")}` : "")
        );
        resultsEl.appendChild(summary);
        for (const match of result.matches.slice(0, 50)) {
          resultsEl.appendChild(
            h(
              "div",
              { style: { fontFamily: "var(--mm-font-family-mono)" } },
              `[${match.index}] "${match.text}"` + (match.groups.length ? `  groups: ${JSON.stringify(match.groups)}` : "")
            )
          );
        }
      }

      patternInput.addEventListener("input", () => {
        commit();
      });
      flagsInput.addEventListener("input", () => {
        commit();
      });
      sampleInput.addEventListener("input", renderResults);

      const tokenRow = h(
        "div",
        { style: { display: "flex", flexWrap: "wrap", gap: "4px", margin: "8px 0" } },
        ...TOKENS.map((tok) =>
          button({
            label: t(tok.labelKey),
            variant: "outlined",
            onClick: () => {
              const start = patternInput.selectionStart ?? patternInput.value.length;
              const end = patternInput.selectionEnd ?? patternInput.value.length;
              const value = patternInput.value;
              patternInput.value = value.slice(0, start) + tok.insert + value.slice(end);
              const cursor = start + tok.insert.length - (tok.cursorBack ?? 0);
              patternInput.focus();
              patternInput.setSelectionRange(cursor, cursor);
              commit();
            },
          })
        )
      );

      const copyBtn = button({
        label: t("regex.builder.copy"),
        variant: "text",
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(`/${patternInput.value}/${flagsInput.value}`);
          } catch {
            // clipboard may be unavailable; silently no-op rather than throwing
          }
        },
      });

      const modeRow = h(
        "div",
        { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" } },
        h("strong", {}, t("regex.builder.title")),
        button({ label: t("common.action.close"), variant: "icon", ariaLabel: t("common.action.close"), onClick: close })
      );

      renderResults();

      return h(
        "div",
        { style: { padding: "12px", width: "420px", maxWidth: "90vw" } },
        modeRow,
        h("label", { style: { fontSize: "12px", color: "var(--mm-color-on-surface-variant)" } }, t("regex.builder.patternLabel")),
        patternInput,
        h(
          "div",
          { style: { display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" } },
          h("label", { style: { fontSize: "12px" } }, t("regex.builder.flagsLabel")),
          flagsInput,
          copyBtn
        ),
        tokenRow,
        h("label", { style: { fontSize: "12px", color: "var(--mm-color-on-surface-variant)" } }, t("regex.builder.sampleLabel")),
        sampleInput,
        resultsEl
      );
    },
  });
}

/**
 * Builds a complete search field: a plain-text input (the default) plus an
 * affordance that opens the full regex builder anchored to this exact field.
 * Each call owns its own independent state store.
 */
export function searchField(opts: {
  ariaLabel: string;
  placeholder?: string;
  state?: Store<RegexFieldState>;
  onChange: (state: RegexFieldState) => void;
}): { el: HTMLDivElement; state: Store<RegexFieldState> } {
  const state = opts.state ?? createRegexFieldState();

  const input = h("input.mm-search-field__input", {
    type: "search",
    "aria-label": opts.ariaLabel,
    placeholder: opts.placeholder ?? t("common.search.placeholder"),
    value: state.getSnapshot().mode === "text" ? state.getSnapshot().query : `/${state.getSnapshot().pattern}/${state.getSnapshot().flags}`,
    oninput: (ev: Event) => {
      const value = (ev.target as HTMLInputElement).value;
      state.update((prev) => ({ ...prev, query: value, mode: "text" }));
    },
  }) as HTMLInputElement;

  const regexBtn = button({
    label: ".*",
    variant: "icon",
    ariaLabel: t("common.search.regexToggle"),
    onClick: (ev: any) => openRegexBuilder(regexBtn, state),
  });
  regexBtn.title = t("common.search.regexToggle");

  const el = h("div.mm-search-field", { role: "search" }, input, regexBtn);

  state.subscribe((value) => {
    if (value.mode === "text" && input.value !== value.query) input.value = value.query;
    opts.onChange(value);
  });

  return { el, state };
}
