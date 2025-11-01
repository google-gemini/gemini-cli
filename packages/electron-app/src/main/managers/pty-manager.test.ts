/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { PtyManager } from './pty-manager.js';
import type { BrowserWindow } from 'electron';
import * as pty from 'node-pty';
import { watch, type FSWatcher } from 'chokidar';
import fs from 'node:fs';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  dialog: {
    showErrorBox: vi.fn(),
  },
}));

vi.mock('node-pty', () => ({
  spawn: vi.fn(),
}));

vi.mock('chokidar', () => ({
  watch: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const mocked = {
    ...actual,
    existsSync: vi.fn(),
    promises: {
      mkdir: vi.fn(),
      stat: vi.fn(),
      readFile: vi.fn(),
      access: vi.fn(),
    },
    watch: vi.fn(),
  };
  return {
    ...mocked,
    default: mocked,
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: vi.fn().mockReturnValue('/mock/home'),
  };
});

vi.mock('../config/paths', () => ({
  CLI_PATH: '/mock/cli/path',
}));

// Mock settings
vi.mock('@google/gemini-cli', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    merged: {},
  }),
}));

describe('PtyManager', () => {
  let ptyManager: PtyManager;
  let mockMainWindow: {
    webContents: { send: Mock };
    isDestroyed: Mock;
  };
  let mockPtyProcess: {
    onExit: Mock;
    onData: Mock;
    kill: Mock;
    resize: Mock;
    write: Mock;
  };
  let mockFileWatcher: {
    on: Mock;
    close: Mock;
  };

  beforeEach(() => {
    mockMainWindow = {
      webContents: {
        send: vi.fn(),
      },
      isDestroyed: vi.fn().mockReturnValue(false),
    };

    mockPtyProcess = {
      onExit: vi.fn(),
      onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      kill: vi.fn(),
      resize: vi.fn(),
      write: vi.fn(),
    };
    vi.mocked(pty.spawn).mockReturnValue(mockPtyProcess as unknown as pty.IPty);

    mockFileWatcher = {
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(watch).mockReturnValue(mockFileWatcher as unknown as FSWatcher);

    vi.mocked(fs.existsSync).mockReturnValue(true);

    ptyManager = new PtyManager(mockMainWindow as unknown as BrowserWindow);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should start pty process', async () => {
    await ptyManager.start();
    expect(pty.spawn).toHaveBeenCalledWith(
      '/mock/cli/path',
      [],
      expect.objectContaining({
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: expect.stringContaining('Documents'), // Default CWD
      }),
    );
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'terminal.reset',
    );
  });

  it('should handle pty data', async () => {
    await ptyManager.start();
    const onDataCallback = mockPtyProcess.onData.mock.calls[0][0];
    onDataCallback('test data');
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
      'terminal.incomingData',
      'test data',
    );
  });

  it('should resize pty', async () => {
    await ptyManager.start();
    ptyManager.resize(100, 50);
    expect(mockPtyProcess.resize).toHaveBeenCalledWith(100, 50);
  });

  it('should write to pty', async () => {
    await ptyManager.start();
    ptyManager.write('test input');
    expect(mockPtyProcess.write).toHaveBeenCalledWith('test input');
  });

  it('should dispose pty and file watcher', async () => {
    await ptyManager.start();
    await ptyManager.dispose();
    expect(mockPtyProcess.kill).toHaveBeenCalled();
    expect(mockFileWatcher.close).toHaveBeenCalled();
  });

  it('should setup file watcher with awaitWriteFinish', async () => {
    await ptyManager.start();
    expect(watch).toHaveBeenCalledWith(
      expect.stringContaining('.gemini/tmp/diff'),
      expect.objectContaining({
        ignoreInitial: true,
        depth: 2,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      }),
    );
  });
});
