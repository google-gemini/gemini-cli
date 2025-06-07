/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageType } from '../types.js';
import { Config } from '@gemini-cli/core';

export function createShowMemoryAction(
  config: Config | null,
  addMessage: (message: Message) => void,
) {
  return async () => {
    if (!config) {
      addMessage({
        type: MessageType.ERROR,
        content: 'Configuration not available. Cannot show memory.',
        timestamp: new Date(),
      });
      return;
    }

    const debugMode = config.getDebugMode();

    if (debugMode) {
      console.log('[DEBUG] Show Memory command invoked.');
    }

    const currentMemory = config.getUserMemory();
    const fileCount = config.getGeminiMdFileCount();

    if (debugMode) {
      console.log(
        `[DEBUG] Showing memory. Content from config.getUserMemory() (first 200 chars): ${currentMemory.substring(0, 200)}...`,
      );
      console.log(`[DEBUG] Number of GEMINI.md files loaded: ${fileCount}`);
    }

    if (fileCount > 0) {
      addMessage({
        type: MessageType.INFO,
        content: `Loaded memory from ${fileCount} GEMINI.md file(s).`,
        timestamp: new Date(),
      });
    }

    if (currentMemory && currentMemory.trim().length > 0) {
      addMessage({
        type: MessageType.INFO,
        content: `Current combined GEMINI.md memory content:\n\`\`\`markdown\n${currentMemory}\n\`\`\``,
        timestamp: new Date(),
      });
    } else {
      addMessage({
        type: MessageType.INFO,
        content:
          fileCount > 0
            ? 'Hierarchical memory (GEMINI.md) is loaded but content is empty.'
            : 'No hierarchical memory (GEMINI.md) is currently loaded.',
        timestamp: new Date(),
      });
    }
  };
}
