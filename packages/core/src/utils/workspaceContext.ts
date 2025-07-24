/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * WorkspaceContext manages multiple workspace directories and validates paths
 * against them. This allows the CLI to operate on files from multiple directories
 * in a single session.
 */
export class WorkspaceContext {
  private directories: Set<string>;

  /**
   * Creates a new WorkspaceContext with the given initial directory and optional additional directories.
   * @param initialDirectory The initial working directory (usually cwd)
   * @param additionalDirectories Optional array of additional directories to include
   */
  constructor(initialDirectory: string, additionalDirectories: string[] = []) {
    this.directories = new Set<string>();

    // Add initial directory
    this.addDirectoryInternal(initialDirectory);

    // Add any additional directories
    for (const dir of additionalDirectories) {
      this.addDirectoryInternal(dir);
    }
  }

  /**
   * Adds a directory to the workspace.
   * @param directory The directory path to add (can be relative or absolute)
   * @param basePath Optional base path for resolving relative paths (defaults to cwd)
   */
  addDirectory(directory: string, basePath: string = process.cwd()): void {
    this.addDirectoryInternal(directory, basePath);
  }

  /**
   * Internal method to add a directory with validation.
   */
  private addDirectoryInternal(
    directory: string,
    basePath: string = process.cwd(),
  ): void {
    // Resolve to absolute path
    const absolutePath = path.isAbsolute(directory)
      ? directory
      : path.resolve(basePath, directory);

    // Check if directory exists
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Directory does not exist: ${absolutePath}`);
    }

    // Check if it's actually a directory
    const stats = fs.statSync(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${absolutePath}`);
    }

    // Resolve symbolic links
    let realPath: string;
    try {
      realPath = fs.realpathSync(absolutePath);
    } catch (_error) {
      throw new Error(`Failed to resolve path: ${absolutePath}`);
    }

    // Add to the set (automatically prevents duplicates)
    this.directories.add(realPath);
  }

  /**
   * Gets a copy of all workspace directories.
   * @returns Array of absolute directory paths
   */
  getDirectories(): string[] {
    return Array.from(this.directories);
  }

  /**
   * Checks if a given path is within any of the workspace directories.
   * @param pathToCheck The path to validate
   * @returns True if the path is within the workspace, false otherwise
   */
  isPathWithinWorkspace(pathToCheck: string): boolean {
    try {
      // Resolve the path to absolute
      const absolutePath = path.resolve(pathToCheck);

      // Try to resolve symbolic links if the path exists
      let resolvedPath = absolutePath;
      if (fs.existsSync(absolutePath)) {
        try {
          resolvedPath = fs.realpathSync(absolutePath);
        } catch (_error) {
          // If we can't resolve (e.g., circular symlinks), reject the path
          return false;
        }
      }

      // Check if the resolved path is within any workspace directory
      for (const dir of this.directories) {
        if (this.isPathWithinRoot(resolvedPath, dir)) {
          return true;
        }
      }

      return false;
    } catch (_error) {
      // On any error, default to rejecting the path
      return false;
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
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }
}
