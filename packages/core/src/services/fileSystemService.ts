/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isNodeError } from '../utils/errors.js';
import { resolveToRealPath } from '../utils/paths.js';

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
   *
   * The one exception is a destination with multiple hard links, which is
   * written in place so that every link keeps seeing the same content.
   */
  async writeTextFile(filePath: string, content: string): Promise<void> {
    // When filePath is a symlink, resolve to its real target path so that the
    // rename updates the underlying target file rather than replacing the
    // symlink itself with a regular file.
    let realPath = filePath;
    try {
      realPath = resolveToRealPath(filePath);
    } catch {
      try {
        const dir = path.dirname(filePath);
        const base = path.basename(filePath);
        realPath = path.join(resolveToRealPath(dir), base);
      } catch {
        realPath = filePath;
      }
    }

    const existingStats = await this.statIfExists(realPath);

    if (existingStats !== undefined) {
      // A rename is governed by the directory's permissions alone, so without
      // this check an atomic replace would silently overwrite a read-only
      // file that a plain write refuses with EACCES.
      await this.assertWritable(realPath);

      // Hard links share one inode. Renaming a temp file over this name would
      // point it at a new inode and leave the other names on the old content,
      // so write in place instead, trading atomicity for keeping the links
      // together.
      if (existingStats.nlink > 1) {
        await fs.writeFile(realPath, content, 'utf-8');
        return;
      }
    }

    // The temp file must share a directory with the destination so that the
    // rename stays within one filesystem, and must be uniquely named so that
    // concurrent writers do not clobber each other's temp file.
    const tmpPath = `${realPath}.${randomUUID()}.tmp`;

    // A fresh temp file does not inherit the destination's permissions, so
    // without this, replacing a 0600 file would silently widen it to the
    // default mode.
    const existingMode =
      existingStats === undefined ? undefined : existingStats.mode & 0o777;

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

      await this.renameWithRetry(tmpPath, realPath);
    } catch (error) {
      await fs.rm(tmpPath, { force: true }).catch(() => {
        // Best effort: the original error is the one worth reporting.
      });
      throw error;
    }
  }

  private async statIfExists(filePath: string): Promise<Stats | undefined> {
    try {
      return await fs.stat(filePath);
    } catch {
      // New file, or a destination we cannot stat; treat it as absent.
      return undefined;
    }
  }

  /**
   * Rejects with the same error a plain write would raise when `filePath`
   * exists but is not writable.
   */
  private async assertWritable(filePath: string): Promise<void> {
    try {
      await fs.access(filePath, constants.W_OK);
    } catch (error) {
      // libuv reports a read-only file as EPERM on Windows, whereas opening it
      // for writing fails with EACCES there as it does everywhere else. Keep
      // the code a plain write would have produced so that callers classify
      // the failure as a permission error on every platform.
      if (
        process.platform === 'win32' &&
        isNodeError(error) &&
        error.code === 'EPERM'
      ) {
        throw Object.assign(
          new Error(`EACCES: permission denied, access '${filePath}'`),
          { code: 'EACCES', path: filePath, syscall: 'access' },
        );
      }
      throw error;
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
        const isRetryable =
          code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
        if (!isRetryable || attempt === RENAME_MAX_RETRIES - 1) {
          throw error;
        }
        const delayMs = Math.pow(2, attempt) * 50;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}
