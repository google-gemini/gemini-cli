/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks ---

const mockPtyProcess = {
  onData: vi.fn(() => ({ dispose: vi.fn() })),
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
  },
}));

// --- Test Suite ---

const wait = () => new Promise((resolve) => setImmediate(resolve));

describe('main process (index.ts)', () => {
  let app;
  let BrowserWindow;
  let ipcMain;
  let pty;

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
    const keystrokeHandler = ipcMain.on.mock.calls.find(
      (call) => call[0] === 'terminal.keystroke',
    )[1];
    keystrokeHandler(null, 'a');
    expect(mockPtyProcess.write).toHaveBeenCalledWith('a');
  });

  it('handles terminal resize', async () => {
    await import('./index');
    await app.whenReady();
    await wait();

    const resizeHandler = ipcMain.on.mock.calls.find(
      (call) => call[0] === 'terminal.resize',
    )[1];
    resizeHandler(null, { cols: 100, rows: 50 });
    expect(mockPtyProcess.resize).toHaveBeenCalledWith(100, 50);
  });

  it('handles settings:get', async () => {
    await import('./index');
    await app.whenReady();
    await wait();

    const settingsGetHandler = ipcMain.handle.mock.calls.find(
      (call) => call[0] === 'settings:get',
    )[1];
    const settings = await settingsGetHandler();
    expect(settings).toHaveProperty('merged');
  });

  it('handles settings:set and restarts pty', async () => {
    await import('./index');
    await app.whenReady();
    await wait();

    const settingsSetHandler = ipcMain.handle.mock.calls.find(
      (call) => call[0] === 'settings:set',
    )[1];

    // Check that pty.spawn has been called once initially
    expect(pty.spawn).toHaveBeenCalledTimes(1);

    await settingsSetHandler(null, { changes: { vimMode: true } });

    // Check that pty.spawn was called again after settings changed
    expect(pty.spawn).toHaveBeenCalledTimes(2);
    expect(mockWebContents.send).toHaveBeenCalledWith('theme:init', {
      colors: { Background: '#000' },
    });
  });

  it('kills pty process on before-quit', async () => {
    await import('./index');
    await app.whenReady();
    await wait(); // Ensure ptyProcess is created

    const beforeQuitHandler = app.on.mock.calls.find(
      (call) => call[0] === 'before-quit',
    )[1];
    beforeQuitHandler();
    expect(mockPtyProcess.kill).toHaveBeenCalled();
  });

  it('quits the app when all windows are closed', async () => {
    await import('./index');
    await app.whenReady();
    await wait();

    const windowAllClosedHandler = app.on.mock.calls.find(
      (call) => call[0] === 'window-all-closed',
    )[1];
    windowAllClosedHandler();
    expect(app.quit).toHaveBeenCalled();
  });
});
