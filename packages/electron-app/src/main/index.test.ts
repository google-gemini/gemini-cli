/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  App,
  IpcMain,
  BrowserWindow as ElectronBrowserWindow,
} from 'electron';
import type * as PTY from 'node-pty';
import type { Mock } from 'vitest';

// --- Mocks ---

const mockPtyProcess = {
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  onExit: vi.fn(() => ({ dispose: vi.fn() })),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
};
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPtyProcess),
}));

const mockWebContents = {
  send: vi.fn(),
  on: vi.fn(),
};
const mockMainWindow = {
  loadURL: vi.fn(),
  loadFile: vi.fn(),
  on: vi.fn(),
  isDestroyed: vi.fn(() => false),
  setBackgroundColor: vi.fn(),
  getContentSize: vi.fn(() => [800, 600]),
  webContents: mockWebContents,
};
vi.mock('electron', () => ({
  app: {
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(),
    dock: {
      setIcon: vi.fn(),
    },
  },
  BrowserWindow: vi.fn(() => mockMainWindow),
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
  },
  dialog: {
    showErrorBox: vi.fn(),
  },
}));

vi.mock('@google/gemini-cli/dist/src/config/settings.js', () => ({
  loadSettings: vi.fn(() =>
    Promise.resolve({
      merged: { theme: 'dark' },
      forScope: () => ({
        path: '/fake/path',
        settings: {},
      }),
    }),
  ),
  saveSettings: vi.fn(),
  SettingScope: {
    User: 'User',
    Workspace: 'Workspace',
    System: 'System',
  },
}));

vi.mock('@google/gemini-cli/dist/src/ui/themes/theme-manager.js', () => ({
  themeManager: {
    loadCustomThemes: vi.fn(),
    getTheme: vi.fn(() => ({
      colors: { Background: '#000' },
    })),
    getAvailableThemes: vi.fn(() => ['dark', 'light']),
  },
}));

vi.mock('os', () => ({
  default: {
    platform: vi.fn(() => 'darwin'),
    homedir: vi.fn(() => '/home/user'),
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    watch: vi.fn(() => ({ close: vi.fn() })),
    promises: {
      mkdir: vi.fn(() => Promise.resolve()),
    },
  },
}));

// --- Test Suite ---

const wait = () => new Promise((resolve) => setImmediate(resolve));

describe('main process (index.ts)', () => {
  let app: App;
  let BrowserWindow: typeof ElectronBrowserWindow;
  let ipcMain: IpcMain;
  let pty: typeof PTY;

  beforeEach(async () => {
    vi.resetModules(); // Ensure the main script runs fresh for each test
    // Dynamically import mocked modules to get the latest mock instances
    const electron = await import('electron');
    app = electron.app;
    BrowserWindow = electron.BrowserWindow;
    ipcMain = electron.ipcMain;
    pty = await import('node-pty');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a window when the app is ready', async () => {
    // The import in the test file will trigger the execution
    await import('./index');
    await app.whenReady(); // Ensure the promise is resolved
    await wait(); // Wait for the .then() chain to execute

    expect(BrowserWindow).toHaveBeenCalled();
    expect(mockMainWindow.loadFile).toHaveBeenCalled();
    expect(pty.spawn).toHaveBeenCalled();
  });

  it('handles terminal keystrokes', async () => {
    await import('./index');
    await app.whenReady();
    await wait();

    // Find the 'terminal.keystroke' handler
    const keystrokeHandler = (
      ipcMain.on as Mock
    ).mock.calls.find((call) => call[0] === 'terminal.keystroke')![1];
    (keystrokeHandler as (event: unknown, key: string) => void)(null, 'a');
    expect(mockPtyProcess.write).toHaveBeenCalledWith('a');
  });

  it('handles terminal resize', async () => {
    await import('./index');
    await app.whenReady();
    await wait();

    const resizeHandler = (
      ipcMain.on as Mock
    ).mock.calls.find((call) => call[0] === 'terminal.resize')![1];
    (resizeHandler as (event: unknown, size: object) => void)(null, {
      cols: 100,
      rows: 50,
    });
    expect(mockPtyProcess.resize).toHaveBeenCalledWith(100, 50);
  });

  it('handles settings:get', async () => {
    await import('./index');
    await app.whenReady();
    await wait();

    const settingsGetHandler = (
      ipcMain.handle as Mock
    ).mock.calls.find((call) => call[0] === 'settings:get')![1];
    const settings = await (settingsGetHandler as () => Promise<unknown>)();
    expect(settings).toHaveProperty('merged');
  });

  it('handles settings:set and updates theme', async () => {
    const { saveSettings } = await import(
      '@google/gemini-cli/dist/src/config/settings.js'
    );
    await import('./index');
    await app.whenReady();
    await wait();

    const settingsSetHandler = (
      ipcMain.handle as Mock
    ).mock.calls.find((call) => call[0] === 'settings:set')![1];

    await (
      settingsSetHandler as (
        event: unknown,
        args: { changes: object; scope: string },
      ) => Promise<unknown>
    )(null, { changes: { vimMode: true }, scope: 'User' });

    expect(saveSettings).toHaveBeenCalledWith({
      path: '/fake/path',
      settings: { vimMode: true },
    });
    expect(mockWebContents.send).toHaveBeenCalledWith('theme:init', {
      colors: { Background: '#000' },
    });
  });

  it('kills pty process on before-quit', async () => {
    await import('./index');
    await app.whenReady();
    await wait(); // Ensure ptyProcess is created

    const beforeQuitHandler = (
      app.on as Mock
    ).mock.calls.find((call) => call[0] === 'before-quit')![1];
    (beforeQuitHandler as () => void)();
    expect(mockPtyProcess.kill).toHaveBeenCalled();
  });

  it('quits the app when all windows are closed', async () => {
    await import('./index');
    await app.whenReady();
    await wait();

    const windowAllClosedHandler = (
      app.on as Mock
    ).mock.calls.find((call) => call[0] === 'window-all-closed')![1];
    (windowAllClosedHandler as () => void)();
    expect(app.quit).toHaveBeenCalled();
  });
});
