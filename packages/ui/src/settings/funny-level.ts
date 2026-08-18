/**
 * Two independent, persisted funny-level sliders (1 fully serious .. 5
 * maximum playfulness), one for English and one for Cantonese. These are
 * wired directly to the i18n store that every t() call reads, so moving a
 * slider changes rendered copy immediately across the whole app.
 */

import { h } from "../dom";
import { slider } from "../components/form-controls";
import { FunnyLevel, i18nStore, setFunnyLevel } from "../i18n";
import { t } from "../i18n";

export function funnyLevelSliders(): HTMLDivElement {
  const s = i18nStore.getSnapshot();

  const enSlider = slider({
    min: 1,
    max: 5,
    step: 1,
    value: s.funnyLevelEn,
    ariaLabel: t("settings.funnyLevel.englishLabel"),
    formatValue: (v) => t("settings.funnyLevel.value", { level: v }),
    onInput: (v) => setFunnyLevel("en", v as FunnyLevel),
  });

  const yueSlider = slider({
    min: 1,
    max: 5,
    step: 1,
    value: s.funnyLevelYue,
    ariaLabel: t("settings.funnyLevel.cantoneseLabel"),
    formatValue: (v) => t("settings.funnyLevel.value", { level: v }),
    onInput: (v) => setFunnyLevel("yue", v as FunnyLevel),
  });

  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: "12px" } },
    h("div", {}, h("label", {}, t("settings.funnyLevel.englishLabel")), enSlider),
    h("div", {}, h("label", {}, t("settings.funnyLevel.cantoneseLabel")), yueSlider),
    h(
      "p",
      { style: { fontSize: "var(--mm-type-body-small-size)", color: "var(--mm-color-on-surface-variant)" } },
      t("settings.funnyLevel.disclosure")
    )
  );
}
