/**
 * Main-side narration queue and policy engine.
 *
 * Speech synthesis itself only exists in a renderer/DOM context, so this
 * controller never speaks anything directly. It owns everything ELSE that
 * makes a narrator good to have on: persistence, language selection,
 * debounce/cooldown so it never nags, strict one-at-a-time serialization
 * so lines never overlap, "Both" language mode's strict English-then-
 * Cantonese ordering, and yielding to a screen reader or the platform's
 * quiet hours. It drives a caller-supplied `NarratorEnginePort` (typically
 * the renderer, wired over IPC by the orchestrator) to actually speak.
 *
 * Callers are responsible for: enabling narration (it is OFF until the
 * user turns it on), rendering the request text in both languages at
 * their own funny level, and choosing when to call `narrate()`. This
 * module never invents or alters wording.
 */

import {
  type NarratedLanguage,
  type NarrationOutcome,
  type NarrationRequest,
  type NarratorEnginePort,
  type NarratorSettings,
  type NarratorSlotStatus,
  type NarratorStatus,
  type VoiceDescriptor,
  type VoiceSelection,
} from './narrator-types';
import { NarratorSettingsStore } from './narrator-settings-store';

/** Minimum time between two narrations in the SAME category, so the
 * narrator never nags. 'important' (error/warning) requests bypass this —
 * a rate limit must never be the reason a real failure goes unspoken. */
const DEFAULT_CATEGORY_COOLDOWN_MS = 20_000;

const ENGLISH_LANG_TAG = 'en';
const CANTONESE_LANG_TAG = 'yue';

interface QueueItem {
  request: NarrationRequest;
  enqueuedAt: number;
  resolve: (outcome: NarrationOutcome) => void;
}

export interface NarratorControllerDeps {
  engine: NarratorEnginePort;
  settingsStore?: NarratorSettingsStore;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Returns whether the platform's reduced-sound / quiet-hours window is
   * currently active. Omit on a platform/renderer with no such concept —
   * the controller then never suppresses narration for this reason. */
  isQuietHoursActive?: () => boolean | Promise<boolean>;
  /** Per-category cooldown overrides, in milliseconds. Falls back to
   * DEFAULT_CATEGORY_COOLDOWN_MS for any category not listed here. */
  categoryCooldownsMs?: Record<string, number>;
}

export class NarratorController {
  private readonly engine: NarratorEnginePort;
  private readonly settingsStore: NarratorSettingsStore;
  private readonly now: () => number;
  private readonly isQuietHoursActive: (() => boolean | Promise<boolean>) | undefined;
  private readonly categoryCooldownsMs: Record<string, number>;

  private settings: NarratorSettings;
  private settingsLoaded = false;

  private readonly queue: QueueItem[] = [];
  private draining = false;
  private speaking = false;
  private readonly lastSpokenAtByCategory = new Map<string, number>();

  constructor(deps: NarratorControllerDeps) {
    this.engine = deps.engine;
    this.settingsStore = deps.settingsStore ?? new NarratorSettingsStore();
    this.now = deps.now ?? (() => Date.now());
    this.isQuietHoursActive = deps.isQuietHoursActive;
    this.categoryCooldownsMs = deps.categoryCooldownsMs ?? {};
    // Safe synchronous default until loadSettings() completes; narration
    // stays OFF the whole time, so nothing can speak on a stale default.
    this.settings = {
      language: 'off',
      english: { voiceId: null, rate: 1, pitch: 1 },
      cantonese: { voiceId: null, rate: 1, pitch: 1 },
      respectScreenReader: true,
      respectQuietHours: true,
    };
  }

  /** Loads persisted settings from disk. Must be awaited once before
   * narration behaves according to the user's saved preferences; before
   * that, the controller behaves as if narration is off (never as if it
   * is on with defaults), which is the safe direction to fail in. */
  async loadSettings(): Promise<NarratorSettings> {
    this.settings = await this.settingsStore.load();
    this.settingsLoaded = true;
    return this.settings;
  }

  getSettings(): NarratorSettings {
    return this.settings;
  }

  /** Replaces settings wholesale and persists them. Callers building a
   * settings UI should read `getSettings()`, copy, mutate, and pass the
   * whole object back here rather than mutating in place. */
  async updateSettings(settings: NarratorSettings): Promise<void> {
    this.settings = settings;
    await this.settingsStore.save(settings);
    if (settings.language === 'off') {
      // Turning narration off cancels anything mid-utterance immediately,
      // rather than letting the current line finish.
      this.engine.cancelSpeaking();
      this.rejectQueueAsDisabled();
    }
  }

  /**
   * Enqueues one narration request and resolves once its final outcome is
   * known: spoken, skipped (and why), superseded by a newer request with
   * the same dedupeKey, or an engine error. Never throws for a normal
   * skip — those are reported outcomes, not exceptions, so a caller that
   * does not care about the result can safely ignore the returned
   * promise.
   */
  async narrate(request: NarrationRequest): Promise<NarrationOutcome> {
    if (this.settings.language === 'off') {
      return { kind: 'skipped-disabled' };
    }

    const outcome = await new Promise<NarrationOutcome>((resolve) => {
      // A queued (not yet speaking) request sharing the same category AND
      // dedupeKey is superseded by this newer one, so a rapidly updating
      // line never speaks a stale value. Only the request explicitly
      // marked with the same dedupeKey is replaced — an unrelated request
      // in the same category is never silently dropped.
      if (request.dedupeKey !== undefined) {
        const staleIndex = this.queue.findIndex(
          (item) =>
            item.request.category === request.category &&
            item.request.dedupeKey === request.dedupeKey,
        );
        if (staleIndex !== -1) {
          const [stale] = this.queue.splice(staleIndex, 1);
          // staleIndex came from findIndex, so splice always removes exactly
          // one element here; the undefined case is unreachable, but is
          // handled rather than asserted away.
          if (stale) {
            stale.resolve({ kind: 'superseded' });
          }
        }
      }

      this.queue.push({ request, enqueuedAt: this.now(), resolve });
    });

    void this.drain();
    return outcome;
  }

  /** Live status snapshot, including effective voice per active language
   * slot. Re-enumerates voices on every call (bounded by the engine's own
   * listVoices() cost) rather than caching, since the machine's voice list
   * can change at any time (an OS update, a Bluetooth voice pack
   * connecting) and this module must never report a stale "missing"
   * verdict once a voice reappears. */
  async getStatus(): Promise<NarratorStatus> {
    const voices = await this.engine.listVoices();
    const language = this.settings.language;
    return {
      language,
      speaking: this.speaking,
      queueDepth: this.queue.length,
      english:
        language === 'english' || language === 'both'
          ? this.slotStatus(this.settings.english, voices, ENGLISH_LANG_TAG)
          : null,
      cantonese:
        language === 'cantonese' || language === 'both'
          ? this.slotStatus(this.settings.cantonese, voices, CANTONESE_LANG_TAG)
          : null,
    };
  }

  private slotStatus(
    selection: VoiceSelection,
    voices: VoiceDescriptor[],
    langPrefix: string,
  ): NarratorSlotStatus {
    const matchingVoices = voices.filter((v) => voiceMatchesLanguage(v, langPrefix));
    const configured = selection.voiceId
      ? voices.find((v) => v.id === selection.voiceId)
      : undefined;
    const effective = configured ?? matchingVoices[0];

    return {
      effectiveVoiceId: effective?.id ?? null,
      effectiveVoiceName: effective?.name ?? null,
      configuredVoiceMissing: selection.voiceId !== null && configured === undefined,
      networkBacked: effective ? !effective.localService : false,
      noVoiceAvailable: matchingVoices.length === 0,
    };
  }

  private rejectQueueAsDisabled(): void {
    const pending = this.queue.splice(0, this.queue.length);
    for (const item of pending) {
      item.resolve({ kind: 'skipped-disabled' });
    }
  }

  /** Drains the queue one item at a time. Re-entrant calls (from
   * concurrent `narrate()` calls) are no-ops while a drain is already
   * running — the running loop will pick up newly pushed items itself —
   * which is what guarantees the engine is never asked to speak two
   * utterances at once. */
  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) {
          break;
        }
        await this.processOne(item);
      }
    } finally {
      this.draining = false;
    }
  }

  private async processOne(item: QueueItem): Promise<void> {
    const { request } = item;

    if (this.settings.language === 'off') {
      item.resolve({ kind: 'skipped-disabled' });
      return;
    }

    if (this.settings.respectQuietHours && this.isQuietHoursActive) {
      if (await this.isQuietHoursActive()) {
        item.resolve({ kind: 'skipped-quiet-hours' });
        return;
      }
    }

    if (this.settings.respectScreenReader && this.engine.isScreenReaderActive) {
      // An absent implementation means "unknown, assume no screen
      // reader" per the NarratorEnginePort contract; only an explicit
      // `true` suppresses narration here.
      if (await this.engine.isScreenReaderActive()) {
        item.resolve({ kind: 'skipped-screen-reader' });
        return;
      }
    }

    if (request.priority !== 'important') {
      const cooldownMs = this.categoryCooldownsMs[request.category] ?? DEFAULT_CATEGORY_COOLDOWN_MS;
      const lastSpokenAt = this.lastSpokenAtByCategory.get(request.category);
      if (lastSpokenAt !== undefined && this.now() - lastSpokenAt < cooldownMs) {
        item.resolve({ kind: 'skipped-cooldown' });
        return;
      }
    }

    const outcome = await this.speakInSelectedLanguages(request);
    this.lastSpokenAtByCategory.set(request.category, this.now());
    item.resolve(outcome);
  }

  /** Speaks the request in the configured language(s). For 'both', the
   * English line is fully spoken (its promise resolved by the engine)
   * before the Cantonese line begins — strictly serialized, never
   * overlapping, because `speak()` on the engine port is only ever called
   * again after the previous call's promise has settled. */
  private async speakInSelectedLanguages(request: NarrationRequest): Promise<NarrationOutcome> {
    this.speaking = true;
    try {
      const speakEnglish = this.settings.language === 'english' || this.settings.language === 'both';
      const speakCantonese =
        this.settings.language === 'cantonese' || this.settings.language === 'both';

      if (speakEnglish) {
        const outcome = await this.speakOneSlot(
          request.englishText,
          this.settings.english,
          ENGLISH_LANG_TAG,
        );
        if (outcome.kind === 'engine-error') {
          return outcome;
        }
      }

      if (speakCantonese) {
        const outcome = await this.speakOneSlot(
          request.cantoneseText,
          this.settings.cantonese,
          CANTONESE_LANG_TAG,
        );
        if (outcome.kind === 'engine-error') {
          return outcome;
        }
      }

      return { kind: 'spoken' };
    } finally {
      this.speaking = false;
    }
  }

  private async speakOneSlot(
    text: string,
    selection: VoiceSelection,
    langTag: string,
  ): Promise<NarrationOutcome> {
    const result = await this.engine.speak({
      text,
      voiceId: selection.voiceId,
      lang: langTag,
      rate: selection.rate,
      pitch: selection.pitch,
    });

    switch (result.kind) {
      case 'completed':
      case 'voice-not-installed':
        // A missing configured voice still speaks via automatic fallback;
        // the CONFIGURED CHOICE is left untouched in settings (never
        // silently reset) so it resumes working the moment it is
        // available again. Status callers learn of the fallback via
        // getStatus()'s `configuredVoiceMissing` flag, not by this
        // settings object changing underneath them.
        return { kind: 'spoken' };
      case 'no-voice-for-language':
        return {
          kind: 'engine-error',
          message: `No installed voice can read this language (${langTag}).`,
        };
      case 'error':
        return { kind: 'engine-error', message: result.message };
      default:
        return { kind: 'engine-error', message: 'Unknown speak outcome.' };
    }
  }
}

function voiceMatchesLanguage(voice: VoiceDescriptor, langPrefix: string): boolean {
  return voice.lang.toLowerCase().startsWith(langPrefix.toLowerCase());
}

export type { NarratedLanguage };
