/** Electron main-process entry point and privileged service owner. */
import { BrowserWindow, app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc';
import { APP_ID } from './identity';
import { IPC_CHANNELS } from './ipc-channels';
import { AppRuntime } from './runtime-services';

const isDev = Boolean(process.env.MEADOWMARK_DEV);
app.setAppUserModelId(APP_ID);

let mainWindow: BrowserWindow | null = null;
let runtime: AppRuntime | null = null;
let unregisterIpc: (() => void) | null = null;
let unsubscribeUpdater: (() => void) | null = null;
let statusTimer: NodeJS.Timeout | null = null;
let shutdownStarted = false;
let shutdownComplete = false;
const packagedRendererPath = path.resolve(__dirname, '../../ui/dist/index.html');
const configuredRendererUrl = process.env.MEADOWMARK_RENDERER_URL;

function isAllowedRendererUrl(rawUrl: string): boolean {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return false; }
  if (url.protocol === 'file:') {
    try { return path.resolve(fileURLToPath(url)) === packagedRendererPath; } catch { return false; }
  }
  if (!isDev || !configuredRendererUrl) return false;
  try {
    const configured = new URL(configuredRendererUrl);
    const isLoopback = configured.hostname === '127.0.0.1' || configured.hostname === 'localhost';
    return isLoopback && (configured.protocol === 'http:' || configured.protocol === 'https:') && url.origin === configured.origin;
  } catch {
    return false;
  }
}

function publishRuntimeStatus(): void {
  const activeRuntime = runtime;
  if (!activeRuntime || !mainWindow || mainWindow.isDestroyed()) return;
  void activeRuntime.trackOperation(activeRuntime.runtimeStatus()).then((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC_CHANNELS.runtimeStatusChanged, status);
  }).catch(() => undefined);
}

async function createMainWindow(): Promise<void> {
  if (!runtime) throw new Error('AppRuntime must initialize before creating a window.');
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    frame: false,
    show: false,
    backgroundColor: '#111318',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  runtime.narratorEngine.setSender((message) => {
    if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.narratorEngineRequest, message);
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedRendererUrl(targetUrl)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    runtime?.narratorEngine.setSender(null);
    if (mainWindow === window) mainWindow = null;
  });
  window.on('maximize', () => window.webContents.send(IPC_CHANNELS.windowMaximizedChanged, true));
  window.on('unmaximize', () => window.webContents.send(IPC_CHANNELS.windowMaximizedChanged, false));
  window.webContents.on('did-finish-load', publishRuntimeStatus);

  const rendererUrl = configuredRendererUrl;
  if (rendererUrl) {
    if (!isAllowedRendererUrl(rendererUrl)) throw new Error('MEADOWMARK_RENDERER_URL must be an explicit loopback development origin.');
    await window.loadURL(rendererUrl);
  } else {
    await window.loadFile(packagedRendererPath);
  }
  if (isDev) window.webContents.openDevTools({ mode: 'detach' });
}

async function initializeApplication(): Promise<void> {
  runtime = new AppRuntime();
  await runtime.initialize();
  unregisterIpc = registerIpcHandlers(runtime, () => mainWindow);
  unsubscribeUpdater = runtime.updater.onStateChange((state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.updaterStateChanged, runtime?.publicUpdaterState(state));
    }
    publishRuntimeStatus();
  });
  statusTimer = setInterval(publishRuntimeStatus, 30_000);
  statusTimer.unref?.();
  await createMainWindow();
}

async function shutdownApplication(): Promise<void> {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = null;
  unsubscribeUpdater?.();
  unsubscribeUpdater = null;
  unregisterIpc?.();
  unregisterIpc = null;
  await runtime?.dispose();
  runtime = null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  void app.whenReady().then(initializeApplication).catch((error) => {
    console.error('Application startup failed.', error);
    app.quit();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && runtime) {
      void createMainWindow().catch((error) => console.error('Could not recreate the application window.', error));
    }
  });
  app.on('before-quit', (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    void shutdownApplication().finally(() => {
      shutdownComplete = true;
      app.quit();
    });
  });
}
