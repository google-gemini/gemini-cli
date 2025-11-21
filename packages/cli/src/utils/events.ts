/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionEvents, McpClient } from '@google/gemini-cli-core';
import { EventEmitter } from 'node:events';

export enum AppEvent {
  OpenDebugConsole = 'open-debug-console',
  OauthDisplayMessage = 'oauth-display-message',
  Flicker = 'flicker',
  McpClientUpdate = 'mcp-client-update',
  SelectionWarning = 'selection-warning',
  PasteTimeout = 'paste-timeout',
}

export interface AppEvents extends ExtensionEvents {
  [AppEvent.OpenDebugConsole]: never[];
  [AppEvent.OauthDisplayMessage]: string[];
  [AppEvent.Flicker]: never[];
  [AppEvent.McpClientUpdate]: Array<Map<string, McpClient> | never>;
  [AppEvent.SelectionWarning]: never[];
  [AppEvent.PasteTimeout]: never[];
}

export const appEvents = new EventEmitter<AppEvents>();
