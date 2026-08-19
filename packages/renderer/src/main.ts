/**
 * Renderer process entry point. Boots the simulation, the 3D renderer, and
 * the DOM interface, and wires them together every tick. This is the seam
 * the four Meadowmark packages never had: everything below either reads
 * from or normalizes against the adapters in ./adapters/.
 */

import {
  evaluateAchievements,
  migrate,
  newGame,
  resumeOffline,
  serialize,
  tick,
  type GameEvent,
  type GameState,
} from '@meadowmark/shared';
import { createRenderer, type GameStateView } from '@meadowmark/engine';
import { hydrateSettingsFromHost, mountUi, notifyError, notifyInfo, notifySuccess, type HostBridge } from '@meadowmark/ui';

import { achievementCatalog, dailyTaskTemplates, regattaScoreBarCap, regattaTaskTemplates, tickConfig } from './content.js';
import { stateToEngineView } from './adapters/state-to-engine.js';
import { mapOfflineSummary, stateToUiView } from './adapters/state-to-ui.js';
import { applyAction, createAchievementCounters, type AchievementCounters } from './adapters/ui-actions.js';
import { createRendererBridge } from './adapters/renderer-bridge.js';
import { Store } from './store.js';

const TICK_INTERVAL_MS = 1000;
const AUTOSAVE_INTERVAL_MS = 30_000;

function buildCounterSnapshot(state: GameState, cumulative: AchievementCounters): Record<string, number> {
  return {
    totalHarvests: cumulative.totalHarvests,
    totalGoodsProduced: cumulative.totalGoodsProduced,
    ordersFulfilled: cumulative.ordersFulfilled,
    // These three are always derivable straight from current state, so
    // there's no need to track them cumulatively - a demolish/removal
    // capability (which shared doesn't have yet, see ui-actions.ts) would
    // even make a naive cumulative buildingsPlaced counter wrong.
    buildingsPlaced: state.town.buildings.length,
    tilesDug: state.mine.tiles.filter((t) => t.dug).length,
    animalsHatched: state.zoo.hatchedSpecies.length,
  };
}

function describeEvent(event: GameEvent): { kind: 'success' | 'info'; message: string } | null {
  switch (event.type) {
    case 'harvestReady':
      return { kind: 'info', message: `A crop is ready to harvest.` };
    case 'animalProductReady':
      return { kind: 'info', message: `An animal product is ready to collect.` };
    case 'factoryProductionReady':
      return { kind: 'info', message: `Factory production is ready to collect.` };
    case 'trainArrived':
      return { kind: 'success', message: `The train has returned with materials.` };
    case 'helicopterChestReady':
      return { kind: 'success', message: `The helicopter reputation chest is ready.` };
    case 'shipChestReady':
      return { kind: 'success', message: `The ship has filled every crate - chest ready.` };
    case 'buildingCompleted':
      return { kind: 'success', message: `A building has finished construction.` };
    case 'levelUp':
      return { kind: 'success', message: `Level up! You are now level ${event.newLevel}.` };
    case 'achievementTierUnlocked':
      return { kind: 'success', message: `An achievement tier was unlocked.` };
    case 'dailyChestReady':
      return { kind: 'success', message: `Every daily task is complete - claim your chest.` };
    case 'mineRegenerated':
      return { kind: 'info', message: `The mine has regenerated for a new day.` };
    default:
      return null;
  }
}

/**
 * Where the player's own farm is, in tile coordinates.
 *
 * Deliberately narrow. An earlier version averaged EVERY view entity including
 * scattered scenery and roads, which are spread across the whole 40x40 grid --
 * so the average landed near the middle of the map and the six starting plots
 * over in one corner were still off screen. Scenery is decoration; the plots and
 * the buildings the player owns are what they came to look at.
 *
 * Preference order: crop plots, then placed buildings, then animal sheds, then
 * the middle of the terrain grid.
 */
function contentCentreTile(view: GameStateView): { x: number; y: number } {
  const mean = (points: readonly { x: number; y: number }[]): { x: number; y: number } | null => {
    if (points.length === 0) return null;
    let sumX = 0;
    let sumY = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
    }
    return { x: sumX / points.length, y: sumY / points.length };
  };

  // Field BEDS first, not planted crops. mapCropPlots skips a plot with no crop
  // in it, so on a fresh save cropPlots is empty and a centroid built from it
  // falls through to the grid centre -- which is exactly the empty ground this
  // whole fix exists to stop the player staring at. The beds are emitted for
  // every unlocked plot whether or not anything is growing.
  const beds = mean(
    view.decorations.filter((d) => d.kind === 'field_plot_empty').map((d) => d.position),
  );
  if (beds) return beds;
  const plots = mean(view.cropPlots.map((c) => c.position));
  if (plots) return plots;
  const buildings = mean(view.buildings.map((b) => b.position));
  if (buildings) return buildings;
  const animals = mean(view.animals.map((a) => a.position));
  if (animals) return animals;

  let maxX = 0;
  let maxY = 0;
  for (const tile of view.tiles) {
    if (tile.position.x > maxX) maxX = tile.position.x;
    if (tile.position.y > maxY) maxY = tile.position.y;
  }
  return { x: maxX / 2, y: maxY / 2 };
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('mm-canvas');
  const uiRoot = document.getElementById('mm-ui-root');
  if (!(canvas instanceof HTMLCanvasElement) || !(uiRoot instanceof HTMLElement)) {
    throw new Error('main: expected #mm-canvas and #mm-ui-root to exist in index.html');
  }

  wireTitleBar();
  await hydrateSettingsFromHost();

  const now = Date.now();
  const raw = await window.meadowmark.loadGame();
  let state: GameState = raw ? migrate(raw) : newGame({ playerName: 'Farmer', now, dailyTaskTemplates, regattaTaskTemplates, regattaScoreBarCap });

  const resumed = resumeOffline(state, now, tickConfig);
  state = resumed.state;
  let pendingOfflineSummary =
    resumed.summary.elapsedMs > 0 ? mapOfflineSummary(resumed.summary) : null;

  const counters = createAchievementCounters();

  const renderer = createRenderer(canvas, { reducedMotion: prefersReducedMotion() });
  const firstView = stateToEngineView(state, now);
  renderer.setState(firstView);
  // Point the camera at the town before the first frame. The controller
  // defaults to world origin, which is the CORNER of the 40x40 grid, while
  // every starting plot, shed and factory sits inland -- so without this the
  // player opens the game looking at empty ground, and zooming out only frames
  // more of it.
  renderer.camera.focusOnTile(contentCentreTile(firstView));
  const rendererBridge = createRendererBridge(canvas, renderer);

  // Building selection is presentational-only (see ui-actions.ts's
  // 'town/select' case): it never touches GameState, so it lives here
  // alongside state rather than inside the reducer.
  let selectedBuildingInstanceId: string | null = null;

  const uiStore = new Store(stateToUiView(state, now, pendingOfflineSummary, selectedBuildingInstanceId));

  const host: HostBridge = {
    // Refined below once window.meadowmark.appInfo() resolves. Windows is
    // this project's only shipped target, so it is the honest default
    // while that lookup is in flight.
    platform: 'win32',
    dispatch(action) {
      if (action.type === 'offlineSummary/acknowledge') {
        pendingOfflineSummary = null;
        uiStore.set(stateToUiView(state, Date.now(), pendingOfflineSummary, selectedBuildingInstanceId));
        return;
      }

      if (action.type === 'town/select') {
        // Presentational only, per ui-actions.ts's own 'town/select' case:
        // this never touches GameState, so it's handled here and never
        // reaches applyAction at all. A demolished building's id simply
        // stops matching anything in mapTown()'s placed list, which
        // self-heals the info panel back to "no selection" without this
        // needing to watch for that.
        selectedBuildingInstanceId = action.instanceId;
        uiStore.set(stateToUiView(state, Date.now(), pendingOfflineSummary, selectedBuildingInstanceId));
        return;
      }

      const before = state;
      state = applyAction(state, counters, action, Date.now());
      if (state === before) {
        // Nothing changed - most likely a guard inside the shared action
        // function rejected it (insufficient funds, not ready, etc). Not
        // every rejection is worth a toast, so this stays silent; the
        // panel that dispatched the action is expected to have already
        // disabled the control it came from when it can't succeed.
        return;
      }

      const evalResult = evaluateAchievements(state, achievementCatalog, buildCounterSnapshot(state, counters), Date.now());
      state = evalResult.state;
      for (const event of evalResult.events) {
        const described = describeEvent(event);
        if (described) (described.kind === 'success' ? notifySuccess : notifyInfo)(described.message);
      }

      uiStore.set(stateToUiView(state, Date.now(), pendingOfflineSummary, selectedBuildingInstanceId));
      renderer.setState(stateToEngineView(state, Date.now()));
    },
  };

  window.meadowmark
    .appInfo()
    .then((info) => {
      if (info.platform === 'darwin' || info.platform === 'linux' || info.platform === 'win32') {
        host.platform = info.platform;
      }
    })
    .catch(() => {
      // Non-fatal: the host bridge's platform field only affects a couple
      // of platform-conditional UI affordances. The 'win32' default stands.
    });

  const mounted = mountUi(uiRoot, { state$: uiStore, renderer: rendererBridge, host });

  if (pendingOfflineSummary) {
    const s = resumed.summary;
    notifyInfo(
      `Welcome back! While you were away: ${s.readyHarvests} crops ripened, ${s.readyFactoryBatches} factory batches finished, ${s.trainArrivals} train${s.trainArrivals === 1 ? '' : 's'} returned.`,
    );
  }

  // ---- main tick loop --------------------------------------------------

  const tickHandle = window.setInterval(() => {
    const tickNow = Date.now();
    const elapsedMs = tickNow - state.lastTickAt;
    const result = tick(state, elapsedMs, tickNow, tickConfig);
    state = result.state;

    for (const event of result.events) {
      const described = describeEvent(event);
      if (described) (described.kind === 'success' ? notifySuccess : notifyInfo)(described.message);
    }

    uiStore.set(stateToUiView(state, tickNow, pendingOfflineSummary, selectedBuildingInstanceId));
    renderer.setState(stateToEngineView(state, tickNow));
  }, TICK_INTERVAL_MS);

  // ---- autosave ----------------------------------------------------------

  async function save(): Promise<void> {
    try {
      await window.meadowmark.saveGame(serialize(state, Date.now()));
    } catch (error) {
      notifyError(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const autosaveHandle = window.setInterval(() => {
    void save();
  }, AUTOSAVE_INTERVAL_MS);

  window.addEventListener('beforeunload', () => {
    void save();
  });

  window.addEventListener('pagehide', () => {
    window.clearInterval(tickHandle);
    window.clearInterval(autosaveHandle);
    mounted.unmount();
    renderer.dispose();
    rendererBridge.dispose();
  });
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function wireTitleBar(): void {
  const minimize = document.getElementById('mm-titlebar-minimize');
  const maximize = document.getElementById('mm-titlebar-maximize');
  const close = document.getElementById('mm-titlebar-close');

  minimize?.addEventListener('click', () => {
    void window.meadowmark.window.minimize();
  });
  // GAP: the main process toggles maximize/restore server-side and sends a
  // 'window:maximized-changed' event back (see packages/app/src/main.ts),
  // but packages/app/src/preload.ts never forwards that event to the
  // renderer (no matching `ipcRenderer.on` registration) - out of this
  // package's scope to add. The button below still works correctly (each
  // click toggles maximize/restore), it just can't swap its own icon to
  // reflect the real window state without that channel.
  maximize?.addEventListener('click', () => {
    void window.meadowmark.window.maximize();
  });
  close?.addEventListener('click', () => {
    void window.meadowmark.window.close();
  });
}

boot().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Meadowmark failed to boot', error);
  const root = document.getElementById('mm-ui-root');
  if (root) {
    root.textContent = `Meadowmark failed to start: ${error instanceof Error ? error.message : String(error)}`;
    root.style.cssText = 'pointer-events:auto;display:flex;align-items:center;justify-content:center;color:#e4e6eb;font-family:system-ui,sans-serif;padding:24px;text-align:center;';
  }
});
