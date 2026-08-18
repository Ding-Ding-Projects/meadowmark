/**
 * Shared types for the spoken narrator subsystem.
 *
 * Speech synthesis (the Web Speech `speechSynthesis` API) only exists in a
 * renderer/DOM context, so this module never touches it directly. The main
 * process owns policy — what to say, when, in which language, how often —
 * and the renderer is a thin engine behind the `NarratorEnginePort`
 * interface defined below. See narrator-controller.ts for the main-side
 * queue that drives that port.
 */

/** Which language(s) narration is spoken in. 'both' speaks the English
 * line, waits for it to finish, then speaks the Cantonese line — strictly
 * serialized, never overlapping. */
export type NarratedLanguage = 'off' | 'english' | 'cantonese' | 'both';

/**
 * A stable, machine-scoped identity for one installed synthesis voice.
 *
 * `id` MUST be the platform/engine's own stable identity (the Web Speech
 * `SpeechSynthesisVoice.voiceURI`), never `name`. Voice *names* are not
 * unique — two voices from different engines can share a display name —
 * and platforms localize display names, so a profile keyed by name can
 * silently stop matching after an OS update or on a different machine.
 * `voiceURI` is the one value the platform itself treats as identity.
 */
export interface VoiceDescriptor {
  /** Stable voice identity (SpeechSynthesisVoice.voiceURI). Persist this,
   * never `name`. */
  id: string;
  /** Human-readable label for the picker UI. Never persisted as identity. */
  name: string;
  /** BCP-47 language tag the voice reads, e.g. "en-US", "yue-HK", "zh-HK". */
  lang: string;
  /** False for a voice that requires network access to synthesize speech
   * (a cloud voice). The narrator must warn the user such a voice will go
   * quiet offline, and must never silently substitute another voice. */
  localService: boolean;
}

/**
 * One narrated language slot's voice preference. `voiceId: null` means
 * "Choose automatically" — the shipped default for both slots, since the
 * app cannot know what is installed on a given machine until it asks.
 * Never ship a specific named voice as the default.
 */
export interface VoiceSelection {
  /** Stable voice identity (VoiceDescriptor.id), or null for automatic
   * selection among the machine's voices for this language. */
  voiceId: string | null;
  /** Speech rate. Web Speech's documented range is roughly 0.1–10, with 1
   * being the voice's normal delivery. Persisted per language slot because
   * different voices/engines have different comfortable ranges. */
  rate: number;
  /** Speech pitch. Web Speech's documented range is roughly 0–2, with 1
   * being the voice's normal delivery. */
  pitch: number;
}

/** Default rate/pitch: the voice's own normal delivery, unmodified. */
export const DEFAULT_RATE = 1;
export const DEFAULT_PITCH = 1;

export function defaultVoiceSelection(): VoiceSelection {
  return { voiceId: null, rate: DEFAULT_RATE, pitch: DEFAULT_PITCH };
}

/** Persisted narrator settings. Narration is OFF by default and is enabled
 * only by explicit user action — this default must never be flipped. */
export interface NarratorSettings {
  language: NarratedLanguage;
  english: VoiceSelection;
  cantonese: VoiceSelection;
  /** When true (default), the narrator ducks/yields while an active
   * screen reader is detected, rather than talking over it. */
  respectScreenReader: boolean;
  /** When true (default), the narrator stays silent during the platform's
   * reduced-sound / quiet-hours window, where the host exposes one. */
  respectQuietHours: boolean;
}

export function defaultNarratorSettings(): NarratorSettings {
  return {
    language: 'off',
    english: defaultVoiceSelection(),
    cantonese: defaultVoiceSelection(),
    respectScreenReader: true,
    respectQuietHours: true,
  };
}

/**
 * A category groups related narration lines for cooldown purposes (e.g.
 * "harvest", "weather", "error"). An open-ended string rather than an enum
 * so callers outside this module can introduce new categories without
 * changing this package; the controller does not need to know what any of
 * them mean semantically.
 */
export type NarrationCategory = string;

/** One line of narration, pre-rendered by the caller in both languages at
 * the caller's chosen funny level. This module never invents wording: tone
 * is the caller's responsibility, and the facts inside the text (what
 * happened, what to do) must remain intact regardless of tone — including
 * for the 'error' and 'warning' categories, which are never rate-limited
 * out of existence (see NarratorController). */
export interface NarrationRequest {
  category: NarrationCategory;
  englishText: string;
  cantoneseText: string;
  /**
   * When two requests in the same category share a dedupeKey, a newer
   * request that arrives while an older one of the same key is still
   * queued (not yet speaking) REPLACES it rather than stacking behind it —
   * e.g. a repeatedly-updated "3 crops ready" becomes "5 crops ready"
   * without speaking the stale count first. Omit for lines that should
   * never be superseded by one another.
   */
  dedupeKey?: string;
  /** 'error' and 'warning' bypass the per-category cooldown (but never the
   * one-utterance-at-a-time serialization) so a real failure is never
   * silently dropped by a rate limit. Default 'normal'. */
  priority?: 'normal' | 'important';
}

/** What actually happened when the controller tried to speak a request.
 * Reported back to the caller so a caller that cares (e.g. a settings
 * screen showing "last spoken") can render real status rather than assume
 * success. */
export type NarrationOutcome =
  | { kind: 'spoken' }
  | { kind: 'skipped-disabled' }
  | { kind: 'skipped-quiet-hours' }
  | { kind: 'skipped-screen-reader' }
  | { kind: 'skipped-cooldown' }
  | { kind: 'superseded' }
  | { kind: 'engine-error'; message: string };

/**
 * Renderer-implemented engine port. The main process never talks to
 * `speechSynthesis` directly — it cannot; that API only exists in a
 * document context — so this narrow interface is the whole surface the
 * renderer must implement and expose back to the main-side controller
 * (typically over IPC, wired by the orchestrator).
 *
 * IMPORTANT for the implementer: `speechSynthesis.getVoices()` commonly
 * returns an EMPTY array on the very first call and only populates after
 * the async `voiceschanged` event fires — sometimes hundreds of
 * milliseconds later, and on some platforms not until a voice is used
 * once. A `listVoices()` implementation that reads the list exactly once
 * will report "no voices installed" on a machine that genuinely has forty
 * of them. Subscribe to `voiceschanged`, re-read, and resolve once real
 * data has arrived (with a bounded timeout so a platform that never fires
 * the event does not hang the caller forever).
 */
export interface NarratorEnginePort {
  /** Returns every voice currently known to the renderer's speech engine.
   * See the class-level note above about the empty-then-populated timing
   * of voice enumeration. */
  listVoices(): Promise<VoiceDescriptor[]>;

  /** Speaks exactly one utterance and resolves only once it has finished
   * (or failed). The controller never calls this again before the
   * previous call has resolved — that is the whole serialization
   * contract, so this method itself does not need to queue anything. */
  speak(instruction: SpeakInstruction): Promise<SpeakOutcome>;

  /** Immediately stops any utterance currently speaking. Used when
   * settings change (e.g. narration is turned off) or a superseding
   * request needs to interrupt. */
  cancelSpeaking(): void;

  /** Best-effort detection of an active screen reader on this machine, for
   * yield/duck behavior. Optional: platforms/renderers with no reliable
   * detection method may omit it, and the controller treats an absent
   * implementation as "unknown, assume no screen reader". */
  isScreenReaderActive?(): Promise<boolean>;
}

export interface SpeakInstruction {
  text: string;
  /** The stable voice id to use, or null to let the engine pick any voice
   * matching `lang` — the "Choose automatically" case. */
  voiceId: string | null;
  /** BCP-47 language tag to request when `voiceId` is null, or to fall
   * back to if the requested `voiceId` is not installed on this machine. */
  lang: string;
  rate: number;
  pitch: number;
}

export type SpeakOutcome =
  | { kind: 'completed'; usedVoiceId: string | null; usedVoiceName: string | null }
  | { kind: 'voice-not-installed'; fellBackToVoiceId: string | null }
  | { kind: 'no-voice-for-language' }
  | { kind: 'error'; message: string };

/** Live status the controller maintains and callers may read at any time
 * (e.g. to render "narrator: speaking in Cantonese via <voice>" in
 * settings). This is deliberately explicit rather than inferred, per the
 * project rule against silent fallbacks that look like they worked. */
export interface NarratorStatus {
  language: NarratedLanguage;
  /** True while an utterance is actively being spoken. */
  speaking: boolean;
  /** Number of requests currently waiting behind the one that is speaking
   * (or about to speak). */
  queueDepth: number;
  /** Per-language-slot status, present only for slots that are actually in
   * use given the current `language` setting. */
  english: NarratorSlotStatus | null;
  cantonese: NarratorSlotStatus | null;
}

export interface NarratorSlotStatus {
  /** The voice id that will actually be used the next time this slot
   * speaks: the configured id if it is present on this machine, or the
   * engine's automatic choice otherwise. */
  effectiveVoiceId: string | null;
  effectiveVoiceName: string | null;
  /** True when the user's configured voice id is not present among this
   * machine's currently enumerated voices, so the engine is falling back
   * to automatic selection. The configured choice is KEPT (never silently
   * reset) so it can resume working the moment the voice reappears (e.g.
   * a laptop reconnecting to a docked Bluetooth voice pack, or an OS
   * update restoring it). */
  configuredVoiceMissing: boolean;
  /** True when the effective voice is not a local service, so it will go
   * silent with the network unplugged. */
  networkBacked: boolean;
  /** True when this machine has NO voice at all capable of reading this
   * language. Narration for this slot cannot function until one is
   * installed. */
  noVoiceAvailable: boolean;
}
