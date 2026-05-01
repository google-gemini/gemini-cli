/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';

/**
 * Interface for file system operations that may be delegated to different implementations
 */
export interface FileSystemService {
  /**
   * Read text content from a file
   *
   * @param filePath - The path to the file to read
   * @returns The file content as a string
   */
  readTextFile(filePath: string): Promise<string>;

  /**
   * Write text content to a file.
   *
   * @param filePath - The path to the file to write
   * @param content - The content to write
   * @param options - Optional write options. `mode` is applied when the file is
   *   created (POSIX-only; ignored on Windows). Use `SECURE_FILE_MODE`
   *   (`0o600`) for files under `~/.gemini/` containing sensitive state.
   */
  writeTextFile(
    filePath: string,
    content: string,
    options?: { mode?: number },
  ): Promise<void>;
}

/**
 * Standard file system implementation
 */
export class StandardFileSystemService implements FileSystemService {
  async readTextFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async writeTextFile(
    filePath: string,
    content: string,
    options?: { mode?: number },
  ): Promise<void> {
    const writeOpts: { encoding: 'utf-8'; mode?: number } = {
      encoding: 'utf-8',
    };
    if (options?.mode !== undefined) {
      writeOpts.mode = options.mode;
    }
    await fs.writeFile(filePath, content, writeOpts);
  }
}
