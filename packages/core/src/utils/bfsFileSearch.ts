/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { FileFilteringOptions } from '../config/config.js';
// Simple console logger for now.
// TODO: Integrate with a more robust server-side logger.
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => console.debug('[DEBUG] [BfsFileSearch]', ...args),
};

interface BfsFileSearchOptions {
  fileName: string;
  ignoreDirs?: string[];
  maxDirs?: number;
  debug?: boolean;
  fileService?: FileDiscoveryService;
  fileFilteringOptions?: FileFilteringOptions;
}

/**
 * Performs a breadth-first search for a specific file within a directory structure.
 *
 * @param rootDir The directory to start the search from.
 * @param options Configuration for the search.
 * @returns A promise that resolves to an array of paths where the file was found.
 */
export async function bfsFileSearch(
  rootDir: string,
  options: BfsFileSearchOptions,
): Promise<string[]> {
  const {
    fileName,
    ignoreDirs = [],
    maxDirs = Infinity,
    debug = false,
    fileService,
  } = options;
  const foundFiles: string[] = [];
  const queue: string[] = [rootDir];
  const visited = new Set<string>();
  let scannedDirCount = 0;

  while (queue.length > 0 && scannedDirCount < maxDirs) {
    // Process multiple directories in parallel for better performance
    const batchSize = Math.min(10, queue.length, maxDirs - scannedDirCount);
    const currentBatch = [];

    for (let i = 0; i < batchSize && queue.length > 0; i++) {
      const currentDir = queue.shift()!;
      if (!visited.has(currentDir)) {
        currentBatch.push(currentDir);
        visited.add(currentDir);
        scannedDirCount++;
      }
    }

    if (currentBatch.length === 0) continue;

    if (debug) {
      logger.debug(
        `Scanning ${currentBatch.length} directories [${scannedDirCount}/${maxDirs}]`,
      );
    }

    // Read directories in parallel instead of one by one
    const readPromises = currentBatch.map(async (currentDir) => {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        return { currentDir, entries };
      } catch {
        return { currentDir, entries: [] };
      }
    });

    const results = await Promise.all(readPromises);

    for (const { currentDir, entries } of results) {
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (
          fileService?.shouldIgnoreFile(fullPath, {
            respectGitIgnore: options.fileFilteringOptions?.respectGitIgnore,
            respectGeminiIgnore:
              options.fileFilteringOptions?.respectGeminiIgnore,
          })
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name)) {
            queue.push(fullPath);
          }
        } else if (entry.isFile() && entry.name === fileName) {
          foundFiles.push(fullPath);
        }
      }
    }
  }

  return foundFiles;
}
