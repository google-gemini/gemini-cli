/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Settings } from '@google/gemini-cli';
import type {
  TerminalResizePayload,
  GeminiEditorResolvePayload,
  ThemeSetPayload,
  MainWindowResizePayload,
} from '../shared/types';

contextBridge.exposeInMainWorld('electron', {
  onMainWindowResize: (
    callback: (event: IpcRendererEvent, data: MainWindowResizePayload) => void,
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
    resize: (size: TerminalResizePayload) =>
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
    set: (theme: ThemeSetPayload) => ipcRenderer.send('theme:set', theme),
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
    getSchema: () => ipcRenderer.invoke('settings:get-schema'),
    set: (settings: { changes: Partial<Settings>; scope?: string }) =>
      ipcRenderer.invoke('settings:set', settings),
    restartTerminal: () => ipcRenderer.invoke('settings:restart-terminal'),
  },
  languageMap: {
    get: () => ipcRenderer.invoke('language-map:get'),
    set: (map: Record<string, string>) =>
      ipcRenderer.invoke('language-map:set', map),
  },
  onShowGeminiEditor: (
    callback: (
      event: IpcRendererEvent,
      data: {
        filePath: string;
        oldContent: string;
        newContent: string;
        meta: { filePath: string };
        diffPath: string;
      },
    ) => void,
  ) => {
    const channel = 'gemini-editor:show';
    ipcRenderer.on(channel, callback);
    return () => {
      ipcRenderer.removeListener(channel, callback);
    };
  },
  resolveDiff: (result: GeminiEditorResolvePayload) =>
    ipcRenderer.invoke('gemini-editor:resolve', result),
});
