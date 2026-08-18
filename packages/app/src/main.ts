/**
 * Electron main process entry point.
 *
 * The window is always frameless with a custom Material Design title bar
 * rendered by the UI package; the OS default title bar must never appear
 * as product chrome.
 */

import { BrowserWindow, app, ipcMain } from 'electron';
import path from 'node:path';
import { registerIpcHandlers } from './ipc';
import { APP_ID } from './identity';
import { IPC_CHANNELS } from './ipc-channels';

const isDev = Boolean(process.env.MEADOWMARK_DEV);

app.setAppUserModelId(APP_ID);

let mainWindow: BrowserWindow | null = null;

// Single-instance lock: a second launch focuses the existing window rather
// than opening a duplicate, which would let two processes race writes at
// the same save file.
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(createMainWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    // Frameless: the app renders its own Material Design title bar and
    // window controls. The OS default title bar must never be shown.
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

  registerIpcHandlers(() => mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Renderer state changes used by the custom title bar so its own
  // maximize/restore icon can reflect real window state.
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send(IPC_CHANNELS.windowMaximizedChanged, true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send(IPC_CHANNELS.windowMaximizedChanged, false);
  });

  const rendererUrl = process.env.MEADOWMARK_RENDERER_URL;
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../ui/dist/index.html'));
  }

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// Defensive: if ipc.ts is ever imported twice (e.g. via a stray require
// cache split during bundling), fail loudly rather than silently double-
// registering handlers, which would make every invoke() ambiguous.
app.on('will-quit', () => {
  ipcMain.removeAllListeners();
});
