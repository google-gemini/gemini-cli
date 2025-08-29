/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Settings, ThemeDisplay } from '@google/gemini-cli';
import type { IpcRendererEvent } from 'electron';

export interface GeminiEditorData {
  filePath: string;
  oldContent: string;
  newContent: string;
  diffPath: string;
  meta: {
    filePath: string;
  };
}

export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface CliTheme {
  colors: {
    Background: string;
    Foreground: string;
    AccentRed: string;
    AccentGreen: string;
    AccentYellow: string;
    AccentBlue: string;
    AccentPurple: string;
    AccentCyan: string;
  };
}

export type IncomingTheme = Partial<CliTheme> & Partial<XtermTheme>;

export interface IElectronAPI {
  onMainWindowResize: (
    callback: (
      event: IpcRendererEvent,
      data: { width: number; height: number },
    ) => void,
  ) => () => void;
  terminal: {
    onData: (
      callback: (event: IpcRendererEvent, data: string) => void,
    ) => () => void;
    sendKey: (key: string) => void;
    resize: (size: { cols: number; rows: number }) => void;
    onReset: (callback: (event: IpcRendererEvent) => void) => () => void;
  };
  theme: {
    set: (theme: 'light' | 'dark') => void;
    onInit: (
      callback: (event: IpcRendererEvent, theme: IncomingTheme) => void,
    ) => () => void;
  };
  themes: {
    get: () => Promise<ThemeDisplay[]>;
  };
  settings: {
    get: () => Promise<{
      merged: Partial<Settings>;
      user: Partial<Settings>;
      workspace: Partial<Settings>;
      system: Partial<Settings>;
    }>;
    set: (settings: {
      changes: Partial<Settings>;
      scope?: string;
    }) => Promise<void>;
    restartTerminal: () => void;
  };
  languageMap: {
    get: () => Promise<Record<string, string>>;
    set: (map: Record<string, string>) => void;
  };
  onShowGeminiEditor: (
    callback: (event: IpcRendererEvent, data: GeminiEditorData) => void,
  ) => () => void;
  resolveDiff: (result: {
    status: string;
    content?: string;
    diffPath: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
