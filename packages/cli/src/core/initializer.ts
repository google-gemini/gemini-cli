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
} from '@google/gemini-cli-core';
import { type LoadedSettings } from '../config/settings.js';
import { performInitialAuth } from './auth.js';
import { validateTheme } from './theme.js';
import type { AccountSuspensionInfo } from '../ui/contexts/UIStateContext.js';

import { pathToFileURL } from 'node:url';

export interface InitializationResult {
  authError: string | null;
  accountSuspensionInfo: AccountSuspensionInfo | null;
  themeError: string | null;
  shouldOpenAuthDialog: boolean;
  geminiMdFileCount: number;
  recentExternalSession?: { prefix: string; id: string; displayName?: string };
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
  const { authError, accountSuspensionInfo } = await performInitialAuth(
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

  if (config.getIdeMode()) {
    const ideClient = await IdeClient.getInstance();
    await ideClient.connect();
    logIdeConnection(config, new IdeConnectionEvent(IdeConnectionType.START));
  }

  // Check for recent external sessions to prompt for resume
  let recentExternalSession:
    | { prefix: string; id: string; displayName?: string }
    | undefined;
  if (config.getEnableExtensionReloading() !== false) {
    /* eslint-disable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any */
    const extensionLoader = (config as any)._extensionLoader;
    if (extensionLoader) {
      const workspaceUri = pathToFileURL(process.cwd()).toString();
      const recent =
        await extensionLoader.getRecentExternalSession(workspaceUri);
      if (recent) {
        recentExternalSession = {
          prefix: recent.prefix,
          id: recent.id,
          displayName: recent.displayName,
        };
      }
    }
    /* eslint-enable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any */
  }

  return {
    authError,
    accountSuspensionInfo,
    themeError,
    shouldOpenAuthDialog,
    geminiMdFileCount: config.getGeminiMdFileCount(),
    recentExternalSession,
  };
}
