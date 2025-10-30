/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadServerHierarchicalMemory } from '@google/gemini-cli-core';
import * as os from 'node:os';
import * as path from 'node:path';
import { MessageType } from '../types.js';
import type { CommandContext } from './types.js';

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

export async function finishAddingDirectories(
  context: CommandContext,
  added: string[],
  errors: string[],
) {
  const {
    ui: { addItem },
    services: { config },
  } = context;

  if (!config) {
    addItem(
      {
        type: MessageType.ERROR,
        text: 'Configuration is not available.',
      },
      Date.now(),
    );
    return;
  }

  try {
    if (config.shouldLoadMemoryFromIncludeDirectories() && added.length > 0) {
      const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
        config.getWorkingDir(),
        [...config.getWorkspaceContext().getDirectories()],
        config.getDebugMode(),
        config.getFileService(),
        config.getExtensionLoader(),
        config.getFolderTrust(),
        context.services.settings.merged.context?.importFormat || 'tree',
        config.getFileFilteringOptions(),
        context.services.settings.merged.context?.discoveryMaxDirs,
      );
      config.setUserMemory(memoryContent);
      config.setGeminiMdFileCount(fileCount);
      context.ui.setGeminiMdFileCount(fileCount);
      addItem(
        {
          type: MessageType.INFO,
          text: `Successfully added GEMINI.md files from the following directories if there are:\n- ${added.join(
            '\n- ',
          )}`,
        },
        Date.now(),
      );
    }
  } catch (error) {
    errors.push(`Error refreshing memory: ${(error as Error).message}`);
  }

  if (added.length > 0) {
    const gemini = config.getGeminiClient();
    if (gemini) {
      await gemini.addDirectoryContext();
    }
    addItem(
      {
        type: MessageType.INFO,
        text: `Successfully added directories:\n- ${added.join('\n- ')}`,
      },
      Date.now(),
    );
  }

  if (errors.length > 0) {
    addItem({ type: MessageType.ERROR, text: errors.join('\n') }, Date.now());
  }
}
