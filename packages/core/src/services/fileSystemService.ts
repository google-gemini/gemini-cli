/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { isNodeError } from '../utils/errors.js';

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

/** Rename retries, for transient Windows lock errors. */
const RENAME_MAX_RETRIES = 5;

/**
 * Standard file system implementation
 */
export class StandardFileSystemService implements FileSystemService {
  async readTextFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  /**
   * Writes `content` to `filePath` atomically.
   *
   * A plain `fs.writeFile` truncates the destination and then streams the
   * content in chunks, so anything reading the file concurrently can observe
   * a truncated prefix. Writing to a sibling temp file and renaming it into
   * place means an observer sees either the old file or the new one.
   */
  async writeTextFile(filePath: string, content: string): Promise<void> {
    // The temp file must share a directory with the destination so that the
    // rename stays within one filesystem, and must be uniquely named so that
    // concurrent writers do not clobber each other's temp file.
    const tmpPath = `${filePath}.${randomUUID()}.tmp`;

    // A fresh temp file does not inherit the destination's permissions, so
    // without this, replacing a 0600 file would silently widen it to the
    // default mode.
    const existingMode = await this.getFileMode(filePath);

    try {
      // Create the temp file already carrying the destination's mode, so the
      // content is never briefly readable through a wider default mode. The
      // mode is masked by umask, so this can only be more restrictive.
      await fs.writeFile(tmpPath, content, {
        encoding: 'utf-8',
        ...(existingMode !== undefined ? { mode: existingMode } : {}),
      });

      if (existingMode !== undefined) {
        try {
          // Correct any narrowing that umask applied above. Best effort: some
          // filesystems (FAT32, exFAT, a few NFS/CIFS mounts) and restricted
          // sandboxes reject chmod with EPERM/ENOTSUP, and permissions must
          // not be the reason a write fails.
          await fs.chmod(tmpPath, existingMode);
        } catch {
          // Keep whatever mode the temp file was created with.
        }
      }

      await this.renameWithRetry(tmpPath, filePath);
    } catch (error) {
      await fs.rm(tmpPath, { force: true }).catch(() => {
        // Best effort: the original error is the one worth reporting.
      });
      throw error;
    }
  }

  private async getFileMode(filePath: string): Promise<number | undefined> {
    try {
      const stats = await fs.stat(filePath);
      return stats.mode & 0o777;
    } catch {
      // New file, or a destination we cannot stat; keep the default mode.
      return undefined;
    }
  }

  private async renameWithRetry(from: string, to: string): Promise<void> {
    for (let attempt = 0; attempt < RENAME_MAX_RETRIES; attempt++) {
      try {
        await fs.rename(from, to);
        return;
      } catch (error: unknown) {
        // Windows can transiently refuse a rename while another process has
        // the destination open (antivirus, editors, watchers).
        const code = isNodeError(error) ? error.code : '';
        const isRetryable = code === 'EBUSY' || code === 'EPERM';
        if (!isRetryable || attempt === RENAME_MAX_RETRIES - 1) {
          throw error;
        }
        const delayMs = Math.pow(2, attempt) * 50;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}
