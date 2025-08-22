/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Defines the structure of a virtual file system to be created for testing.
 * Keys are file or directory names, and values can be:
 * - A string: The content of a file.
 * - A `FileSystemStructure` object: Represents a subdirectory with its own structure.
 * - An array of strings or `FileSystemStructure` objects: Represents a directory
 *   where strings are empty files and objects are subdirectories.
 *
 * @example
 * // Example 1: Simple files and directories
 * const structure1 = {
 *   'file1.txt': 'Hello, world!',
 *   'empty-dir': [],
 *   'src': {
 *     'main.js': '// Main application file',
 *     'utils.ts': '// Utility functions',
 *   },
 * };
 *
 * @example
 * // Example 2: Nested directories and empty files within an array
 * const structure2 = {
 *   'config.json': '{ "port": 3000 }',
 *   'data': [
 *     'users.csv',
 *     'products.json',
 *     {
 *       'logs': [
 *         'error.log',
 *         'access.log',
 *       ],
 *     },
 *   ],
 * };
 */
export type FileSystemStructure = {
  [name: string]:
    | string
    | FileSystemStructure
    | Array<string | FileSystemStructure>;
};

/**
 * Recursively creates files and directories based on the provided `FileSystemStructure`.
 * @param dir The base directory where the structure will be created.
 * @param structure The `FileSystemStructure` defining the files and directories.
 */
async function create(dir: string, structure: FileSystemStructure) {
  for (const [name, content] of Object.entries(structure)) {
    const newPath = path.join(dir, name);
    if (typeof content === 'string') {
      await fs.writeFile(newPath, content);
    } else if (Array.isArray(content)) {
      await fs.mkdir(newPath, { recursive: true });
      for (const item of content) {
        if (typeof item === 'string') {
          await fs.writeFile(path.join(newPath, item), '');
        } else {
          await create(newPath, item as FileSystemStructure);
        }
      }
    } else if (typeof content === 'object' && content !== null) {
      await fs.mkdir(newPath, { recursive: true });
      await create(newPath, content as FileSystemStructure);
    }
  }
}

/**
 * Creates a temporary directory and populates it with a given file system structure.
 * @param structure The `FileSystemStructure` to create within the temporary directory.
 * @returns A promise that resolves to the absolute path of the created temporary directory.
 */
export async function createTmpDir(
  structure: FileSystemStructure,
): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-cli-test-'));
  await create(tmpDir, structure);
  return tmpDir;
}

/**
 * Cleans up (deletes) a temporary directory and its contents.
 * @param dir The absolute path to the temporary directory to clean up.
 */
export async function cleanupTmpDir(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}
