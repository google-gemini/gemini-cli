/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '@google/gemini-cli-core';
import { type LoadedSettings } from '../config/settings.js';
import { performInitialAuth } from './auth.js';
import { validateTheme } from './theme.js';
import { loadHierarchicalGeminiMemory } from '../config/config.js';
import process from 'node:process';

export interface InitializationResult {
  authError: string | null;
  themeError: string | null;
  shouldOpenAuthDialog: boolean;
  geminiMdFileCount: number;
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
  const authError = await performInitialAuth(
    config,
    settings.merged.security?.auth?.selectedType,
  );
  const themeError = validateTheme(settings);

  // Load hierarchical memory silently during initialization
  const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
    process.cwd(),
    settings.merged.context?.loadMemoryFromIncludeDirectories
      ? config.getWorkspaceContext().getDirectories()
      : [],
    config.getDebugMode(),
    config.getFileService(),
    settings.merged,
    config.getExtensionContextFilePaths(),
    config.isTrustedFolder(),
    settings.merged.context?.importFormat || 'tree',
    config.getFileFilteringOptions(),
  );

  config.setUserMemory(memoryContent);
  config.setGeminiMdFileCount(fileCount);

  const shouldOpenAuthDialog =
    settings.merged.security?.auth?.selectedType === undefined || !!authError;

  return {
    authError,
    themeError,
    shouldOpenAuthDialog,
    geminiMdFileCount: fileCount,
  };
}
