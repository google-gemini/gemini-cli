/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';

export enum TransientMessageType {
  Warning = 'warning',
  Hint = 'hint',
  Error = 'error',
  Accent = 'accent',
}

export interface TransientMessagePayload {
  message: string;
  type: TransientMessageType;
  durationMs?: number;
}

export enum AppEvent {
  OpenDebugConsole = 'open-debug-console',
  Flicker = 'flicker',
  SelectionWarning = 'selection-warning',
  PasteTimeout = 'paste-timeout',
  TerminalBackground = 'terminal-background',
  TransientMessage = 'transient-message',
}

export interface AppEvents {
  [AppEvent.OpenDebugConsole]: never[];
  [AppEvent.Flicker]: never[];
  [AppEvent.SelectionWarning]: never[];
  [AppEvent.PasteTimeout]: never[];
  [AppEvent.TerminalBackground]: [string];
  [AppEvent.TransientMessage]: [TransientMessagePayload];
}

export const appEvents = new EventEmitter<AppEvents>();
