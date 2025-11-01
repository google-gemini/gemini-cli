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
import { WindowManager } from './window-manager.js';
import { BrowserWindow } from 'electron';
import { PtyManager } from './pty-manager.js';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  app: {
    quit: vi.fn(),
  },
  dialog: {
    showErrorBox: vi.fn(),
  },
}));

vi.mock('./pty-manager', () => ({
  PtyManager: vi.fn(),
}));

vi.mock('../config/paths', () => ({
  ICON_PATH: '/mock/icon.png',
  PRELOAD_PATH: '/mock/preload.js',
  RENDERER_INDEX_PATH: '/mock/index.html',
}));

// Mock settings
vi.mock('@google/gemini-cli', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    merged: {},
  }),
  themeManager: {
    loadCustomThemes: vi.fn(),
    getTheme: vi.fn(),
  },
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: vi.fn().mockReturnValue('/mock/home'),
  };
});

describe('WindowManager', () => {
  let windowManager: WindowManager;
  let mockBrowserWindow: {
    on: Mock;
    loadFile: Mock;
    loadURL: Mock;
    webContents: {
      on: Mock;
      send: Mock;
    };
    isDestroyed: Mock;
    focus: Mock;
    getContentSize: Mock;
    getBounds: Mock;
  };
  let mockPtyManager: {
    start: Mock;
    dispose: Mock;
  };

  beforeEach(() => {
    mockBrowserWindow = {
      on: vi.fn(),
      loadFile: vi.fn(),
      loadURL: vi.fn(),
      webContents: {
        on: vi.fn(),
        send: vi.fn(),
      },
      isDestroyed: vi.fn().mockReturnValue(false),
      focus: vi.fn(),
      getContentSize: vi.fn().mockReturnValue([800, 600]),
      getBounds: vi.fn().mockReturnValue({ width: 800, height: 600 }),
    };
    vi.mocked(BrowserWindow).mockImplementation(
      () => mockBrowserWindow as unknown as BrowserWindow,
    );

    mockPtyManager = {
      start: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(PtyManager).mockImplementation(
      () => mockPtyManager as unknown as PtyManager,
    );

    windowManager = new WindowManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create window and start pty', async () => {
    await windowManager.createWindow();
    expect(BrowserWindow).toHaveBeenCalled();
    expect(PtyManager).toHaveBeenCalledWith(mockBrowserWindow);
    expect(mockPtyManager.start).toHaveBeenCalled();
  });

  it('should not create new window if one exists', async () => {
    await windowManager.createWindow();
    await windowManager.createWindow();
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(mockBrowserWindow.focus).toHaveBeenCalled();
  });
});
