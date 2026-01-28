/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionManager } from '../../config/extension-manager.js';
import { promptForSetting } from '../../config/extensions/extensionSettings.js';
import { loadSettings } from '../../config/settings.js';
import { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import { debugLogger } from '@google/gemini-cli-core';

export async function getExtensionManager() {
  const workspaceDir = process.cwd();
  const extensionManager = new ExtensionManager({
    workspaceDir,
    requestConsent: requestConsentNonInteractive,
    requestSetting: promptForSetting,
    settings: loadSettings(workspaceDir).merged,
  });
  await extensionManager.loadExtensions();
  return extensionManager;
}

export async function getExtensionAndManager(name: string) {
  const extensionManager = await getExtensionManager();
  const extension = extensionManager
    .getExtensions()
    .find((ext) => ext.name === name);

  if (!extension) {
    debugLogger.error(`Extension "${name}" is not installed.`);
    return { extension: null, extensionManager: null };
  }

  return { extension, extensionManager };
}
