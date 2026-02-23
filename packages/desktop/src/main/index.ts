/**
 * @license Apache-2.0
 * Gemini Cowork Desktop — Electron main process entry point.
 */

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerBridgeHandlers } from './bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Environment ──────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== 'production';
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// ── Window ───────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d0f12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Open DevTools in development
  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // Handle external link clicks
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => win.show());

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  return win;
}

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  mainWindow = createMainWindow();

  // Register all IPC handlers (bridge to agent core)
  registerBridgeHandlers(ipcMain, mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Security: prevent new windows ────────────────────────────────────────────

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== 'http://localhost:5173' && !isDev) {
      event.preventDefault();
    }
  });
});
