/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { SETTINGS_DIRECTORY_NAME } from './settings.js';
import {
  // getErrorMessage, // Removed as it's not used
  MemoryTool,
  GEMINI_MD_FILENAME,
  // MEMORY_SECTION_HEADER, // Removed as it's not used
} from '@gemini-code/server';

/**
 * Gets the absolute path to the global GEMINI.md file.
 */
export function getGlobalMemoryFilePath(): string {
  return path.join(homedir(), SETTINGS_DIRECTORY_NAME, GEMINI_MD_FILENAME);
}

/**
 * Adds a new memory entry to the global GEMINI.md file under the specified header.
 */
export async function addMemoryEntry(text: string): Promise<void> {
  const filePath = getGlobalMemoryFilePath();
  // The performAddMemoryEntry method from MemoryTool will handle its own errors
  // and throw an appropriately formatted error if needed.
  await MemoryTool.performAddMemoryEntry(text, filePath, {
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    mkdir: fs.mkdir,
  });
}
