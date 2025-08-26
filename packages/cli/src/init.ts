/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadCliConfig, parseArguments } from './config/config.js';
import { loadSettings, SettingScope } from './config/settings.js';
import { loadExtensions } from './config/extension.js';
import { sessionId, AuthType, Config } from '@google/gemini-cli-core';
import { validateNonInteractiveAuth } from './validateNonInterActiveAuth.js';

/**
 * A shared initialization function for both interactive and server modes.
 * It loads settings, parses args, loads extensions, and returns a
 * fully initialized Config object.
 */
export async function initializeCli(): Promise<Config> {
  const workspaceRoot = process.cwd();
  const settings = loadSettings(workspaceRoot);
  const argv = await parseArguments(settings.merged);
  const extensions = loadExtensions(workspaceRoot);
  const config = await loadCliConfig(
    settings.merged,
    extensions,
    sessionId,
    argv,
  );

  // Set a default auth type if one isn't set.
  if (!settings.merged.selectedAuthType) {
    if (process.env['CLOUD_SHELL'] === 'true') {
      settings.setValue(SettingScope.User, 'selectedAuthType', AuthType.CLOUD_SHELL);
    }
  }

  await config.initialize();

  // This is a bit of a duplication, but it's necessary to have the
  // non-interactive config available for the server mode.
  await validateNonInteractiveAuth(
    settings.merged.selectedAuthType,
    settings.merged.useExternalAuth,
    config,
  );

  return config;
}
