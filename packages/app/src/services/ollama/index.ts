/**
 * Public API surface for the local Ollama suite manager.
 *
 * Everything this subsystem does talks either to Ollama's own local
 * loopback HTTP API (health, models, pulls, chat) or, for the model
 * catalogue only, to the public Ollama library website over HTTPS - never
 * anything else, never a cloud model service, never analytics.
 *
 * This module is the one file the rest of the app (main.ts / ipc.ts) is
 * expected to import from; the other files in this directory are
 * implementation detail.
 */

export {
  LoopbackClient,
  OllamaClientError,
  DEFAULT_BASE_URL,
  type LoopbackClientOptions,
} from './loopback-client';

export { diagnoseConnection } from './diagnostics';

export {
  listInstalledModels,
  listRunningModels,
  showModelCapabilities,
  deleteModel,
  copyModel,
} from './models';

export {
  OllamaWebCatalogSource,
  refreshCatalog,
  CatalogCache,
  buildCatalogState,
  mergeCatalogWithInstalled,
  type CatalogSource,
  type CatalogRefreshResult,
} from './catalog';

export { detectHardware, evaluateFit } from './hardware';

export {
  PullQueueManager,
  estimateBatch,
  sizeMapFromCatalogTags,
} from './pull-queue';

export {
  ChatManager,
  validateGenerationParams,
  redactSecretsLikeText,
} from './chat';

export type {
  OllamaConnectionState,
  OllamaDiagnosis,
  ModelDetails,
  InstalledModel,
  RunningModel,
  ModelCapabilities,
  CatalogTag,
  CatalogModel,
  CatalogCompleteness,
  CatalogSnapshot,
  MergedCatalogEntry,
  CatalogState,
  GpuInfo,
  HardwareSnapshot,
  FitVerdict,
  FitEvidence,
  PullItemState,
  PullBatchItem,
  PullBatchEstimate,
  PullBatchState,
  ChatRole,
  ChatMessage,
  ChatGenerationParams,
  ChatSession,
  ChatSessionSummary,
} from './types';
