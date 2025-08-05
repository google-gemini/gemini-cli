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

  private initialDirectories: Set<string>;

  /**
   * Creates a new WorkspaceContext with the given initial directory and optional additional directories.
   * @param initialDirectory The initial working directory (usually cwd)
   * @param additionalDirectories Optional array of additional directories to include
   */
  constructor(initialDirectory: string, additionalDirectories: string[] = []) {
    this.directories = new Set<string>();
    this.initialDirectories = new Set<string>();

    this.addDirectoryInternal(initialDirectory);
    this.addInitialDirectoryInternal(initialDirectory);

    for (const dir of additionalDirectories) {
      this.addDirectoryInternal(dir);
      this.addInitialDirectoryInternal(dir);
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

    let realPath: string;
    try {
      realPath = fs.realpathSync(absolutePath);
    } catch (_error) {
      throw new Error(`Failed to resolve path: ${absolutePath}`);
    }

    this.directories.add(realPath);
  }

  private addInitialDirectoryInternal(
    directory: string,
    basePath: string = process.cwd(),
  ): void {
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

    let realPath: string;
    try {
      realPath = fs.realpathSync(absolutePath);
    } catch (_error) {
      throw new Error(`Failed to resolve path: ${absolutePath}`);
    }

    this.initialDirectories.add(realPath);
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
    this.directories.clear();
    for (const dir of directories) {
      this.addDirectoryInternal(dir);
    }
  }

  /**
   * Checks if a given path is within any of the workspace directories.
   * @param pathToCheck The path to validate
   * @returns True if the path is within the workspace, false otherwise
   */
  isPathWithinWorkspace(pathToCheck: string): boolean {
    try {
      const absolutePath = path.resolve(pathToCheck);

      let resolvedPath = absolutePath;
      if (fs.existsSync(absolutePath)) {
        try {
          resolvedPath = fs.realpathSync(absolutePath);
        } catch (_error) {
          return false;
        }
      }

      for (const dir of this.directories) {
        if (this.isPathWithinRoot(resolvedPath, dir)) {
          return true;
        }
      }

      return false;
    } catch (_error) {
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
    return (
      !relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative)
    );
  }
}
