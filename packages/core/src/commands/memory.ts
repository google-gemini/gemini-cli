/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { refreshServerHierarchicalMemory } from '../utils/memoryDiscovery.js';
import type { MessageActionReturn, ToolActionReturn } from './types.js';

export function showMemory(config: Config): MessageActionReturn {
  const memoryContent = config.getUserMemory() || '';
  const fileCount = config.getGeminiMdFileCount() || 0;
  let content: string;

  if (memoryContent.length > 0) {
    content = `Current memory content from ${fileCount} file(s):\n\n---\n${memoryContent}\n---`;
  } else {
    content = 'Memory is currently empty.';
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

export function addMemory(
  args?: string,
): MessageActionReturn | ToolActionReturn {
  if (!args || args.trim() === '') {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /memory add <text to remember>',
    };
  }
  return {
    type: 'tool',
    toolName: 'save_memory',
    toolArgs: { fact: args.trim() },
  };
}

export async function refreshMemory(
  config: Config,
): Promise<MessageActionReturn> {
  let memoryContent = '';
  let fileCount = 0;

  if (config.isJitContextEnabled()) {
    await config.getContextManager()?.refresh();
    memoryContent = config.getUserMemory();
    fileCount = config.getGeminiMdFileCount();
  } else {
    const result = await refreshServerHierarchicalMemory(config);
    memoryContent = result.memoryContent;
    fileCount = result.fileCount;
  }

  await config.updateSystemInstructionIfInitialized();
  let content: string;

  if (memoryContent.length > 0) {
    content = `Memory refreshed successfully. Loaded ${memoryContent.length} characters from ${fileCount} file(s).`;
  } else {
    content = 'Memory refreshed successfully. No memory content found.';
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

export function listMemoryFiles(config: Config): MessageActionReturn {
  const filePaths = config.getGeminiMdFilePaths() || [];
  const fileCount = filePaths.length;
  let content: string;

  if (fileCount > 0) {
    content = `There are ${fileCount} GEMINI.md file(s) in use:\n\n${filePaths.join(
      '\n',
    )}`;
  } else {
    content = 'No GEMINI.md files in use.';
  }

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}
