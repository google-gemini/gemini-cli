/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isNodeError } from '../utils/errors.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogger } from './debugLogger.js';

export type Unsubscribe = () => void;

export interface AddDirectoriesResult {
  added: string[];
  failed: Array<{ path: string; error: Error }>;
}

/**
 * WorkspaceContext manages multiple workspace directories and validates paths
 * against them. This allows the CLI to operate on files from multiple directories
 * in a single session.
 */
export class WorkspaceContext {
  private directories = new Set<string>();
  private initialDirectories: Set<string>;
  private readOnlyPaths = new Set<string>();
  private onDirectoriesChangedListeners = new Set<() => void>();

  /**
   * Creates a new WorkspaceContext with the given initial directory and optional additional directories.
   * @param targetDir The initial working directory (usually cwd)
   * @param additionalDirectories Optional array of additional directories to include
   */
  constructor(
    readonly targetDir: string,
    additionalDirectories: string[] = [],
  ) {
    this.addDirectory(targetDir);
    this.addDirectories(additionalDirectories);
    this.initialDirectories = new Set(this.directories);
  }

  /**
   * Registers a listener that is called when the workspace directories change.
   * @param listener The listener to call.
   * @returns A function to unsubscribe the listener.
   */
  onDirectoriesChanged(listener: () => void): Unsubscribe {
    this.onDirectoriesChangedListeners.add(listener);
    return () => {
      this.onDirectoriesChangedListeners.delete(listener);
    };
  }

  private notifyDirectoriesChanged() {
    // Iterate over a copy of the set in case a listener unsubscribes itself or others.
    for (const listener of [...this.onDirectoriesChangedListeners]) {
      try {
        listener();
      } catch (e) {
        // Don't let one listener break others.
        debugLogger.warn(
          `Error in WorkspaceContext listener: (${e instanceof Error ? e.message : String(e)})`,
        );
      }
    }
  }

  /**
   * Adds a directory to the workspace.
   * @param directory The directory path to add (can be relative or absolute)
   * @param basePath Optional base path for resolving relative paths (defaults to cwd)
   * @throws Error if the directory cannot be added
   */
  addDirectory(directory: string): void {
    const result = this.addDirectories([directory]);
    if (result.failed.length > 0) {
      throw result.failed[0].error;
    }
  }

  /**
   * Adds multiple directories to the workspace.
   * Emits a single change event if any directories are added.
   * @param directories The directory paths to add
   * @returns Object containing successfully added directories and failures
   */
  addDirectories(directories: string[]): AddDirectoriesResult {
    const result: AddDirectoriesResult = { added: [], failed: [] };
    let changed = false;

    for (const directory of directories) {
      try {
        const resolved = this.resolveAndValidateDir(directory);
        if (!this.directories.has(resolved)) {
          this.directories.add(resolved);
          changed = true;
        }
        result.added.push(directory);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        debugLogger.warn(
          `[WARN] Skipping unreadable directory: ${directory} (${error.message})`,
        );
        result.failed.push({ path: directory, error });
      }
    }

    if (changed) {
      this.notifyDirectoriesChanged();
    }

    return result;
  }

  /**
   * Adds a path to the read-only list.
   * These paths are allowed for reading but not for writing (unless they are also in the workspace).
   */
  addReadOnlyPath(pathToAdd: string): void {
    try {
      // Check if it exists
      if (!fs.existsSync(pathToAdd)) {
        return;
      }
      // Resolve symlinks
      const resolved = fs.realpathSync(path.resolve(this.targetDir, pathToAdd));
      this.readOnlyPaths.add(resolved);
    } catch (e) {
      debugLogger.warn(`Failed to add read-only path ${pathToAdd}:`, e);
    }
  }

  private resolveAndValidateDir(directory: string): string {
    const absolutePath = path.resolve(this.targetDir, directory);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Directory does not exist: ${absolutePath}`);
    }
    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${absolutePath}`);
    }

    return fs.realpathSync(absolutePath);
  }

  /**
   * Gets a copy of all workspace directories.
   * @returns Array of absolute directory paths
   */
  getDirectories(): readonly string[] {
    return Array.from(this.directories);
  }

  getInitialDirectories(): readonly string[] {
    return Array.from(this.initialDirectories);
  }

  setDirectories(directories: readonly string[]): void {
    const newDirectories = new Set<string>();
    for (const dir of directories) {
      newDirectories.add(this.resolveAndValidateDir(dir));
    }

    if (
      newDirectories.size !== this.directories.size ||
      ![...newDirectories].every((d) => this.directories.has(d))
    ) {
      this.directories = newDirectories;
      this.notifyDirectoriesChanged();
    }
  }

  /**
   * Checks if a given path is within any of the workspace directories.
   * @param pathToCheck The path to validate
   * @returns True if the path is within the workspace, false otherwise
   */
  isPathWithinWorkspace(pathToCheck: string): boolean {
    try {
      const fullyResolvedPath = this.fullyResolvedPath(pathToCheck);

      for (const dir of this.directories) {
        if (this.isPathWithinRoot(fullyResolvedPath, dir)) {
          return true;
        }
      }
      return false;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Checks if a path is allowed to be read.
   * This includes workspace paths and explicitly added read-only paths.
   * @param pathToCheck The path to validate
   * @returns True if the path is readable, false otherwise
   */
  isPathReadable(pathToCheck: string): boolean {
    if (this.isPathWithinWorkspace(pathToCheck)) {
      return true;
    }
    try {
      const fullyResolvedPath = this.fullyResolvedPath(pathToCheck);

      for (const allowedPath of this.readOnlyPaths) {
        // Allow exact matches or subpaths (if allowedPath is a directory)
        if (
          fullyResolvedPath === allowedPath ||
          this.isPathWithinRoot(fullyResolvedPath, allowedPath)
        ) {
          return true;
        }
      }
      return false;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Fully resolves a path, including symbolic links.
   * If the path does not exist, it returns the fully resolved path as it would be
   * if it did exist.
   */
  private fullyResolvedPath(pathToCheck: string): string {
    try {
      return fs.realpathSync(path.resolve(this.targetDir, pathToCheck));
    } catch (e: unknown) {
      if (
        isNodeError(e) &&
        e.code === 'ENOENT' &&
        e.path &&
        // realpathSync does not set e.path correctly for symlinks to
        // non-existent files.
        !this.isFileSymlink(e.path)
      ) {
        // If it doesn't exist, e.path contains the fully resolved path.
        return e.path;
      }
      throw e;
    }
  }

  /**
   * Checks if a path is within a given root directory.
   * @param pathToCheck The absolute path to check
   * @param rootDirectory The absolute root directory
   * @returns True if the path is within the root directory, false otherwise
   */
  private isPathWithinRoot(
    pathToCheck: string,
    rootDirectory: string,
  ): boolean {
    const relative = path.relative(rootDirectory, pathToCheck);
    return (
      !relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative)
    );
  }

  /**
   * Checks if a file path is a symbolic link that points to a file.
   */
  private isFileSymlink(filePath: string): boolean {
    try {
      return !fs.readlinkSync(filePath).endsWith('/');
    } catch (_error) {
      return false;
    }
  }
}
