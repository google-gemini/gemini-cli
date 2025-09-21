/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import * as Diff from 'diff';
import { isNodeError } from './errors.js';

/**
 * Represents the state of a file at a specific point in time.
 */
export interface FileState {
  /** The content of the file */
  content: string;
  /** The modification time of the file */
  mtime: Date;
  /** The size of the file in bytes */
  size: number;
  /** Optional SHA-256 hash of the content for more accurate comparison */
  hash?: string;
}

/**
 * Result of a file freshness check.
 */
export interface FileFreshnessResult {
  /** Whether the file is still in the expected state */
  isFresh: boolean;
  /** The original file state that was stored */
  originalState: FileState;
  /** The current file state (if file still exists) */
  currentState?: FileState;
  /** Diff showing what changed (if available) */
  diff?: string;
  /** Human-readable description of what changed */
  changeDescription?: string;
}

/**
 * Options for file state tracking configuration.
 */
export interface FileStateTrackerOptions {
  /** Whether to compute content hashes for more accurate comparison (default: false) */
  useContentHash?: boolean;
  /** Whether to generate diffs when files change (default: true) */
  generateDiffs?: boolean;
}

/**
 * Utility class for tracking file state and detecting external modifications.
 */
export class FileStateTracker {
  private readonly options: Required<FileStateTrackerOptions>;

  constructor(options: FileStateTrackerOptions = {}) {
    this.options = {
      useContentHash: options.useContentHash ?? false,
      generateDiffs: options.generateDiffs ?? true,
    };
  }

  /**
   * Gets the current state of a file.
   * @param filePath Path to the file
   * @returns Promise resolving to FileState
   * @throws File system errors if file cannot be read
   */
  async getFileState(filePath: string): Promise<FileState> {
    try {
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');

      const fileState: FileState = {
        content,
        mtime: stats.mtime,
        size: stats.size,
      };

      if (this.options.useContentHash) {
        fileState.hash = this.computeHash(content);
      }

      return fileState;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(
        `Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Checks if a file has changed since the provided state was captured.
   * @param filePath Path to the file
   * @param expectedState The expected file state
   * @returns Promise resolving to FileFreshnessResult
   */
  async checkFreshness(
    filePath: string,
    expectedState: FileState,
  ): Promise<FileFreshnessResult> {
    try {
      const currentState = await this.getFileState(filePath);

      // Quick checks first (faster than content comparison)
      if (currentState.size !== expectedState.size) {
        return this.createStaleResult(
          expectedState,
          currentState,
          'file size changed',
        );
      }

      if (currentState.mtime.getTime() !== expectedState.mtime.getTime()) {
        return this.createStaleResult(
          expectedState,
          currentState,
          'file modification time changed',
        );
      }

      // If using content hash, compare hashes
      if (this.options.useContentHash) {
        const currentHash = this.computeHash(currentState.content);
        if (currentHash !== expectedState.hash) {
          return this.createStaleResult(
            expectedState,
            currentState,
            'file content changed',
          );
        }
      } else {
        // Compare content directly
        if (currentState.content !== expectedState.content) {
          return this.createStaleResult(
            expectedState,
            currentState,
            'file content changed',
          );
        }
      }

      // File is fresh
      return {
        isFresh: true,
        originalState: expectedState,
        currentState,
      };
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return this.createStaleResult(
          expectedState,
          undefined,
          'file was deleted',
        );
      }

      // Other file system errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        isFresh: false,
        originalState: expectedState,
        changeDescription: `Error checking file: ${errorMessage}`,
      };
    }
  }

  /**
   * Creates a FileFreshnessResult indicating the file is stale.
   */
  private createStaleResult(
    originalState: FileState,
    currentState: FileState | undefined,
    reason: string,
  ): FileFreshnessResult {
    const result: FileFreshnessResult = {
      isFresh: false,
      originalState,
      currentState,
      changeDescription: reason,
    };

    // Generate diff if requested and we have both states
    if (this.options.generateDiffs && currentState) {
      result.diff = Diff.createPatch(
        'file',
        originalState.content,
        currentState.content,
        'Original',
        'Current',
        { context: 3 },
      );
    }

    return result;
  }

  /**
   * Computes SHA-256 hash of the content.
   */
  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Validates that the file state is still current by performing a quick check.
   * This is useful for avoiding expensive content comparisons when possible.
   */
  async isFileStateCurrent(
    filePath: string,
    expectedState: Pick<FileState, 'mtime' | 'size'>,
  ): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      return (
        stats.size === expectedState.size &&
        stats.mtime.getTime() === expectedState.mtime.getTime()
      );
    } catch {
      return false;
    }
  }
}
