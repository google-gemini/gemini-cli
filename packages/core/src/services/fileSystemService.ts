/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isNodeError } from '../utils/errors.js';

const RENAME_MAX_RETRIES = 5;
const RENAME_INITIAL_DELAY_MS = 15;

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
}

/**
 * Standard file system implementation
 */
export class StandardFileSystemService implements FileSystemService {
  async readTextFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    let targetPath = filePath;
    try {
      const resolved = await fs.realpath(filePath);
      if (resolved) {
        targetPath = resolved;
      }
    } catch {
      // File may not exist yet or realpath is mocked; keep original filePath.
    }

    let existingMode: number | undefined;
    try {
      const stat = await fs.stat(targetPath);
      if (
        stat &&
        typeof stat.isDirectory === 'function' &&
        stat.isDirectory()
      ) {
        const dirErr: NodeJS.ErrnoException = new Error(
          `EISDIR: illegal operation on a directory, open '${targetPath}'`,
        );
        dirErr.code = 'EISDIR';
        throw dirErr;
      }
      if (stat && typeof stat.mode === 'number') {
        existingMode = stat.mode & 0o777;
      }
    } catch (err) {
      if (isNodeError(err) && err.code === 'EISDIR') {
        throw err;
      }
      // Ignore ENOENT or mocked stat errors when file does not exist yet.
    }

    const dir = path.dirname(targetPath);
    const base = path.basename(targetPath);
    const tmpPath = path.join(dir, `.${base}.${randomUUID()}.tmp`);
    let renamed = false;

    try {
      await fs.writeFile(tmpPath, content, 'utf-8');
      if (existingMode !== undefined) {
        await fs.chmod(tmpPath, existingMode);
      }

      for (let attempt = 0; attempt < RENAME_MAX_RETRIES; attempt++) {
        try {
          await fs.rename(tmpPath, targetPath);
          renamed = true;
          break;
        } catch (err) {
          const isRetryable =
            isNodeError(err) &&
            (err.code === 'EBUSY' || err.code === 'EPERM') &&
            attempt < RENAME_MAX_RETRIES - 1;
          if (!isRetryable) {
            throw err;
          }
          const delayMs = RENAME_INITIAL_DELAY_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    } finally {
      if (!renamed) {
        try {
          await fs.unlink(tmpPath);
        } catch {
          // Best-effort cleanup of sibling temp file on failure.
        }
      }
    }
  }
}
