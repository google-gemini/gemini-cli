/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GitIgnoreParser, GitIgnoreFilter } from './gitIgnoreParser.js';
import { isGitRepository } from './gitUtils.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Dirent } from 'fs';

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
  respectGitIgnore?: boolean;
  projectRoot?: string;
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
    respectGitIgnore = true,
    projectRoot = rootDir,
  } = options;
  const foundFiles: string[] = [];
  const queue: string[] = [rootDir];
  const visited = new Set<string>();
  let scannedDirCount = 0;

  let gitIgnoreFilter: GitIgnoreFilter | null = null;
  if (respectGitIgnore && isGitRepository(projectRoot)) {
    const parser = new GitIgnoreParser(projectRoot);
    await parser.initialize();
    gitIgnoreFilter = parser;
  }

  while (queue.length > 0 && scannedDirCount < maxDirs) {
    const currentDir = queue.shift()!;
    if (visited.has(currentDir)) {
      continue;
    }
    visited.add(currentDir);
    scannedDirCount++;

    if (debug) {
      logger.debug(`Scanning [${scannedDirCount}/${maxDirs}]: ${currentDir}`);
    }

    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      // Ignore errors for directories we can't read (e.g., permissions)
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (gitIgnoreFilter?.isIgnored(fullPath)) {
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

  return foundFiles;
}
