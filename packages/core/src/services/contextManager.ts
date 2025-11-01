/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { getCurrentGeminiMdFilename } from '../tools/memoryTool.js';
import { processImports } from '../utils/memoryImportProcessor.js';
import { coreEvents } from '../utils/events.js';

export class ContextManager {
  private loadedPaths: Set<string> = new Set();
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  /**
   * Marks a context file as loaded so it won't be re-loaded.
   *
   * @param filePath The absolute or relative path to the context file.
   */
  markAsLoaded(filePath: string) {
    this.loadedPaths.add(path.resolve(filePath));
  }

  /**
   * Marks a context file as unloaded. This is useful if the context was
   * lost during chat compression and needs to be re-discoverable.
   *
   * @param filePath The absolute or relative path to the context file.
   */
  unload(filePath: string) {
    this.loadedPaths.delete(path.resolve(filePath));
  }

  /**
   * Checks if a context file has already been loaded.
   *
   * @param filePath The absolute or relative path to the context file.
   * @returns True if the file has been loaded, false otherwise.
   */
  isLoaded(filePath: string): boolean {
    return this.loadedPaths.has(path.resolve(filePath));
  }

  /**
   * Resets the state of loaded context files.
   */
  reset() {
    this.loadedPaths.clear();
  }

  /**
   * Discovers and loads new context files by traversing upwards from the accessed path
   * to the project root.
   *
   * @param accessedPath The path of the file or directory being accessed by a tool.
   * @returns A formatted string containing newly discovered context, or an empty string if none found.
   */
  async discoverContext(accessedPath: string): Promise<string> {
    const newContexts: string[] = [];
    let currentDir = path.resolve(accessedPath);

    // If accessedPath doesn't exist yet (e.g. writing a new file),
    // we still want to check its intended parent directory.
    // If it exists and is a file, start from its directory.
    if (fs.existsSync(currentDir) && fs.statSync(currentDir).isFile()) {
      currentDir = path.dirname(currentDir);
    } else if (!fs.existsSync(currentDir) && path.extname(currentDir)) {
      // Assume it's a file path if it has an extension, even if it doesn't exist yet
      currentDir = path.dirname(currentDir);
    }

    const memoryFilename = getCurrentGeminiMdFilename();

    // Traverse upwards until we reach the project root (inclusive)
    while (true) {
      // Safety check to prevent infinite loops if projectRoot is somehow bypassed
      // or if we hit the file system root.
      if (
        !currentDir.startsWith(this.projectRoot) &&
        currentDir !== this.projectRoot
      ) {
        // If we are outside the project root, we might still want to check if we are
        // not at the system root yet, but generally we want to stop at project root.
        if (currentDir === path.dirname(currentDir)) {
          break; // Reached system root
        }
      }

      const memoryFilePath = path.join(currentDir, memoryFilename);

      if (fs.existsSync(memoryFilePath) && !this.isLoaded(memoryFilePath)) {
        // Found a new context file
        this.markAsLoaded(memoryFilePath);
        try {
          const content = await fsPromises.readFile(memoryFilePath, 'utf8');
          // We don't have debugMode passed in here, defaulting to false
          const processed = await processImports(
            content,
            path.dirname(memoryFilePath),
            false,
            undefined,
            this.projectRoot,
          );

          if (processed.content) {
            const relativePath = path.relative(
              this.projectRoot,
              memoryFilePath,
            );
            newContexts.push(
              `--- Newly Discovered Context from: ${relativePath} ---\n${processed.content}\n--- End Context ---`,
            );
          }
        } catch (error) {
          coreEvents.emitFeedback(
            'warning',
            `Failed to read context file: ${memoryFilePath}`,
            error,
          );
        }
      }

      if (currentDir === this.projectRoot) {
        break;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }

    return newContexts.join('\n\n');
  }
}
