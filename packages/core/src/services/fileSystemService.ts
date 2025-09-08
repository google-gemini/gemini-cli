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
   * Write text content to a file
   *
   * @param filePath - The path to the file to write
   * @param content - The content to write
   */
  writeTextFile(filePath: string, content: string): Promise<void>;

  /**
   * Delete a file
   *
   * @param filePath - The path to the file to delete
   */
  deleteFile(filePath: string): Promise<void>;

  /**
   * Atomically create a file if it does not exist.
   *
   * @param filePath - The path to the file to create
   */
  createLockFile(filePath: string): Promise<void>;
}

/**
 * Standard file system implementation
 */
export class StandardFileSystemService implements FileSystemService {
  async readTextFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async deleteFile(filePath: string): Promise<void> {
    await fs.unlink(filePath);
  }

  async createLockFile(filePath: string): Promise<void> {
    const file = await fs.open(filePath, 'wx');
    await file.close();
  }
}
