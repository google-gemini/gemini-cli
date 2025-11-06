/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  loadServerHierarchicalMemory,
  type Config,
} from '@google/gemini-cli-core';
import * as os from 'node:os';
import * as path from 'node:path';
import type { LoadedSettings } from '../../config/settings.js';

export function expandHomeDir(p: string): string {
  if (!p) {
    return '';
  }
  let expandedPath = p;
  if (p.toLowerCase().startsWith('%userprofile%')) {
    expandedPath = os.homedir() + p.substring('%userprofile%'.length);
  } else if (p === '~' || p.startsWith('~/')) {
    expandedPath = os.homedir() + p.substring(1);
  }
  return path.normalize(expandedPath);
}

export async function loadMemoryFromDirectories(
  config: Config,
  settings: LoadedSettings,
): Promise<{ memoryContent: string; fileCount: number } | undefined> {
  if (!config.shouldLoadMemoryFromIncludeDirectories()) {
    return undefined;
  }

  const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
    config.getWorkingDir(),
    [...config.getWorkspaceContext().getDirectories()],
    config.getDebugMode(),
    config.getFileService(),
    config.getExtensionLoader(),
    config.getFolderTrust(),
    settings.merged.context?.importFormat || 'tree',
    config.getFileFilteringOptions(),
    settings.merged.context?.discoveryMaxDirs,
  );

  config.setUserMemory(memoryContent);
  config.setGeminiMdFileCount(fileCount);

  return { memoryContent, fileCount };
}
