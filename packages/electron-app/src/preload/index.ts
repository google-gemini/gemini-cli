/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Settings } from '@google/gemini-cli';

contextBridge.exposeInMainWorld('electron', {
  onMainWindowResize: (
    callback: (
      event: IpcRendererEvent,
      data: { width: number; height: number },
    ) => void,
  ) => {
    const channel = 'main-window-resize';
    ipcRenderer.on(channel, callback);
    return () => {
      ipcRenderer.removeListener(channel, callback);
    };
  },
  terminal: {
    onData: (callback: (event: IpcRendererEvent, data: string) => void) => {
      const channel = 'terminal.incomingData';
      ipcRenderer.on(channel, callback);
      return () => {
        ipcRenderer.removeListener(channel, callback);
      };
    },
    sendKey: (key: string) => ipcRenderer.send('terminal.keystroke', key),
    resize: (size: { cols: number; rows: number }) =>
      ipcRenderer.send('terminal.resize', size),
    onReset: (callback: (event: IpcRendererEvent) => void) => {
      const channel = 'terminal.reset';
      ipcRenderer.on(channel, callback);
      return () => {
        ipcRenderer.removeListener(channel, callback);
      };
    },
  },
  theme: {
    set: (theme: 'light' | 'dark') => ipcRenderer.send('theme:set', theme),
    onInit: (
      callback: (
        event: IpcRendererEvent,
        theme: Record<string, string>,
      ) => void,
    ) => {
      const channel = 'theme:init';
      ipcRenderer.on(channel, callback);
      return () => {
        ipcRenderer.removeListener(channel, callback);
      };
    },
  },
  themes: {
    get: () => ipcRenderer.invoke('themes:get'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings: { changes: Partial<Settings>; scope?: string }) =>
      ipcRenderer.invoke('settings:set', settings),
    restartTerminal: () => ipcRenderer.send('settings:restart-terminal'),
  },
  languageMap: {
    get: () => ipcRenderer.invoke('language-map:get'),
    set: (map: Record<string, string>) =>
      ipcRenderer.invoke('language-map:set', map),
  },
  onShowGeminiEditor: (
    callback: (
      event: IpcRendererEvent,
      data: { filePath: string; oldContent: string; newContent: string },
    ) => void,
  ) => {
    const channel = 'gemini-editor:show';
    ipcRenderer.on(channel, callback);
    return () => {
      ipcRenderer.removeListener(channel, callback);
    };
  },
  resolveDiff: (result: {
    status: string;
    content?: string;
    diffPath: string;
  }) => ipcRenderer.invoke('gemini-editor:resolve', result),
});
