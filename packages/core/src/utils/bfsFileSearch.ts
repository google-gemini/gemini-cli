/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import type * as fsSync from 'node:fs';
import * as path from 'node:path';
import type { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import type { FileFilteringOptions } from '../config/constants.js';
import { debugLogger } from './debugLogger.js';
// Simple console logger for now.
// TODO: Integrate with a more robust server-side logger.
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) =>
    debugLogger.debug('[DEBUG] [BfsFileSearch]', ...args),
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
  const { ignoreDirs = [], maxDirs = Infinity, debug = false } = options;

  const foundFiles: string[] = [];
  const queue: string[] = [rootDir];
  const visited = new Set<string>();

  let scannedDirCount = 0;
  let queueHead = 0;

  const ignoreDirsSet = new Set(ignoreDirs);

  // Process directories in parallel batches
  const PARALLEL_BATCH_SIZE = 15;

  while (queueHead < queue.length && scannedDirCount < maxDirs) {
    const batchSize = Math.min(PARALLEL_BATCH_SIZE, maxDirs - scannedDirCount);

    const currentBatch: string[] = [];

    // ✅ FIXED INNER LOOP
    while (currentBatch.length < batchSize && queueHead < queue.length) {
      const currentDir = queue[queueHead++];

      if (visited.has(currentDir)) {
        continue; // skip visited but keep trying
      }

      visited.add(currentDir);
      currentBatch.push(currentDir);
    }

    scannedDirCount += currentBatch.length;

    // ✅ Prevent useless looping
    if (currentBatch.length === 0) break;

    if (debug) {
      logger.debug(
        `Scanning [${scannedDirCount}/${maxDirs}]: batch of ${currentBatch.length}`,
      );
    }

    // Read directories in parallel
    const readPromises = currentBatch.map(async (currentDir) => {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        return { currentDir, entries };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';

        debugLogger.warn(
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
      processDirEntries(
        currentDir,
        entries,
        options,
        ignoreDirsSet,
        queue,
        foundFiles,
      );
    }
  }

  return foundFiles;
}

function processDirEntries(
  currentDir: string,
  entries: fsSync.Dirent[],
  options: BfsFileSearchOptions,
  ignoreDirsSet: Set<string>,
  queue: string[],
  foundFiles: string[],
): void {
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const isDirectory = entry.isDirectory();
    const isMatchingFile = entry.isFile() && entry.name === options.fileName;

    if (!isDirectory && !isMatchingFile) {
      continue;
    }
    if (isDirectory && ignoreDirsSet.has(entry.name)) {
      continue;
    }

    if (
      options.fileService?.shouldIgnoreFile(fullPath, {
        respectGitIgnore: options.fileFilteringOptions?.respectGitIgnore,
        respectGeminiIgnore: options.fileFilteringOptions?.respectGeminiIgnore,
      })
    ) {
      continue;
    }

    if (isDirectory) {
      queue.push(fullPath);
    } else {
      foundFiles.push(fullPath);
    }
  }
}
