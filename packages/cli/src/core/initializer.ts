/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IdeClient,
  IdeConnectionEvent,
  IdeConnectionType,
  logIdeConnection,
  type Config,
  StartSessionEvent,
  logCliConfiguration,
  startupProfiler,
  type ConnectionConfig,
  type IdeInfo,
} from '@google/gemini-cli-core';
import { type LoadedSettings } from '../config/settings.js';
import { performInitialAuth } from './auth.js';
import { validateTheme } from './theme.js';

export interface InitializationResult {
  authError: string | null;
  themeError: string | null;
  shouldOpenAuthDialog: boolean;
  geminiMdFileCount: number;
  availableIdeConnections?: Array<
    ConnectionConfig & { workspacePath?: string; ideInfo?: IdeInfo }
  >;
}

/**
 * Orchestrates the application's startup initialization.
 * This runs BEFORE the React UI is rendered.
 * @param config The application config.
 * @param settings The loaded application settings.
 * @returns The results of the initialization.
 */
export async function initializeApp(
  config: Config,
  settings: LoadedSettings,
): Promise<InitializationResult> {
  const authHandle = startupProfiler.start('authenticate');
  const authError = await performInitialAuth(
    config,
    settings.merged.security.auth.selectedType,
  );
  authHandle?.end();
  const themeError = validateTheme(settings);

  const shouldOpenAuthDialog =
    settings.merged.security.auth.selectedType === undefined || !!authError;

  logCliConfiguration(
    config,
    new StartSessionEvent(config, config.getToolRegistry()),
  );

  let availableIdeConnections:
    | Array<ConnectionConfig & { workspacePath?: string; ideInfo?: IdeInfo }>
    | undefined;

  if (config.getIdeMode()) {
    const ideClient = await IdeClient.getInstance();
    // Try to auto-connect if possible (legacy behavior or single match)
    // We attempt to connect. If it requires selection, we get a list back?
    // No, I need to implement the logic here.
    const connections = await ideClient.discoverAvailableConnections();

    // Heuristic: If we have a PID match, prioritize it.
    // Ideally IdeClient.getInstance() already did some detection but didn't connect.
    // Actually IdeClient.connect() (without args) tries to find "the one" config.
    // If I want to support multiple, I should check here.

    if (connections.length > 1) {
      // Multiple connections found, let the UI handle selection
      availableIdeConnections = connections;
    } else {
      // 0 or 1 connection, or let connect() handle the "best guess" fallback
      await ideClient.connect();
      logIdeConnection(config, new IdeConnectionEvent(IdeConnectionType.START));
    }
  }

  return {
    authError,
    themeError,
    shouldOpenAuthDialog,
    geminiMdFileCount: config.getGeminiMdFileCount(),
    availableIdeConnections,
  };
}
