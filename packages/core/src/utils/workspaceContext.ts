/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isNodeError } from '../utils/errors.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';

export type Unsubscribe = () => void;

/**
 * WorkspaceContext manages multiple workspace directories and validates paths
 * against them. This allows the CLI to operate on files from multiple directories
 * in a single session.
 */
export class WorkspaceContext {
  private directories = new Set<string>();
  private initialDirectories: Set<string>;
  private onDirectoriesChangedListeners = new Set<() => void>();

  /**
   * Creates a new WorkspaceContext with the given initial directory and optional additional directories.
   * @param directory The initial working directory (usually cwd)
   * @param additionalDirectories Optional array of additional directories to include
   */
  constructor(directory: string, additionalDirectories: string[] = []) {
    this.addDirectory(directory);
    for (const additionalDirectory of additionalDirectories) {
      this.addDirectory(additionalDirectory);
    }
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
        console.error('Error in WorkspaceContext listener:', e);
      }
    }
  }

  /**
   * Adds a directory to the workspace.
   * @param directory The directory path to add (can be relative or absolute)
   * @param basePath Optional base path for resolving relative paths (defaults to cwd)
   */
  addDirectory(directory: string, basePath: string = process.cwd()): void {
    try {
      const resolved = this.resolveAndValidateDir(directory, basePath);
      if (this.directories.has(resolved)) {
        return;
      }
      this.directories.add(resolved);
      this.notifyDirectoriesChanged();
    } catch (err) {
      console.warn(
        `[WARN] Skipping unreadable directory: ${directory} (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

  private resolveAndValidateDir(
    directory: string,
    basePath: string = process.cwd(),
  ): string {
    const absolutePath = path.isAbsolute(directory)
      ? directory
      : path.resolve(basePath, directory);

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
   * Fully resolves a path, including symbolic links.
   * If the path does not exist, it returns the fully resolved path as it would be
   * if it did exist.
   */
  private fullyResolvedPath(pathToCheck: string): string {
    try {
      return fs.realpathSync(pathToCheck);
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
