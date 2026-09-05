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
   * Read the raw bytes of a file (images, PDFs, audio, video, or any other
   * binary content). Implementations MUST return the exact on-disk bytes —
   * do not round-trip through a string encoding, since that is lossy for
   * binary data.
   *
   * @param filePath - The path to the file to read
   * @returns The file content as a Buffer
   */
  readBinaryFile(filePath: string): Promise<Buffer>;
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

  async readBinaryFile(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }
}
