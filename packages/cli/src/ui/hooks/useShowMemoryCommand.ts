/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageType } from '../types.js';
import { Config } from '@gemini-code/server';
import { getGeminiMdFilePaths } from '../../config/config.js';
import { homedir } from 'os';
import process from 'node:process';

export const SHOW_MEMORY_COMMAND_NAME = '/showmemory';

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
    const cwd = process.cwd();
    const homeDir = homedir();

    if (debugMode) {
      console.log(`[DEBUG] Show Memory: CWD=${cwd}, Home=${homeDir}`);
    }

    const filePaths = await getGeminiMdFilePaths(cwd, homeDir, debugMode);

    if (filePaths.length > 0) {
      addMessage({
        type: MessageType.INFO,
        content: `The following GEMINI.md files are being used (in order of precedence):\n- ${filePaths.join('\n- ')}`,
        timestamp: new Date(),
      });
    } else {
      addMessage({
        type: MessageType.INFO,
        content: 'No GEMINI.md files found in the hierarchy.',
        timestamp: new Date(),
      });
    }

    const currentMemory = config.getUserMemory();

    if (config.getDebugMode()) {
      console.log(
        `[DEBUG] Showing memory. Content from config.getUserMemory() (first 200 chars): ${currentMemory.substring(0, 200)}...`,
      );
    }

    if (currentMemory && currentMemory.trim().length > 0) {
      addMessage({
        type: MessageType.INFO,
        // Display with a clear heading, and potentially format for readability if very long.
        // For now, direct display. Consider using Markdown formatting for code blocks if memory contains them.
        content: `Current combined GEMINI.md memory content:\n\`\`\`markdown\n${currentMemory}\n\`\`\``,
        timestamp: new Date(),
      });
    } else {
      // This message might be redundant if filePaths.length === 0, but kept for explicitness
      // if somehow memory is empty even if files were found (e.g., all files are empty).
      addMessage({
        type: MessageType.INFO,
        content:
          'No hierarchical memory (GEMINI.md) is currently loaded or memory is empty.',
        timestamp: new Date(),
      });
    }
  };
}
