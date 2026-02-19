/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fsPromises from 'node:fs/promises';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Result object for a single grep match
 */
export interface GrepMatch {
  filePath: string;
  absolutePath: string;
  lineNumber: number;
  line: string;
  isContext?: boolean;
}

/**
 * Groups matches by their file path and ensures they are sorted by line number.
 */
export function groupMatchesByFile(
  allMatches: GrepMatch[],
): Record<string, GrepMatch[]> {
  return allMatches.reduce(
    (acc, match) => {
      const fileKey = match.filePath;
      if (!acc[fileKey]) {
        acc[fileKey] = [];
      }
      acc[fileKey].push(match);
      acc[fileKey].sort((a, b) => a.lineNumber - b.lineNumber);
      return acc;
    },
    {} as Record<string, GrepMatch[]>,
  );
}

/**
 * Reads the content of a file and splits it into lines.
 * Returns null if the file cannot be read.
 */
export async function readFileLines(
  absolutePath: string,
): Promise<string[] | null> {
  try {
    const content = await fsPromises.readFile(absolutePath, 'utf8');
    return content.split(/\r?\n/);
  } catch (err) {
    debugLogger.warn(`Failed to read file for context: ${absolutePath}`, err);
    return null;
  }
}
