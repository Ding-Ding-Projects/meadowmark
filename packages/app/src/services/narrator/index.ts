/**
 * Public entry point for the narrator + personal-vocabulary subsystem.
 * The orchestrator should import from this barrel rather than reaching
 * into individual files, except for types that are useful standalone in
 * IPC channel definitions (also re-exported here).
 */

export {
  DEFAULT_PITCH,
  DEFAULT_RATE,
  defaultNarratorSettings,
  defaultVoiceSelection,
} from './narrator-types';
export type {
  NarratedLanguage,
  NarrationCategory,
  NarrationOutcome,
  NarrationRequest,
  NarratorEnginePort,
  NarratorSettings,
  NarratorSlotStatus,
  NarratorStatus,
  SpeakInstruction,
  SpeakOutcome,
  VoiceDescriptor,
  VoiceSelection,
} from './narrator-types';

export { NarratorSettingsStore } from './narrator-settings-store';
export { NarratorController } from './narrator-controller';
export type { NarratorControllerDeps } from './narrator-controller';

export {
  UNSAFE_KEYS,
  VOCABULARY_LIMITS,
  VOCABULARY_SCHEMA_VERSION,
} from './vocabulary-types';
export type {
  PersonalVocabulary,
  VocabularyRejectionReason,
  VocabularyState,
  VocabularyValidationResult,
} from './vocabulary-types';

export {
  PersonalVocabularyLoader,
  resolveVocabularyText,
  validateVocabularySource,
} from './vocabulary-loader';

export { StrictJsonError, parseStrictJson } from './vocabulary-json-parser';
export type { StrictJsonLimits, StrictJsonRejectionKind } from './vocabulary-json-parser';

export { validateVocabularyPayload } from './vocabulary-schema';
