/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IElectronAPI } from '../renderer/src/types/global';

// Mock the 'electron' module
const mockIpcRenderer = {
  on: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(),
  removeListener: vi.fn(),
};

const mockContextBridge = {
  exposeInMainWorld: vi.fn(),
};

vi.mock('electron', () => ({
  contextBridge: mockContextBridge,
  ipcRenderer: mockIpcRenderer,
}));

describe('preload script', () => {
  let exposedApi: IElectronAPI;

  beforeEach(async () => {
    vi.resetModules(); // Reset modules before each test
    vi.clearAllMocks();

    // Import the preload script to execute it
    await import('./index');
    // Capture the API object passed to exposeInMainWorld
    if (mockContextBridge.exposeInMainWorld.mock.calls.length > 0) {
      exposedApi = mockContextBridge.exposeInMainWorld.mock.calls[0][1];
    }
  });

  it('exposes the "electron" API to the main world', () => {
    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'electron',
      expect.any(Object),
    );
  });

  describe('onMainWindowResize', () => {
    it('sets up and removes a listener for "main-window-resize"', () => {
      const callback = () => {};
      const removeListener = exposedApi.onMainWindowResize(callback);

      expect(mockIpcRenderer.on).toHaveBeenCalledWith(
        'main-window-resize',
        callback,
      );

      // Test the cleanup function
      removeListener();
      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith(
        'main-window-resize',
        callback,
      );
    });
  });

  describe('terminal API', () => {
    it('listens for incoming data', () => {
      const callback = () => {};
      exposedApi.terminal.onData(callback);
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(
        'terminal.incomingData',
        callback,
      );
    });

    it('sends keystrokes', () => {
      const key = 'a';
      exposedApi.terminal.sendKey(key);
      expect(mockIpcRenderer.send).toHaveBeenCalledWith(
        'terminal.keystroke',
        key,
      );
    });

    it('sends resize events', () => {
      const size = { cols: 80, rows: 24 };
      exposedApi.terminal.resize(size);
      expect(mockIpcRenderer.send).toHaveBeenCalledWith(
        'terminal.resize',
        size,
      );
    });

    it('listens for reset events', () => {
      const callback = () => {};
      exposedApi.terminal.onReset(callback);
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(
        'terminal.reset',
        callback,
      );
    });
  });

  describe('theme API', () => {
    it('sends theme set events', () => {
      const theme = 'dark';
      exposedApi.theme.set(theme);
      expect(mockIpcRenderer.send).toHaveBeenCalledWith('theme:set', theme);
    });

    it('listens for theme init events', () => {
      const callback = () => {};
      exposedApi.theme.onInit(callback);
      expect(mockIpcRenderer.on).toHaveBeenCalledWith('theme:init', callback);
    });
  });

  describe('themes API', () => {
    it('invokes themes:get', () => {
      exposedApi.themes.get();
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('themes:get');
    });
  });

  describe('settings API', () => {
    it('invokes settings:get', () => {
      exposedApi.settings.get();
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('settings:get');
    });

    it('invokes settings:set', () => {
      const settings = {
        changes: { general: { vimMode: true } },
        scope: 'User',
      };
      exposedApi.settings.set(settings);
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
        'settings:set',
        settings,
      );
    });
  });
});
