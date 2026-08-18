import type { MeadowmarkApi } from '../../packages/app/src/runtime-contract';
import type { UniversalHostBridge } from '../../packages/ui/src/universal/bridge';

type Assert<T extends true> = T;
type Compatible<Runtime, Renderer> = Runtime extends Renderer ? true : false;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
    ? true
    : false
  : false;
type Method<T> = Exclude<T, undefined>;

type ExpectedNamespaces =
  | 'appInfo'
  | 'settings'
  | 'schedules'
  | 'logo'
  | 'converter'
  | 'exports'
  | 'ollama'
  | 'narrator'
  | 'authenticator'
  | 'locks'
  | 'history'
  | 'updater'
  | 'status';

type _ExactNamespaceKeys = Assert<Equal<keyof UniversalHostBridge, ExpectedNamespaces>>;
type _AppInfo = Assert<Compatible<MeadowmarkApi['appInfo'], Method<UniversalHostBridge['appInfo']>>>;
type _SettingsSet = Assert<Compatible<MeadowmarkApi['settings']['set'], Method<NonNullable<UniversalHostBridge['settings']>['set']>>>;
type _ConverterCatalog = Assert<Compatible<MeadowmarkApi['converter']['listCatalog'], Method<NonNullable<UniversalHostBridge['converter']>['listCatalog']>>>;
type _ConverterPick = Assert<Compatible<MeadowmarkApi['converter']['pickSource'], Method<NonNullable<UniversalHostBridge['converter']>['pickSource']>>>;
type _ConverterDetect = Assert<Compatible<MeadowmarkApi['converter']['detect'], Method<NonNullable<UniversalHostBridge['converter']>['detect']>>>;
type _ConverterConvert = Assert<Compatible<MeadowmarkApi['converter']['convert'], Method<NonNullable<UniversalHostBridge['converter']>['convert']>>>;
type _OllamaDiagnose = Assert<Compatible<MeadowmarkApi['ollama']['diagnose'], Method<NonNullable<UniversalHostBridge['ollama']>['diagnose']>>>;
type _OllamaRefresh = Assert<Compatible<MeadowmarkApi['ollama']['refreshCatalog'], Method<NonNullable<UniversalHostBridge['ollama']>['refreshCatalog']>>>;
type _OllamaCatalog = Assert<Compatible<MeadowmarkApi['ollama']['catalogState'], Method<NonNullable<UniversalHostBridge['ollama']>['catalogState']>>>;
type _OllamaPullCreate = Assert<Compatible<MeadowmarkApi['ollama']['pulls']['create'], Method<NonNullable<NonNullable<UniversalHostBridge['ollama']>['pulls']>['create']>>>;
type _OllamaPullRun = Assert<Compatible<MeadowmarkApi['ollama']['pulls']['run'], Method<NonNullable<NonNullable<UniversalHostBridge['ollama']>['pulls']>['run']>>>;
type _OllamaPullCancel = Assert<Compatible<MeadowmarkApi['ollama']['pulls']['cancel'], Method<NonNullable<NonNullable<UniversalHostBridge['ollama']>['pulls']>['cancel']>>>;
type _AuthenticatorList = Assert<Compatible<MeadowmarkApi['authenticator']['listEntries'], Method<NonNullable<UniversalHostBridge['authenticator']>['listEntries']>>>;
type _LocksList = Assert<Compatible<MeadowmarkApi['locks']['list'], Method<NonNullable<UniversalHostBridge['locks']>['list']>>>;
type _HistoryRevisions = Assert<Compatible<MeadowmarkApi['history']['revisions'], Method<NonNullable<UniversalHostBridge['history']>['revisions']>>>;
type _HistoryExport = Assert<Compatible<MeadowmarkApi['history']['exportRedacted'], Method<NonNullable<UniversalHostBridge['history']>['exportRedacted']>>>;
type _UpdaterState = Assert<Compatible<MeadowmarkApi['updater']['state'], Method<NonNullable<UniversalHostBridge['updater']>['state']>>>;
type _UpdaterCheck = Assert<Compatible<MeadowmarkApi['updater']['check'], Method<NonNullable<UniversalHostBridge['updater']>['check']>>>;
type _UpdaterApply = Assert<Compatible<MeadowmarkApi['updater']['apply'], Method<NonNullable<UniversalHostBridge['updater']>['apply']>>>;
type _StatusSnapshot = Assert<Compatible<MeadowmarkApi['status']['snapshot'], Method<NonNullable<UniversalHostBridge['status']>['snapshot']>>>;
