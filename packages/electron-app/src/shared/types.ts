/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TerminalResizePayload {
  cols: number;
  rows: number;
}

export interface GeminiEditorResolvePayload {
  diffPath: string;
  status: string;
  content?: string;
}

export type ThemeSetPayload = 'light' | 'dark';

export interface MainWindowResizePayload {
  width: number;
  height: number;
}
