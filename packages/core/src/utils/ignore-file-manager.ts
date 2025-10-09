/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import ignore, { type Ignore } from 'ignore';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Configuration for a type of ignore file (e.g., .gitignore, .geminiignore).
 */
export interface IgnoreFileType {
  /** The name of the ignore file. */
  readonly name: string;
  /**
   * The precedence of this file type. Higher values override lower values.
   */
  readonly precedence: number;
  /**
   * Static global rules that apply to this file type.
   */
  readonly staticGlobalRules?: readonly string[];
  /**
   * Paths to global ignore files. These can be relative to the project root or absolute paths.
   */
  readonly globalRuleFilePaths?: readonly string[];
}

type Exact<T, U> = T & Record<Exclude<keyof U, keyof T>, never>;

/**
 * Helper function to create an `IgnoreFileType` with strict type checking.
 * Ensures that config object literals don't have excess properties.
 */
export function createIgnoreFileType(
  config: Exact<IgnoreFileType, IgnoreFileType>,
): IgnoreFileType {
  return config;
}

export class IgnoreFileManager {
  private readonly projectRoot: string;
  private readonly ignoreFileTypes: readonly IgnoreFileType[];
  private readonly finalEngineCache: Map<string, Ignore> = new Map();
  private readonly partialRulesetCache: Map<string, Ignore> = new Map();
  // Stores raw patterns from root ignore files for legacy support
  private readonly rootPatterns: Map<string, readonly string[]> = new Map();

  constructor(projectRoot: string, ignoreFileTypes: readonly IgnoreFileType[]) {
    this.projectRoot = projectRoot;
    // Sort types by precedence ascending to process in the correct order
    this.ignoreFileTypes = [...ignoreFileTypes].sort(
      (a, b) => a.precedence - b.precedence,
    );

    // Initialize root partials in cache
    for (const fileType of this.ignoreFileTypes) {
      const cacheKey = `${this.projectRoot}:${fileType.name}`;
      this.partialRulesetCache.set(cacheKey, this.computeRootPartial(fileType));
    }
  }

  private computeRootPartial(fileType: IgnoreFileType): Ignore {
    const rootPartial = ignore();
    // Add static global rules for this type
    if (fileType.staticGlobalRules) {
      rootPartial.add(fileType.staticGlobalRules);
    }
    // Add rules from global ignore files
    if (fileType.globalRuleFilePaths) {
      for (const ruleFile of fileType.globalRuleFilePaths) {
        const ruleFilePath = path.join(this.projectRoot, ruleFile);
        if (fs.existsSync(ruleFilePath)) {
          const content = fs.readFileSync(ruleFilePath).toString();
          rootPartial.add(content);
        }
      }
    }
    // Add rules from root ignore file
    const ignoreFilePath = path.join(this.projectRoot, fileType.name);
    if (fs.existsSync(ignoreFilePath)) {
      const content = fs.readFileSync(ignoreFilePath).toString();
      const patterns = this.parsePatterns(content);
      this.rootPatterns.set(fileType.name, patterns);
      // For root ignore files, we don't need to adjust patterns for relative paths
      rootPartial.add(patterns);
    }
    return rootPartial;
  }

  /**
   * Parses ignore file content into an array of patterns.
   * Handles trimming, empty lines, and comments.
   */
  private parsePatterns(content: string): readonly string[] {
    return content
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p !== '' && !p.startsWith('#'));
  }

  /**
   * Validates and normalizes a file path relative to the project root.
   *
   * @param filePath - The absolute path to the file.
   * @returns The normalized relative path, or `undefined` if the path is invalid or outside the project root.
   */
  private getNormalizedRelativePath(filePath: unknown): string | undefined {
    if (!filePath || typeof filePath !== 'string') {
      return undefined;
    }

    const resolved = path.resolve(this.projectRoot, filePath);
    const relativePath = path.relative(this.projectRoot, resolved);

    if (relativePath === '' || relativePath.startsWith('..')) {
      return undefined;
    }

    // Normalize for Windows
    return path.sep === '\\' ? relativePath.replace(/\\/g, '/') : relativePath;
  }

  /**
   * Checks if a file is ignored by any of the configured ignore file types.
   *
   * @param filePath - The absolute path to the file.
   * @returns `true` if the file is ignored, `false` otherwise.
   */
  isIgnored(filePath: string): boolean {
    const normalizedPath = this.getNormalizedRelativePath(filePath);
    if (normalizedPath === undefined) {
      return false;
    }

    const directoryPath = path.dirname(filePath);
    const rulesEngine = this.getOrCreateRulesEngineForDirectory(directoryPath);
    return rulesEngine.ignores(normalizedPath);
  }

  /**
   * Checks if a file is ignored by a specific ignore file type.
   *
   * @param filePath - The absolute path to the file.
   * @param ignoreFileName - The name of the ignore file type (e.g., '.gitignore').
   * @returns `true` if the file is ignored by the specified type, `false` otherwise.
   */
  isIgnoredBy(filePath: string, ignoreFileName: string): boolean {
    const fileType = this.ignoreFileTypes.find(
      (ft) => ft.name === ignoreFileName,
    );
    if (!fileType) {
      return false;
    }

    const normalizedPath = this.getNormalizedRelativePath(filePath);
    if (normalizedPath === undefined) {
      return false;
    }

    const rulesEngine = this.getPartialRuleset(
      path.dirname(filePath),
      fileType,
    );
    return rulesEngine.ignores(normalizedPath);
  }

  /**
   * Returns the raw patterns from the ignore file at the project root for the given file type.
   * This is primarily for legacy support and tool descriptions.
   *
   * @param fileTypeName - The name of the ignore file type.
   * @returns An array of patterns.
   */
  getRootPatterns(fileTypeName: string): readonly string[] {
    return this.rootPatterns.get(fileTypeName) ?? [];
  }

  private getOrCreateRulesEngineForDirectory(directoryPath: string): Ignore {
    // 1. Check Primary Cache
    if (this.finalEngineCache.has(directoryPath)) {
      return this.finalEngineCache.get(directoryPath)!;
    }

    // 2. Build from Partials
    const finalEngine = ignore();
    for (const fileType of this.ignoreFileTypes) {
      const partialRuleset = this.getPartialRuleset(directoryPath, fileType);
      finalEngine.add(partialRuleset);
    }

    // 3. Cache and Return
    this.finalEngineCache.set(directoryPath, finalEngine);
    return finalEngine;
  }

  private getPartialRuleset(
    directoryPath: string,
    fileType: IgnoreFileType,
  ): Ignore {
    const cacheKey = `${directoryPath}:${fileType.name}`;
    // 1. Check Secondary Cache
    if (this.partialRulesetCache.has(cacheKey)) {
      return this.partialRulesetCache.get(cacheKey)!;
    }

    // 2. Base Case: Project Root or outside of it
    // Note: directoryPath === this.projectRoot is handled by cache check above.
    if (!directoryPath.startsWith(this.projectRoot)) {
      const rootCacheKey = `${this.projectRoot}:${fileType.name}`;
      return this.partialRulesetCache.get(rootCacheKey)!;
    }

    // 3. Recursive Step
    const parentDir = path.dirname(directoryPath);
    const parentPartial = this.getPartialRuleset(parentDir, fileType);

    const ignoreFilePath = path.join(directoryPath, fileType.name);

    // Optimization: If no ignore file, reuse parent's Ignore instance.
    if (!fs.existsSync(ignoreFilePath)) {
      this.partialRulesetCache.set(cacheKey, parentPartial);
      return parentPartial;
    }

    const newPartial = ignore().add(parentPartial);
    const content = fs.readFileSync(ignoreFilePath).toString();
    const relativeDir = path.relative(this.projectRoot, directoryPath);
    newPartial.add(this.adjustPatterns(content, relativeDir));

    this.partialRulesetCache.set(cacheKey, newPartial);
    return newPartial;
  }

  /**
   * Adjusts patterns from an ignore file to be relative to the project root.
   * Handles negation and directory-specific patterns.
   *
   * @param content - The content of the ignore file.
   * @param relativeDir - The directory of the ignore file relative to the project root.
   * @returns An array of adjusted patterns.
   */
  private adjustPatterns(
    content: string,
    relativeDir: string,
  ): readonly string[] {
    const patterns = content
      .split('\n')
      .map((p) => {
        const trimmed = p.trim();
        if (trimmed === '' || trimmed.startsWith('#')) {
          return null;
        }

        // Don't modify patterns in the root ignore file, they are already root-relative
        if (relativeDir === '') {
          return trimmed;
        }

        let isNegative = false;
        let pattern = trimmed;
        if (pattern.startsWith('!')) {
          isNegative = true;
          pattern = pattern.substring(1);
        }

        // According to gitignore spec, if there is a separator (`/`) in the pattern,
        // it is treated as relative to the directory of the .gitignore file.
        // A leading slash also makes it relative.
        if (pattern.startsWith('/') || pattern.includes('/')) {
          // Remove leading slash if present, as path.join handles it.
          const cleanPattern = pattern.startsWith('/')
            ? pattern.substring(1)
            : pattern;
          pattern = path.join(relativeDir, cleanPattern);
        }

        // If there's no '/', it's a glob that can match anywhere, so we don't modify it.
        // e.g., `*.log` or `node_modules`

        // Normalize path separators for Windows compatibility, as `ignore` library expects POSIX paths
        if (path.sep === '\\') {
          pattern = pattern.replace(/\\/g, '/');
        }

        return isNegative ? '!' + pattern : pattern;
      })
      .filter((p): p is string => p !== null);
    return patterns;
  }
}
