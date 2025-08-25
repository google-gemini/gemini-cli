/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import type { FileFilteringOptions } from '../config/config.js';
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
  let queueHead = 0; // Pointer-based queue head to avoid expensive splice operations

  // Convert ignoreDirs array to Set for O(1) lookup performance
  const ignoreDirsSet = new Set(ignoreDirs);

  // Process directories in parallel batches for maximum performance
  const PARALLEL_BATCH_SIZE = 15; // Parallel processing batch size for optimal performance

  while (queueHead < queue.length && scannedDirCount < maxDirs) {
    // Fill batch with unvisited directories up to the desired size
    const batchSize = Math.min(PARALLEL_BATCH_SIZE, maxDirs - scannedDirCount);
    const currentBatch = [];
    while (currentBatch.length < batchSize && queueHead < queue.length) {
      const currentDir = queue[queueHead];
      queueHead++;
      if (!visited.has(currentDir)) {
        visited.add(currentDir);
        currentBatch.push(currentDir);
      }
    }
    scannedDirCount += currentBatch.length;

    if (currentBatch.length === 0) continue;

    if (debug) {
      logger.debug(
        `Scanning [${scannedDirCount}/${maxDirs}]: batch of ${currentBatch.length}`,
      );
    }

    // Read directories in parallel instead of one by one
    const readPromises = currentBatch.map(async (currentDir) => {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        return { currentDir, entries };
      } catch (error) {
        // Warn user that a directory could not be read, as this affects search results.
        const message = (error as Error)?.message ?? 'Unknown error';
        console.warn(
          `[WARN] Skipping unreadable directory: ${currentDir} (${message})`,
        );
        if (debug) {
          logger.debug(`Full error for ${currentDir}:`, error);
        }
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
          if (!ignoreDirsSet.has(entry.name)) {
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
