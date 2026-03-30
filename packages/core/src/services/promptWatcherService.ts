/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Service for asynchronously reading and watching prompt files.
 */
export class PromptWatcherService {
  /**
   * Reads the content of a prompt file asynchronously.
   *
   * @param filePath - The path to the file to read.
   * @returns The file content.
   */
  async readPrompt(filePath: string): Promise<string> {
    try {
      return await fsp.readFile(filePath, 'utf8');
    } catch (error) {
      debugLogger.error(`Error reading prompt file: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Watches a prompt file for changes and calls the provided callback with the updated content.
   *
   * @param filePath - The path to the file to watch.
   * @param onUpdate - Callback function called when the file changes.
   * @returns A cleanup function to stop watching the file.
   */
  watchPrompt(filePath: string, onUpdate: (content: string) => void): () => void {
    let watcher: fs.FSWatcher | undefined;

    try {
      watcher = fs.watch(filePath, async (eventType) => {
        if (eventType === 'change') {
          try {
            const content = await this.readPrompt(filePath);
            onUpdate(content);
          } catch (error) {
            // Error already logged in readPrompt
          }
        }
      });
    } catch (error) {
      debugLogger.warn(`Could not start watcher for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return () => {
      if (watcher) {
        watcher.close();
      }
    };
  }
}
