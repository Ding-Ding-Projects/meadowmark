import { button } from "../components/button";
import { select } from "../components/select";
import { slider, switchControl, textField } from "../components/form-controls";
import { h, uid } from "../dom";
import { i18nStore, setFunnyLevel, setLanguageMode, type FunnyLevel, type LanguageMode } from "../i18n";
import { attachContextMenu } from "../menus/context-menu";
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from "../notifications";
import { registerPaletteSource } from "../palette/command-palette";
import { searchField, type RegexFieldState } from "../search/regex-builder";
import { settingsStore } from "../settings/store";
import { setDensityScale, setTheme } from "../tokens";
import {
  capabilityReason,
  safeHostCall,
  universalHostBridge,
  type CatalogStateView,
  type OllamaDiagnosisView,
} from "./bridge";
import {
  CONVERTER_ADAPTERS,
  CONVERTER_CATEGORIES,
  convertQueueItem,
  type ConversionQueueItem,
  type ConverterAdapter,
  type ConverterCategory,
} from "./converter";
import {
  UNIVERSAL_SURFACE_IDS,
  assertUniversalSurfaceContract,
  universalUiStore,
  validatePersonalVocabulary,
  type NarratorLanguage,
  type ScheduleRule,
  type ScheduleWeekday,
} from "./state";

export type UniversalSurfaceId = (typeof UNIVERSAL_SURFACE_IDS)[number];

interface UniversalSurfaceDef {
  id: UniversalSurfaceId;
  group: "Core" | "Tools" | "Help";
  en: string;
  yue: string;
  render: () => HTMLElement;
}

let paletteRegistered = false;
let activateCurrentSurface: ((id: UniversalSurfaceId) => void) | null = null;

function local(en: string, yue: string, playfulEn?: string, playfulYue?: string): string {
  const state = i18nStore.getSnapshot();
  const enText = state.funnyLevelEn >= 4 && playfulEn ? `${en} ${playfulEn}` : en;
  const yueText = state.funnyLevelYue >= 4 && playfulYue ? `${yue} ${playfulYue}` : yue;
  if (state.language === "en") return enText;
  if (state.language === "yue") return yueText;
  return `${enText} — ${yueText}`;
}

function section(title: string, description: string, ...children: HTMLElement[]): HTMLElement {
  return h(
    "section.mm-universal-section",
    { "data-mm-editable": title, tabindex: "-1" },
    h("div.mm-universal-section__heading", {}, h("h3", {}, title), h("p", {}, description)),
    ...children,
  );
}

function fieldRow(label: string, control: HTMLElement, detail?: string): HTMLElement {
  return h(
    "div.mm-universal-field",
    {},
    h("div.mm-universal-field__copy", {}, h("strong", {}, label), detail ? h("span", {}, detail) : null),
    control,
  );
}

function emptyState(title: string, detail: string): HTMLElement {
  return h("div.mm-universal-empty", { role: "status" }, h("strong", {}, title), h("span", {}, detail));
}

function bridgeButton(label: string, seam: string, operation: (() => Promise<unknown>) | undefined): HTMLButtonElement {
  const reason = capabilityReason(operation, seam);
  return button({
    label,
    variant: "tonal",
    disabled: !!reason,
    disabledReason: reason ?? undefined,
    onClick: () => {
      void safeHostCall(operation, reason ?? `Unavailable: ${seam}.`).then((result) => {
        if (result.ok) notifySuccess(local(`${label} completed.`, `${label} 完成咗。`, "Tiny victory, no confetti cannon required.", "細細個勝利，唔使開大炮。"));
        else notifyError(result.error);
      });
    },
  });
}

function factualSummary(value: object): string {
  return Object.entries(value)
    .filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item))
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(" · ");
}

function renderStatusSurface(): HTMLElement {
  const bridge = universalHostBridge();
  const appInfo = h("div", { role: "status", "aria-live": "polite" }, local("Loading application identity…", "載入應用程式身份中…"));
  const status = h("div", { role: "status", "aria-live": "polite" }, local("Loading current status…", "載入目前狀態中…"));
  const update = h("div", { role: "status", "aria-live": "polite" }, local("Loading update state…", "載入更新狀態中…"));

  void safeHostCall(bridge.appInfo, "window.meadowmark.appInfo()").then((result) => {
    appInfo.textContent = result.ok
      ? `${result.value.name} ${result.value.version} · ${result.value.platform}${result.value.isDev ? " · development" : ""}`
      : result.error;
  });
  void safeHostCall(bridge.status?.snapshot, "window.meadowmark.status.snapshot()").then((result) => {
    status.textContent = result.ok
      ? `${result.value.checkedAt} · vault ${result.value.secureVaultAvailable ? "available" : "unavailable"} · Ollama ${result.value.ollama.state} · updater ${result.value.updater.status}`
      : result.error;
  });
  void safeHostCall(bridge.updater?.state, "window.meadowmark.updater.state()").then((result) => {
    if (!result.ok) {
      update.textContent = result.error;
      return;
    }
    update.textContent = `${result.value.status} · ${factualSummary(result.value)} · unsigned package`;
  });

  let displayName = universalUiStore.getSnapshot().displayName;
  const rename = textField({
    labelText: local("Display name", "顯示名稱"),
    value: displayName,
    helpText: local("Changes presentation only; package identity and data paths stay unchanged.", "只會改顯示；套件身份同資料路徑唔會改。"),
    onInput: (value) => { displayName = value; },
    trailingEl: button({
      label: local("Apply", "套用"),
      variant: "tonal",
      disabled: !bridge.settings?.set,
      disabledReason: capabilityReason(bridge.settings?.set, 'window.meadowmark.settings.set("displayName", name)') ?? undefined,
      onClick: () => {
        const clean = displayName.trim();
        if (!clean || clean.length > 80) {
          notifyError(local("Display name must be 1-80 characters.", "顯示名稱要 1 至 80 個字。"));
          return;
        }
        void safeHostCall(() => bridge.settings!.set!("displayName", clean), 'window.meadowmark.settings.set("displayName", name)').then((result) => {
          if (!result.ok) notifyError(result.error);
          else {
            universalUiStore.update((state) => ({ ...state, displayName: clean }));
            notifySuccess(local("Display name updated.", "顯示名稱更新咗。"));
          }
        });
      },
    }),
  });

  return h(
    "div.mm-universal-stack",
    {},
    section(local("Application", "應用程式"), local("Live identity from the installed host.", "由已安裝主程式提供嘅即時身份。"), appInfo, rename),
    section(local("Status Hub", "狀態中心"), local("Evidence-backed state; an unavailable bridge is shown as unavailable.", "只顯示有證據嘅狀態；橋接唔存在就會如實講。"), status),
    section(
      local("Updates", "更新"),
      local("Unsigned update state with explicit user-controlled restart.", "未簽署更新狀態，由用戶明確決定幾時重啟。"),
      update,
      h("div.mm-universal-actions", {}, bridgeButton(local("Check for updates", "檢查更新"), "window.meadowmark.updater.check()", bridge.updater?.check), bridgeButton(local("Restart to install", "重啟安裝"), "window.meadowmark.updater.apply()", bridge.updater?.apply)),
    ),
  );
}

function renderPreferencesSurface(): HTMLElement {
  const bridge = universalHostBridge();
  const i18n = i18nStore.getSnapshot();
  const settings = settingsStore.getSnapshot();
  const universal = universalUiStore.getSnapshot();
  const language = select({
    labelText: local("Language mode", "語言模式"),
    options: [
      { value: "en", label: "English" },
      { value: "yue", label: "廣東話" },
      { value: "bilingual", label: "English + 廣東話" },
    ],
    value: i18n.language,
    onChange: (value) => setLanguageMode(value as LanguageMode),
  });
  const enFunny = slider({
    min: 1,
    max: 5,
    value: i18n.funnyLevelEn,
    ariaLabel: "English funny level",
    onInput: (value) => setFunnyLevel("en", value as FunnyLevel),
  });
  const yueFunny = slider({
    min: 1,
    max: 5,
    value: i18n.funnyLevelYue,
    ariaLabel: "Cantonese funny level",
    onInput: (value) => setFunnyLevel("yue", value as FunnyLevel),
  });
  const emoji = switchControl({
    checked: settings.showEmojisInDialogs,
    ariaLabel: local("Show emojis in dialogs and message boxes", "對話框同訊息框顯示 emoji"),
    onChange: (checked) => settingsStore.update((state) => ({ ...state, showEmojisInDialogs: checked })),
  });

  let schoolName = universal.schoolModeName;
  const schoolNameField = textField({ labelText: local("Mode display name", "模式顯示名稱"), value: schoolName, onInput: (value) => { schoolName = value; } });
  const schoolReason = capabilityReason(undefined, "a shared School-mode record, unlock operation, and live change subscription");
  const school = switchControl({
    checked: universal.schoolModeEnabled,
    ariaLabel: local("Shared School mode", "共用學校模式"),
    disabled: !!schoolReason,
    onChange: () => notifyWarning(schoolReason ?? local("Shared mode is unavailable.", "共用模式不可用。")),
  });

  const narrator = renderNarratorControls();
  const vocabulary = renderVocabularyControls();

  return h(
    "div.mm-universal-stack",
    {},
    section(local("Language and voice", "語言同語氣"), local("Three modes and two independent humour controls.", "三種模式，加兩個獨立幽默控制。"), language, fieldRow("English funny level", enFunny), fieldRow("廣東話搞笑程度", yueFunny), fieldRow(local("Emoji decoration", "Emoji 裝飾"), emoji)),
    section(local("Shared mode boundary", "共用模式邊界"), local("Turning it off must be authorized by the shared host credential; this renderer never stores it.", "關閉一定要由主程式共用憑證授權；renderer 永遠唔儲。"), schoolNameField, fieldRow(local("Enable shared mode", "開啟共用模式"), school, schoolReason ?? undefined)),
    narrator,
    vocabulary,
  );
}

function renderNarratorControls(): HTMLElement {
  const current = universalUiStore.getSnapshot();
  const synth = window.speechSynthesis;
  const status = h("div", { role: "status", "aria-live": "polite" });
  const voiceHost = h("div.mm-universal-stack");
  let cleanup = () => {};

  function speakPreview(): void {
    if (!synth) {
      notifyError(local("Speech synthesis is unavailable on this computer.", "呢部機冇語音合成功能。"));
      return;
    }
    synth.cancel();
    const state = universalUiStore.getSnapshot();
    const texts = state.narratorLanguage === "both"
      ? [["Your narrator is ready.", "en"], ["旁白準備好喇。", "yue"]] as const
      : state.narratorLanguage === "yue"
        ? [["旁白準備好喇。", "yue"]] as const
        : [["Your narrator is ready.", "en"]] as const;
    for (const [text, language] of texts) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = state.narratorRate;
      utterance.pitch = state.narratorPitch;
      const wanted = language === "en" ? state.narratorVoiceEn : state.narratorVoiceYue;
      const voice = synth.getVoices().find((candidate) => candidate.voiceURI === wanted);
      if (voice) utterance.voice = voice;
      utterance.lang = language === "en" ? "en-CA" : "yue-HK";
      synth.speak(utterance);
    }
  }

  function renderVoices(): void {
    const voices = synth?.getVoices() ?? [];
    voiceHost.textContent = "";
    const auto = { value: "auto", label: local("Choose automatically", "自動選擇") };
    const englishVoices = voices.filter((voice) => /^en[-_]/i.test(voice.lang));
    const yueVoices = voices.filter((voice) => /^(yue|zh[-_](HK|Hant))/i.test(voice.lang));
    voiceHost.append(
      select({
        labelText: local("English voice", "英文聲線"),
        options: [auto, ...englishVoices.map((voice) => ({ value: voice.voiceURI, label: `${voice.name} · ${voice.lang}${voice.localService ? "" : " · network"}` }))],
        value: universalUiStore.getSnapshot().narratorVoiceEn,
        onChange: (value) => universalUiStore.update((state) => ({ ...state, narratorVoiceEn: value })),
      }),
      select({
        labelText: local("Cantonese voice", "廣東話聲線"),
        options: [auto, ...yueVoices.map((voice) => ({ value: voice.voiceURI, label: `${voice.name} · ${voice.lang}${voice.localService ? "" : " · network"}` }))],
        value: universalUiStore.getSnapshot().narratorVoiceYue,
        onChange: (value) => universalUiStore.update((state) => ({ ...state, narratorVoiceYue: value })),
      }),
    );
    status.textContent = !synth
      ? local("Speech synthesis is unavailable.", "語音合成唔可用。")
      : voices.length === 0
        ? local("Voice list is still loading; it will refresh automatically.", "聲線清單仲載入緊，之後會自動刷新。")
        : local(`${englishVoices.length} English and ${yueVoices.length} Cantonese-compatible voices found.`, `搵到 ${englishVoices.length} 個英文同 ${yueVoices.length} 個廣東話兼容聲線。`);
  }

  if (synth) {
    synth.addEventListener("voiceschanged", renderVoices);
    cleanup = () => synth.removeEventListener("voiceschanged", renderVoices);
  }
  renderVoices();
  const root = section(
    local("Narrator", "旁白"),
    local("Off by default. Both speaks English, then Cantonese, without overlap.", "預設關閉。雙語會先英文後廣東話，唔會撞聲。"),
    fieldRow(local("Narration enabled", "開啟旁白"), switchControl({ checked: current.narratorEnabled, ariaLabel: "Narration enabled", onChange: (checked) => universalUiStore.update((state) => ({ ...state, narratorEnabled: checked })) })),
    select({
      labelText: local("Narration language", "旁白語言"),
      options: [{ value: "en", label: "English" }, { value: "yue", label: "廣東話" }, { value: "both", label: "English + 廣東話" }],
      value: current.narratorLanguage,
      onChange: (value) => universalUiStore.update((state) => ({ ...state, narratorLanguage: value as NarratorLanguage })),
    }),
    voiceHost,
    fieldRow(local("Rate", "速度"), slider({ min: 0.5, max: 2, step: 0.1, value: current.narratorRate, ariaLabel: "Narrator rate", onInput: (value) => universalUiStore.update((state) => ({ ...state, narratorRate: value })) })),
    fieldRow(local("Pitch", "音高"), slider({ min: 0, max: 2, step: 0.1, value: current.narratorPitch, ariaLabel: "Narrator pitch", onInput: (value) => universalUiStore.update((state) => ({ ...state, narratorPitch: value })) })),
    status,
    button({ label: local("Preview voice", "試聽聲線"), variant: "outlined", disabled: !synth, disabledReason: !synth ? local("Speech synthesis is unavailable.", "語音合成唔可用。") : undefined, onClick: speakPreview }),
  );
  root.addEventListener("DOMNodeRemoved", cleanup, { once: true });
  return root;
}

function renderVocabularyControls(): HTMLElement {
  const bridge = universalHostBridge();
  const status = h("div", { role: "status", "aria-live": "polite" });
  const input = h("input", { type: "file", accept: "application/json,.json", "aria-label": local("Choose personal vocabulary JSON", "選擇個人詞彙 JSON") }) as HTMLInputElement;
  function refresh(): void {
    void safeHostCall(bridge.narrator?.vocabulary?.state, "window.meadowmark.narrator.vocabulary.state()").then((result) => {
      if (!result.ok) { status.textContent = result.error; status.dataset.state = "error"; return; }
      status.dataset.state = result.value.kind;
      status.textContent = result.value.kind === "active"
        ? local(`A validated private cache with ${result.value.entryCount} entries is active.`, `已啟用 ${result.value.entryCount} 個項目嘅驗證私人快取。`)
        : result.value.kind === "rejected" ? result.value.detail : local("No personal vocabulary file is loaded; shipped wording is unchanged.", "未載入個人詞彙；原裝文字保持不變。");
    });
  }
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 64 * 1024) {
      status.textContent = local("The selected file is too large.", "揀咗嘅檔案太大。"),
      status.dataset.state = "invalid";
      return;
    }
    void file.text().then((text) => {
      const result = validatePersonalVocabulary(text);
      if (!result.ok || !result.value) {
        status.textContent = result.error ?? local("The file was rejected.", "檔案被拒絕。"),
        status.dataset.state = "invalid";
        return;
      }
      const bytes = new TextEncoder().encode(text);
      void safeHostCall(bridge.narrator?.vocabulary?.load ? () => bridge.narrator!.vocabulary!.load!(bytes) : undefined, "window.meadowmark.narrator.vocabulary.load(bytes)").then((loaded) => {
        if (!loaded.ok || !loaded.value.ok) notifyError(loaded.ok ? loaded.value.detail ?? local("The file was rejected.", "檔案被拒絕。") : loaded.error);
        else notifySuccess(local("Personal vocabulary loaded locally.", "個人詞彙已喺本機載入。"));
        refresh();
      });
      input.value = "";
      refresh();
    });
  });
  const clear = button({
    label: local("Clear private cache", "清除私人快取"),
    variant: "outlined",
    onClick: () => {
      void safeHostCall(bridge.narrator?.vocabulary?.clear, "window.meadowmark.narrator.vocabulary.clear()").then((result) => {
        if (result.ok) notifyInfo(local("Personal vocabulary cleared; shipped wording restored.", "個人詞彙已清除；回復原裝文字。")); else notifyError(result.error);
        refresh();
      });
    },
  });
  refresh();
  return section(local("Personal vocabulary", "個人詞彙"), local("Validated locally. No network request, source path, log, export, or history entry is created.", "只喺本機驗證，唔會網絡傳送、記來源路徑、寫 log、export 或 history。"), input, status, clear);
}

function renderAppearanceSurface(): HTMLElement {
  const settings = settingsStore.getSnapshot();
  const universal = universalUiStore.getSnapshot();
  const preview = h("div.mm-universal-logo-preview", { role: "img", "aria-label": local("Application logo preview", "應用程式標誌預覽") });
  function updatePreview(): void {
    const value = universalUiStore.getSnapshot();
    preview.dataset.preset = value.selectedLogoPreset;
    preview.style.backgroundColor = value.customLogoBackground;
    preview.style.backgroundImage = value.selectedLogoPreset === "custom" && value.customLogoDataUrl ? `url(${value.customLogoDataUrl})` : "";
    preview.style.backgroundSize = value.customLogoFit;
  }
  updatePreview();
  const upload = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", "aria-label": local("Choose a custom logo image", "選擇自訂標誌圖片") }) as HTMLInputElement;
  upload.addEventListener("change", () => {
    const file = upload.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      notifyError(local("Logo input must be 2 MiB or smaller.", "標誌輸入要細過或等於 2 MiB。"));
      return;
    }
    if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) {
      notifyError(local("Only PNG, JPEG, and WebP logo inputs are accepted.", "只接受 PNG、JPEG 同 WebP 標誌。"));
      return;
    }
    void createImageBitmap(file).then((bitmap) => {
      if (bitmap.width * bitmap.height > 16_777_216 || bitmap.width < 16 || bitmap.height < 16) {
        bitmap.close();
        throw new Error(local("Logo dimensions must be at least 16×16 and at most 16.7 million pixels.", "標誌最少 16×16，最多 1,670 萬像素。"));
      }
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error(local("The local image converter is unavailable.", "本機圖片轉換器唔可用。"));
      context.clearRect(0, 0, 512, 512);
      const scale = Math.min(512 / bitmap.width, 512 / bitmap.height);
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      context.drawImage(bitmap, (512 - width) / 2, (512 - height) / 2, width, height);
      bitmap.close();
      const dataUrl = canvas.toDataURL("image/png");
      universalUiStore.update((state) => ({ ...state, selectedLogoPreset: "custom", customLogoDataUrl: dataUrl }));
      updatePreview();
      notifySuccess(local("Custom logo converted locally and applied to the preview.", "自訂標誌已喺本機轉換並套用到預覽。"));
    }).catch((error) => notifyError(error instanceof Error ? error.message : String(error)));
  });

  const theme = select({
    labelText: local("Theme", "主題"),
    options: [{ value: "system", label: local("System", "跟系統") }, { value: "light", label: local("Light", "淺色") }, { value: "dark", label: local("Dark", "深色") }],
    value: settings.theme,
    onChange: (value) => {
      settingsStore.update((state) => ({ ...state, theme: value as "system" | "light" | "dark" }));
      setTheme(value as "system" | "light" | "dark");
    },
  });
  const density = slider({ min: 0.8, max: 1.3, step: 0.05, value: settings.density, ariaLabel: local("Interface density", "介面密度"), formatValue: (value) => `${Math.round(value * 100)}%`, onInput: (value) => { settingsStore.update((state) => ({ ...state, density: value })); setDensityScale(value); } });
  const preset = select({
    labelText: local("Logo preset", "標誌預設"),
    options: [
      { value: "meadow", label: local("Meadow", "草地") },
      { value: "harvest", label: local("Harvest", "收成") },
      { value: "town", label: local("Town", "小鎮") },
      { value: "custom", label: local("Custom local image", "自訂本機圖片"), disabled: !universal.customLogoDataUrl, disabledReason: local("Choose a valid local image first.", "先揀一張有效本機圖片。") },
    ],
    value: universal.selectedLogoPreset,
    onChange: (value) => { universalUiStore.update((state) => ({ ...state, selectedLogoPreset: value as "meadow" | "harvest" | "town" | "custom" })); updatePreview(); },
  });
  const fit = select({
    labelText: local("Logo fit", "標誌填充"),
    options: [{ value: "contain", label: local("Contain", "完整顯示") }, { value: "cover", label: local("Fill", "填滿") }],
    value: universal.customLogoFit,
    onChange: (value) => { universalUiStore.update((state) => ({ ...state, customLogoFit: value as "contain" | "cover" })); updatePreview(); },
  });
  const background = h("input", { type: "color", value: universal.customLogoBackground, "aria-label": local("Logo background colour", "標誌背景顏色"), oninput: (event: Event) => { universalUiStore.update((state) => ({ ...state, customLogoBackground: (event.target as HTMLInputElement).value })); updatePreview(); } });
  return h(
    "div.mm-universal-stack",
    {},
    section(local("Appearance", "外觀"), local("Changes apply live and persist locally.", "變更會即時套用並喺本機保存。"), theme, fieldRow(local("Density", "密度"), density)),
    section(local("Application logo", "應用程式標誌"), local("Custom processing is local, bounded, and never changes package identity.", "自訂處理只喺本機、有上限，永遠唔會改套件身份。"), preview, preset, upload, fit, fieldRow(local("Background", "背景"), background), button({ label: local("Reset to shipped mark", "重設做原裝標誌"), variant: "outlined", onClick: () => { universalUiStore.update((state) => ({ ...state, selectedLogoPreset: "meadow", customLogoDataUrl: null })); upload.value = ""; updatePreview(); } })),
    section(local("Per-element editor", "逐元素編輯器"), local("Right-click an editable card or navigation item to edit appearance or start its own lock wizard.", "右擊可編輯卡片或導航項目，就可以改外觀或開佢自己嘅鎖定精靈。"), emptyState(local("Context actions are live", "右鍵操作可用"), local("Each target keeps its own persisted appearance record.", "每個目標都有自己保存嘅外觀記錄。"))),
  );
}

function renderAutomationSurface(): HTMLElement {
  const rulesHost = h("div.mm-universal-stack");
  function renderRules(): void {
    rulesHost.textContent = "";
    const rules = universalUiStore.getSnapshot().schedules;
    if (!rules.length) {
      rulesHost.appendChild(emptyState(local("No schedules", "未有排程"), local("Create a rule from real dates, local time, and weekdays.", "用真實日期、本地時間同星期建立規則。")));
      return;
    }
    for (const rule of rules) {
      const toggle = switchControl({ checked: rule.enabled, ariaLabel: `${rule.label} enabled`, onChange: (enabled) => { universalUiStore.update((state) => ({ ...state, schedules: state.schedules.map((candidate) => candidate.id === rule.id ? { ...candidate, enabled } : candidate) })); renderRules(); } });
      rulesHost.appendChild(h("article.mm-card.mm-card--outlined", {}, h("strong", {}, rule.label), h("div", {}, `${rule.startTime}–${rule.endTime} · ${rule.weekdays.join(", ")}`), toggle));
    }
  }
  let label = "";
  let start = "09:00";
  let end = "17:00";
  const weekdayInputs = new Map<ScheduleWeekday, HTMLInputElement>();
  const weekdayRow = h("div.mm-universal-weekdays", { role: "group", "aria-label": local("Weekdays", "星期") });
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((name, index) => {
    const input = h("input", { type: "checkbox", value: String(index), checked: index > 0 && index < 6, "aria-label": name }) as HTMLInputElement;
    weekdayInputs.set(index as ScheduleWeekday, input);
    weekdayRow.appendChild(h("label", {}, input, name));
  });
  const add = button({
    label: local("Add schedule", "新增排程"),
    onClick: () => {
      const weekdays = [...weekdayInputs.entries()].filter(([, input]) => input.checked).map(([day]) => day);
      if (!label.trim() || weekdays.length === 0 || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start === end) {
        notifyError(local("Enter a label, choose at least one weekday, and use different valid start/end times.", "輸入名稱、揀最少一日，同用兩個唔同嘅有效開始/結束時間。"));
        return;
      }
      const rule: ScheduleRule = { id: uid("schedule"), label: label.trim(), enabled: true, weekdays, startTime: start, endTime: end, language: null, theme: null };
      universalUiStore.update((state) => ({ ...state, schedules: [...state.schedules, rule] }));
      label = "";
      renderRules();
    },
  });
  renderRules();
  return h("div.mm-universal-stack", {}, section(local("Scheduled settings", "排程設定"), local(`Times use ${Intl.DateTimeFormat().resolvedOptions().timeZone}; cross-midnight rules are supported and equal times are rejected.`, `時間使用 ${Intl.DateTimeFormat().resolvedOptions().timeZone}；支援跨午夜，相同時間會被拒絕。`), textField({ labelText: local("Rule label", "規則名稱"), value: label, onInput: (value) => { label = value; } }), h("label", {}, local("Start time", "開始時間"), h("input", { type: "time", value: start, oninput: (event: Event) => { start = (event.target as HTMLInputElement).value; } })), h("label", {}, local("End time", "結束時間"), h("input", { type: "time", value: end, oninput: (event: Event) => { end = (event.target as HTMLInputElement).value; } })), weekdayRow, add, rulesHost), section(local("External sources", "外部來源"), local("API and Home Assistant scheduling require a privileged bounded network bridge; renderer-only networking is intentionally disabled.", "API 同 Home Assistant 排程需要有界限嘅主程式網絡橋；renderer 網絡刻意唔開。"), emptyState(local("Host seam required", "需要主程式橋接"), "window.meadowmark.schedules")));
}

function matchesRegexState(value: string, state: RegexFieldState): boolean {
  if (state.mode === "text") return value.toLowerCase().includes(state.query.trim().toLowerCase());
  try { return new RegExp(state.pattern, state.flags).test(value); } catch { return false; }
}

function renderConverterSurface(): HTMLElement {
  const bridge = universalHostBridge();
  const nativeHost = h("div.mm-universal-stack", { role: "status", "aria-live": "polite" });
  let nativeCatalog: Awaited<ReturnType<NonNullable<NonNullable<typeof bridge.converter>["listCatalog"]>>> = [];
  let nativeSource: { handle: string; name: string; size: number } | null = null;

  function renderNativeCandidates(candidates: readonly { formatId: string; label: string; confidence: string }[]): void {
    nativeHost.textContent = "";
    if (!nativeSource) { nativeHost.appendChild(emptyState(local("No source selected", "未選擇來源"), local("Use the native picker; renderer paths are never exposed.", "使用原生選擇器；renderer 永遠唔會見到路徑。"))); return; }
    nativeHost.appendChild(h("strong", {}, `${nativeSource.name} · ${nativeSource.size} bytes`));
    const matching = nativeCatalog.filter((entry) => candidates.some((candidate) => candidate.formatId === entry.sourceFormat.id));
    if (!matching.length) nativeHost.appendChild(emptyState(local("No compatible adapter", "冇兼容 adapter"), candidates.map((candidate) => `${candidate.label} (${candidate.confidence})`).join(" · ") || local("Type could not be detected.", "無法偵測類型。")));
    for (const entry of matching) {
      const reason = entry.bundled ? null : entry.unavailableReason ?? local("Required adapter is not bundled.", "所需 adapter 未打包。");
      nativeHost.appendChild(h("article.mm-card.mm-card--outlined", {}, h("strong", {}, entry.userFacingName), h("span", {}, `${entry.sourceFormat.label} → ${entry.targetFormat.label} · ${entry.lossiness}`), h("span", {}, entry.metadataBehavior), entry.lossDisclosure.length ? h("ul", {}, ...entry.lossDisclosure.map((item) => h("li", {}, `${item.aspect}: ${item.detail}`))) : null, button({ label: local("Convert…", "轉換…"), variant: "tonal", disabled: !!reason, disabledReason: reason ?? undefined, onClick: () => { void safeHostCall(() => bridge.converter!.convert!(nativeSource!.handle, entry.id), "window.meadowmark.converter.convert(sourceHandle, entryId)").then((result) => result.ok ? notifySuccess(result.value.cancelled ? local("Conversion cancelled.", "轉換已取消。") : local(`Converted ${result.value.fileName ?? nativeSource!.name}.`, `已轉換 ${result.value.fileName ?? nativeSource!.name}。`)) : notifyError(result.error)); } })));
    }
  }

  void safeHostCall(bridge.converter?.listCatalog, "window.meadowmark.converter.listCatalog()").then((result) => {
    if (result.ok) nativeCatalog = result.value;
    else nativeHost.appendChild(emptyState(local("Native converter unavailable", "原生轉換器不可用"), result.error));
  });
  const pickNative = bridgeButton(local("Choose source with native picker…", "用原生選擇器選擇來源…"), "window.meadowmark.converter.pickSource()", bridge.converter?.pickSource && bridge.converter?.detect ? async () => {
    nativeSource = await bridge.converter!.pickSource!();
    if (!nativeSource) { renderNativeCandidates([]); return; }
    const candidates = await bridge.converter!.detect!(nativeSource.handle);
    renderNativeCandidates(candidates);
  } : undefined);
  renderNativeCandidates([]);
  let selectedAdapterId = CONVERTER_ADAPTERS.find((adapter) => adapter.enabled)?.id ?? "";
  const catalogHost = h("div.mm-universal-catalog");
  const queueHost = h("div.mm-universal-stack");
  const queue: ConversionQueueItem[] = [];
  let controller: AbortController | null = null;
  const fileInput = h("input", { type: "file", multiple: true, "aria-label": local("Choose files to convert", "選擇要轉換嘅檔案") }) as HTMLInputElement;

  function renderCatalog(filter: RegexFieldState | null = null): void {
    catalogHost.textContent = "";
    for (const category of CONVERTER_CATEGORIES) {
      const items = CONVERTER_ADAPTERS.filter((adapter) => adapter.category === category && (!filter || matchesRegexState(adapter.label, filter)));
      const categoryCard = h("section.mm-card.mm-card--outlined", {}, h("h4", {}, category));
      const ownSearch = searchField({ ariaLabel: `${category} adapter search`, onChange: (state) => {
        categoryCard.querySelectorAll<HTMLElement>("[data-adapter-label]").forEach((element) => { element.hidden = !matchesRegexState(element.dataset.adapterLabel ?? "", state); });
      } });
      categoryCard.appendChild(ownSearch.el);
      if (!items.length) categoryCard.appendChild(emptyState(local("No matching adapters", "冇符合嘅轉換器"), local("Change the search or regex pattern.", "改搜尋或 regex pattern。")));
      for (const adapter of items) {
        const choose = button({ label: adapter.enabled ? local("Use", "使用") : local("Unavailable", "不可用"), variant: "outlined", disabled: !adapter.enabled, disabledReason: adapter.unavailableReason, onClick: () => { selectedAdapterId = adapter.id; notifyInfo(local(`${adapter.label} selected.`, `已選 ${adapter.label}。`)); } });
        categoryCard.appendChild(h("article.mm-universal-adapter", { "data-adapter-label": adapter.label }, h("strong", {}, adapter.label), h("span", {}, adapter.lossiness), h("code", {}, adapter.accepts.join(", ")), h("span", {}, adapter.enabled ? `bundled=${adapter.bundled}` : adapter.unavailableReason ?? "Unavailable"), choose));
      }
      catalogHost.appendChild(categoryCard);
    }
  }

  function renderQueue(): void {
    queueHost.textContent = "";
    if (!queue.length) queueHost.appendChild(emptyState(local("Queue is empty", "隊列係空"), local("Choose one or more local files. Paths are not retained.", "揀一個或多個本機檔案；路徑唔會保存。")));
    for (const item of queue) queueHost.appendChild(h("article.mm-card.mm-card--outlined", {}, h("strong", {}, item.file.name), h("span", {}, `${item.state}${item.error ? ` · ${item.error}` : ""}`)));
  }

  fileInput.addEventListener("change", () => {
    for (const file of Array.from(fileInput.files ?? [])) queue.push({ id: uid("convert"), file, adapterId: selectedAdapterId, state: "queued" });
    fileInput.value = "";
    renderQueue();
  });

  async function runQueue(): Promise<void> {
    if (controller) return;
    controller = new AbortController();
    for (const item of queue) {
      if (item.state !== "queued") continue;
      item.state = "running";
      renderQueue();
      try {
        const blob = await convertQueueItem(item, controller.signal);
        const adapter = CONVERTER_ADAPTERS.find((candidate) => candidate.id === item.adapterId);
        const url = URL.createObjectURL(blob);
        const anchor = h("a", { href: url, download: `${item.file.name}${adapter?.outputExtension ?? ".converted"}` });
        anchor.click();
        URL.revokeObjectURL(url);
        item.state = "converted";
      } catch (error) {
        item.state = error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "failed";
        item.error = error instanceof Error ? error.message : String(error);
      }
      renderQueue();
      if (controller.signal.aborted) break;
    }
    controller = null;
  }
  const masterSearch = searchField({ ariaLabel: local("Search all converter adapters", "搜尋全部轉換器"), onChange: (state) => renderCatalog(state) });
  renderCatalog();
  renderQueue();
  return h("div.mm-universal-stack", {}, section(local("Installed native converter", "已安裝原生轉換器"), local("The native picker returns an opaque source handle, never a renderer-visible path.", "原生選擇器只回傳不透明 source handle，永遠唔會把路徑交給 renderer。"), pickNative, nativeHost), section(local("Adapter catalog", "轉換器目錄"), local("Known formats stay visible. Only bundled, offline, byte-validating adapters are enabled.", "已知格式會保留顯示；只開啟已打包、離線、驗證 bytes 嘅轉換器。"), masterSearch.el, catalogHost), section(local("Browser-local fallback queue", "瀏覽器本機後備隊列"), local("Files are processed one at a time with bounded 32 MiB input; the source is never overwritten.", "檔案逐個處理，每個最多 32 MiB；原檔永遠唔會覆寫。"), fileInput, h("div.mm-universal-actions", {}, button({ label: local("Convert queued files", "轉換隊列檔案"), onClick: () => { void runQueue(); } }), button({ label: local("Cancel current conversion", "取消目前轉換"), variant: "outlined", onClick: () => controller?.abort() })), queueHost));
}

function renderOllamaSurface(): HTMLElement {
  const bridge = universalHostBridge();
  const runtimeHost = h("div", { role: "status", "aria-live": "polite" }, local("Checking local runtime…", "檢查本機 runtime 中…"));
  const catalogHost = h("div.mm-universal-stack");
  let catalog: CatalogStateView | null = null;
  function renderRuntime(value: OllamaDiagnosisView): void {
    runtimeHost.textContent = `${value.state} · ${value.baseUrl}${value.serverVersion ? ` · ${value.serverVersion}` : ""} · ${value.detail} · ${value.checkedAt}`;
  }
  function renderCatalog(value: CatalogStateView, filter?: RegexFieldState): void {
    catalog = value;
    catalogHost.textContent = "";
    const tags = (value.snapshot?.models ?? []).flatMap((model) => model.tags.map((tag) => ({ model: model.name, tag })));
    const matches = tags.filter(({ model, tag }) => !filter || matchesRegexState(`${model} ${tag.fullReference} ${tag.quantization ?? ""}`, filter));
    const snapshot = value.snapshot;
    catalogHost.appendChild(h("p", {}, snapshot ? `${snapshot.completeness} · ${snapshot.pageCount} page(s) · ${snapshot.fetchedAt} · ${value.stale ? "stale" : "current"} · ${snapshot.sourceRevision}` : local("No verified catalog snapshot.", "未有已驗證目錄 snapshot。")));
    if (!matches.length) catalogHost.appendChild(emptyState(local("No matching models", "冇符合嘅模型"), local("The store never invents catalog entries.", "模型商店永遠唔會作資料。")));
    for (const { model, tag } of matches) {
      const create = bridge.ollama?.pulls?.create;
      const run = bridge.ollama?.pulls?.run;
      const reason = capabilityReason(create && run ? create : undefined, "window.meadowmark.ollama.pulls.create()/run()");
      catalogHost.appendChild(h("article.mm-card.mm-card--outlined", {}, h("strong", {}, tag.fullReference), h("span", {}, `${model} · ${tag.parameterSize ?? "parameters unknown"} · ${tag.quantization ?? "quantization unknown"}`), button({ label: local("Add to pull queue", "加入下載隊列"), variant: "outlined", disabled: !!reason, disabledReason: reason ?? undefined, onClick: () => { void safeHostCall(async () => { const batch = await create!([tag.fullReference], 1); return run!(batch.id); }, reason ?? "Pull bridge unavailable.").then((result) => result.ok ? notifySuccess(local(`Pull started for ${tag.fullReference}.`, `${tag.fullReference} 開始下載。`)) : notifyError(result.error)); } })));
    }
  }
  void safeHostCall(bridge.ollama?.diagnose, "window.meadowmark.ollama.diagnose()").then((result) => result.ok ? renderRuntime(result.value) : runtimeHost.textContent = result.error);
  void safeHostCall(bridge.ollama?.catalogState, "window.meadowmark.ollama.catalogState()").then((result) => result.ok ? renderCatalog(result.value) : catalogHost.appendChild(emptyState(local("Model Store unavailable", "模型商店不可用"), result.error)));
  const search = searchField({ ariaLabel: local("Search the complete model catalog", "搜尋完整模型目錄"), onChange: (state) => { if (catalog) renderCatalog(catalog, state); } });
  return h("div.mm-universal-stack", {}, section(local("Local runtime", "本機 runtime"), local("Only the documented loopback API may be used, through the privileged host boundary.", "只可經主程式權限邊界使用官方 loopback API。"), runtimeHost, bridgeButton(local("Retry runtime check", "再檢查 runtime"), "window.meadowmark.ollama.diagnose()", bridge.ollama?.diagnose)), section(local("Model Store", "模型商店"), local("Exhaustive catalog metadata and installed state come only from the host.", "完整目錄 metadata 同已安裝狀態只會由主程式提供。"), search.el, bridgeButton(local("Refresh complete catalog", "刷新完整目錄"), "window.meadowmark.ollama.refreshCatalog()", bridge.ollama?.refreshCatalog), catalogHost), section(local("Chat and harnesses", "聊天同 harness"), local("Streaming chat is present in the host contract; allowlisted harness launch still needs a dedicated host seam.", "主程式已有串流聊天合約；allowlist harness 啟動仍需專用橋接。"), emptyState(local("Harness seam required", "需要 harness 橋接"), "window.meadowmark.ollama.harnesses")));
}

function renderSecuritySurface(): HTMLElement {
  const bridge = universalHostBridge();
  const lockHost = h("div.mm-universal-stack");
  const authHost = h("div.mm-universal-stack");
  void safeHostCall(bridge.locks?.list, "window.meadowmark.locks.list()").then((result) => {
    lockHost.textContent = "";
    if (!result.ok) lockHost.appendChild(emptyState(local("Locks unavailable", "鎖不可用"), result.error));
    else if (!result.value.length) lockHost.appendChild(emptyState(local("No toy locks", "未有玩具鎖"), local("Each element can create its own independent password or TOTP lock.", "每個元素都可以建立自己獨立嘅密碼或 TOTP 玩具鎖。")));
    else for (const lock of result.value) lockHost.appendChild(h("article.mm-card.mm-card--outlined", {}, h("strong", {}, lock.target.label), h("span", {}, `${lock.method} · ${lock.isLockedOut ? "rate limited" : "locked on launch"}`)));
  });
  void safeHostCall(bridge.authenticator?.listEntries, "window.meadowmark.authenticator.listEntries()").then((result) => {
    authHost.textContent = "";
    if (!result.ok) authHost.appendChild(emptyState(local("Authenticator unavailable", "驗證器不可用"), result.error));
    else if (!result.value.length) authHost.appendChild(emptyState(local("No authenticator entries", "未有驗證器項目"), local("Secrets must stay in the operating-system credential vault.", "秘密一定要留喺作業系統憑證庫。")));
    else for (const entry of result.value) authHost.appendChild(h("article.mm-card.mm-card--outlined", {}, h("strong", {}, `${entry.issuer} · ${entry.account}`), h("span", {}, `${entry.algorithm} · ${entry.digits} digits · ${entry.period}s`), emptyState(local("Code display needs a guarded reveal", "代碼顯示需要保護顯示"), "window.meadowmark.authenticator.currentCode(entryId)")));
  });
  return h("div.mm-universal-stack", {}, section(local("Toy locks", "玩具鎖"), local("A speed bump, not security or encryption. Recovery is deleting the named application-data folder.", "只係減速帶，唔係保安或加密；復原方法係刪除指定 application-data 資料夾。"), emptyState(local("Registration wizard seam required", "需要註冊 wizard 橋接"), "window.meadowmark.locks.create(target, credential, duration) exists; the renderer still needs credential-vault-safe wizard orchestration."), lockHost), section(local("Built-in authenticator", "內置驗證器"), local("Registration, QR decoding, live codes, countdowns, and secrets remain host-owned and local-only.", "註冊、QR 解碼、即時代碼、倒數同秘密全部由主程式本機管理。"), emptyState(local("Guided registration seam required", "需要引導式註冊橋接"), "The host exposes begin/confirm operations; QR image, clipboard, camera, and pairing UI remain renderer work."), authHost), section(local("Support Tickets", "支援單"), local("Nothing is sent anywhere, no external ticket exists, no data is collected, and nobody is reading it.", "乜都唔會傳出去，外面冇 ticket，冇收集資料，亦冇人睇。"), emptyState(local("Host seam required", "需要主程式橋接"), "Support ticket storage and open-application-data-folder operations are not in MeadowmarkApi.")));
}

function renderHistorySurface(): HTMLElement {
  const bridge = universalHostBridge();
  const host = h("div.mm-universal-stack");
  void safeHostCall(() => bridge.history!.revisions!(undefined, 100), "window.meadowmark.history.revisions(undefined, 100)").then((result) => {
    host.textContent = "";
    if (!result.ok) host.appendChild(emptyState(local("History unavailable", "歷史不可用"), result.error));
    else if (!result.value.length) host.appendChild(emptyState(local("No recorded revisions", "未有記錄修訂"), local("An unchanged state creates no revision.", "冇變更就唔會建立修訂。")));
    else for (const entry of result.value) host.appendChild(h("article.mm-card.mm-card--outlined", {}, h("strong", {}, entry.labels[0] ?? entry.action ?? entry.message), h("span", {}, `${entry.date} · ${entry.hash}`)));
  });
  const formats = ["json", "jsonl", "yaml", "toml", "xml", "csv", "tsv", "markdown", "html"] as const;
  const exportButtons = formats.map((format) => bridgeButton(format.toUpperCase(), `window.meadowmark.exports.save(source, "${format}")`, undefined));
  return h("div.mm-universal-stack", {}, section(local("Local version history", "本機版本歷史"), local("Append-only restores create new revisions; secrets are excluded or encrypted by the host.", "append-only 復原會建立新修訂；秘密由主程式排除或加密。"), h("div.mm-universal-actions", {}, bridgeButton(local("Export redacted history", "匯出已遮蔽歷史"), "window.meadowmark.history.exportRedacted()", bridge.history?.exportRedacted ? () => bridge.history!.exportRedacted!("json").then(() => undefined) : undefined)), host), section(local("Export", "匯出"), local("Every format remains visible; enabling one requires a concrete host ExportSource so no field is silently dropped.", "每個格式都會顯示；要啟用必須有實際 host ExportSource，避免靜雞雞漏資料。"), h("div.mm-universal-actions", {}, ...exportButtons)));
}

function renderHelpSurface(): HTMLElement {
  const docsHost = h("div.mm-universal-stack");
  const articles: Array<{ id: string; title: string; bodyMarkdown: string }> = [];
  function renderArticles(filter?: RegexFieldState): void {
    docsHost.textContent = "";
    const matches = articles.filter((article) => !filter || matchesRegexState(`${article.title} ${article.bodyMarkdown}`, filter));
    if (!matches.length) docsHost.appendChild(emptyState(local("No matching bundled articles", "冇符合嘅內置文章"), articles.length ? local("Change the search or regex pattern.", "改搜尋或 regex pattern。") : local("The host did not provide any bundled articles.", "主程式冇提供內置文章。")));
    for (const article of matches) docsHost.appendChild(h("details.mm-card.mm-card--outlined", {}, h("summary", {}, article.title), h("pre.mm-universal-markdown", {}, article.bodyMarkdown)));
  }
  renderArticles();
  const search = searchField({ ariaLabel: local("Search bundled documentation", "搜尋內置文件"), onChange: renderArticles });
  return h("div.mm-universal-stack", {}, section(local("Offline documentation", "離線文件"), local("Articles must be bundled by the host and links must resolve inside the app.", "文章一定要由主程式內置，連結要喺 app 入面開。"), search.el, docsHost), section(local("Changelog", "更新紀錄"), local("The complete release history, date filter, commit links, and exports require the bundled release catalog seam.", "完整發佈歷史、日期篩選、commit 連結同匯出需要內置 release catalog 橋。"), emptyState(local("Host seam required", "需要主程式橋接"), "window.meadowmark.changelog")), section(local("Keyboard", "鍵盤"), local("Ctrl+Shift+F opens the command palette. Arrow keys follow each tab strip orientation; Escape closes overlays and returns focus.", "Ctrl+Shift+F 開 command palette；方向鍵跟 tab 方向；Escape 關 overlay 並還原 focus。"), h("kbd", {}, "Ctrl+Shift+F")));
}

function surfaceDefs(): UniversalSurfaceDef[] {
  return [
    { id: "status", group: "Core", en: "Status", yue: "狀態", render: renderStatusSurface },
    { id: "preferences", group: "Core", en: "Preferences", yue: "偏好設定", render: renderPreferencesSurface },
    { id: "appearance", group: "Core", en: "Appearance", yue: "外觀", render: renderAppearanceSurface },
    { id: "automation", group: "Tools", en: "Schedules", yue: "排程", render: renderAutomationSurface },
    { id: "converter", group: "Tools", en: "Converter", yue: "轉換器", render: renderConverterSurface },
    { id: "ollama", group: "Tools", en: "Local AI", yue: "本機 AI", render: renderOllamaSurface },
    { id: "security", group: "Tools", en: "Locks & Authenticator", yue: "鎖同驗證器", render: renderSecuritySurface },
    { id: "history", group: "Help", en: "History & Export", yue: "歷史同匯出", render: renderHistorySurface },
    { id: "help", group: "Help", en: "Docs & Changelog", yue: "文件同更新紀錄", render: renderHelpSurface },
  ];
}

function editElementAppearance(target: HTMLElement, key: string): void {
  const storageKey = `meadowmark.element-style.${key}`;
  let current: Record<string, string> = {};
  try { current = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, string>; } catch { current = {}; }
  const panel = h("div.mm-universal-appearance-popover", { role: "dialog", "aria-label": local(`Edit ${key} appearance`, `編輯 ${key} 外觀`) });
  const color = h("input", { type: "color", value: current.color ?? "#1a1c18", "aria-label": local("Text colour", "文字顏色") }) as HTMLInputElement;
  const background = h("input", { type: "color", value: current.backgroundColor ?? "#eef0e9", "aria-label": local("Background colour", "背景顏色") }) as HTMLInputElement;
  const size = h("input", { type: "number", min: "10", max: "40", value: current.fontSize?.replace("px", "") ?? "14", "aria-label": local("Font size in pixels", "字體像素大小") }) as HTMLInputElement;
  const radius = h("input", { type: "range", min: "0", max: "32", value: current.borderRadius?.replace("px", "") ?? "12", "aria-label": local("Corner radius", "圓角") }) as HTMLInputElement;
  function apply(): void {
    const styles = { color: color.value, backgroundColor: background.value, fontSize: `${size.value}px`, borderRadius: `${radius.value}px` };
    Object.assign(target.style, styles);
    try { localStorage.setItem(storageKey, JSON.stringify(styles)); } catch { notifyWarning(local("Appearance changed for this session but could not be persisted.", "外觀今次 session 已改，但保存唔到。")); }
  }
  for (const input of [color, background, size, radius]) input.addEventListener("input", apply);
  panel.append(fieldRow(local("Text", "文字"), color), fieldRow(local("Background", "背景"), background), fieldRow(local("Font size", "字體大小"), size), fieldRow(local("Radius", "圓角"), radius), button({ label: local("Reset element", "重設元素"), variant: "outlined", onClick: () => { target.removeAttribute("style"); try { localStorage.removeItem(storageKey); } catch { /* session reset still succeeded */ } } }));
  const rect = target.getBoundingClientRect();
  panel.style.position = "fixed";
  panel.style.left = `${Math.min(rect.right + 8, window.innerWidth - 330)}px`;
  panel.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - 420))}px`;
  panel.style.zIndex = "var(--mm-z-overlay)";
  document.body.appendChild(panel);
  const close = (event: MouseEvent) => { if (!panel.contains(event.target as Node) && event.target !== target) { panel.remove(); document.removeEventListener("mousedown", close, true); target.focus(); } };
  window.setTimeout(() => document.addEventListener("mousedown", close, true), 0);
  color.focus();
}

function decorateEditable(target: HTMLElement, key: string): void {
  target.dataset.mmEditable = key;
  attachContextMenu(target, () => {
    const lockReason = capabilityReason(undefined, "a credential-vault-safe per-element lock wizard around window.meadowmark.locks.create()");
    return [
      { id: "edit-appearance", label: local("Edit appearance…", "編輯外觀…"), shortcut: "Shift+F10", onSelect: () => editElementAppearance(target, key) },
      { id: "lock-element", label: local("Lock this element…", "鎖定呢個元素…"), disabled: true, disabledReason: lockReason ?? undefined },
    ];
  });
  target.addEventListener("keydown", (event) => { if (event.shiftKey && event.key === "F10") { event.preventDefault(); editElementAppearance(target, key); } });
}

/** Mounts the canonical desktop control centre. Host-owned capabilities are
 * called only when the real preload bridge exposes them; otherwise the exact
 * missing seam is rendered instead of a decorative success path. */
export function mountUniversalCenter(host: HTMLElement, initialSurface: UniversalSurfaceId = "status"): () => void {
  assertUniversalSurfaceContract(UNIVERSAL_SURFACE_IDS);
  const defs = surfaceDefs();
  const root = h("section.mm-panel.mm-universal", { "aria-label": local("Control centre", "控制中心") });
  const nav = h("nav.mm-universal-nav", { "aria-label": local("Control-centre destinations", "控制中心目的地") });
  const content = h("div.mm-universal-content", { role: "tabpanel", tabindex: "0" });
  const searchArea = h("details.mm-universal-searches", {}, h("summary", {}, local("Tab discovery searches", "Tab 搜尋")));
  const buttons = new Map<UniversalSurfaceId, HTMLButtonElement>();
  let active = initialSurface;

  function activate(id: UniversalSurfaceId): void {
    active = id;
    universalUiStore.update((state) => ({ ...state, activeUniversalTab: id }));
    for (const [candidate, element] of buttons) {
      element.setAttribute("aria-selected", String(candidate === id));
      element.tabIndex = candidate === id ? 0 : -1;
    }
    content.textContent = "";
    const def = defs.find((candidate) => candidate.id === id);
    if (!def) return;
    content.setAttribute("aria-labelledby", `mm-universal-tab-${id}`);
    content.appendChild(def.render());
    content.focus({ preventScroll: true });
  }

  activateCurrentSurface = activate;
  const groups: Array<UniversalSurfaceDef["group"]> = ["Core", "Tools", "Help"];
  for (const group of groups) {
    const groupEl = h("div.mm-universal-tab-group", { "data-group": group }, h("h3", {}, group));
    for (const def of defs.filter((candidate) => candidate.group === group)) {
      const tab = h("button.mm-universal-tab", { id: `mm-universal-tab-${def.id}`, role: "tab", type: "button", "aria-selected": "false", tabindex: "-1", onclick: () => activate(def.id) }, local(def.en, def.yue));
      decorateEditable(tab, `universal-tab-${def.id}`);
      buttons.set(def.id, tab);
      groupEl.appendChild(tab);
    }
    nav.appendChild(groupEl);
  }
  nav.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const ids = defs.map((def) => def.id);
    const current = ids.indexOf(active);
    const next = event.key === "Home" ? 0 : event.key === "End" ? ids.length - 1 : event.key === "ArrowDown" ? (current + 1) % ids.length : (current - 1 + ids.length) % ids.length;
    const id = ids[next];
    if (id) { activate(id); buttons.get(id)?.focus(); }
  });

  function addDiscoverySearch(label: string, scope: (def: UniversalSurfaceDef) => boolean): void {
    const results = h("div.mm-universal-search-results", { role: "listbox", "aria-label": `${label} results` });
    const search = searchField({ ariaLabel: label, onChange: (state) => {
      results.textContent = "";
      const matches = defs.filter((def) => scope(def) && matchesRegexState(`${def.en} ${def.yue} ${def.group}`, state));
      for (const def of matches) results.appendChild(button({ label: `${local(def.en, def.yue)} · ${def.group}`, variant: "text", onClick: () => activate(def.id) }));
      if (!matches.length && (state.query || state.pattern)) results.appendChild(emptyState(local("No matching tabs", "冇符合嘅 tabs"), local("Nothing was hidden from the application; only this result set is empty.", "應用程式冇隱藏任何嘢；只係結果係空。")));
    } });
    searchArea.appendChild(h("div.mm-universal-discovery", {}, h("strong", {}, label), search.el, results));
  }
  addDiscoverySearch(local("Current strip search", "目前 tab bar 搜尋"), () => true);
  addDiscoverySearch(local("Current group search", "目前群組搜尋"), (def) => def.group === defs.find((candidate) => candidate.id === active)?.group);
  addDiscoverySearch(local("Group-name search", "群組名稱搜尋"), () => true);
  addDiscoverySearch(local("Master tab search", "總 tab 搜尋"), () => true);

  const header = h("header.mm-panel__header", {}, h("div", {}, h("h2.mm-panel__title", {}, local("Control centre", "控制中心")), h("p", {}, local("Settings, tools, safety, evidence, and help in one discoverable surface.", "設定、工具、安全、證據同幫助集中喺一個易搵頁面。"))));
  decorateEditable(header, "universal-header");
  root.append(header, searchArea, h("div.mm-universal-layout", {}, nav, content));
  host.textContent = "";
  host.appendChild(root);
  activate(initialSurface);

  if (!paletteRegistered) {
    registerPaletteSource(() => surfaceDefs().map((def) => ({ kind: "destination" as const, id: `universal-${def.id}`, label: `${def.en} · ${def.yue}`, teleport: () => activateCurrentSurface?.(def.id) })));
    paletteRegistered = true;
  }
  return () => {
    if (activateCurrentSurface === activate) activateCurrentSurface = null;
    root.remove();
  };
}
