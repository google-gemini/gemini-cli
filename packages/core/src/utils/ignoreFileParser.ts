/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ignore from 'ignore';
import { debugLogger } from './debugLogger.js';

export interface IgnoreFileFilter {
  isIgnored(filePath: string): boolean;
  getPatterns(): string[];
  getIgnoreFilePaths(): string[];
  hasPatterns(): boolean;
}

/**
 * An ignore file parser that reads the ignore files from the project root.
 */
export class IgnoreFileParser implements IgnoreFileFilter {
  private projectRoot: string;
  private patterns: string[] = [];
  private ig = ignore();
  private readonly fileNames: string[];

  constructor(
    projectRoot: string,
    // The order matters: files listed earlier have higher priority.
    // It can be a single file name/pattern or an array of file names/patterns.
    input: string | string[],
    isPatterns = false,
  ) {
    this.projectRoot = path.resolve(projectRoot);
    if (isPatterns) {
      this.fileNames = [];
      const patterns = Array.isArray(input) ? input : [input];
      this.patterns.push(...patterns);
      this.ig.add(patterns);
    } else {
      this.fileNames = Array.isArray(input) ? input : [input];
      this.loadPatternsFromFiles();
    }
  }

  private loadPatternsFromFiles(): void {
    // Iterate in reverse order so that the first file in the list is processed last.
    // This gives the first file the highest priority, as patterns added later override earlier ones.
    for (const fileName of [...this.fileNames].reverse()) {
      const patterns = this.parseIgnoreFile(fileName);
      this.patterns.push(...patterns);
      this.ig.add(patterns);
    }
  }

  private parseIgnoreFile(fileName: string): string[] {
    const patternsFilePath = path.join(this.projectRoot, fileName);
    let content: string;
    try {
      content = fs.readFileSync(patternsFilePath, 'utf-8');
    } catch (_error) {
      debugLogger.debug(
        `Ignore file not found: ${patternsFilePath}, continue without it.`,
      );
      return [];
    }

    debugLogger.debug(`Loading ignore patterns from: ${patternsFilePath}`);

    return (content ?? '')
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p !== '' && !p.startsWith('#'));
  }

  isIgnored(filePath: string): boolean {
    if (this.patterns.length === 0) {
      return false;
    }

    if (!filePath || typeof filePath !== 'string') {
      return false;
    }

    if (
      filePath.startsWith('\\') ||
      filePath === '/' ||
      filePath.includes('\0')
    ) {
      return false;
    }

    const resolved = path.resolve(this.projectRoot, filePath);
    const relativePath = path.relative(this.projectRoot, resolved);

    if (relativePath === '' || relativePath.startsWith('..')) {
      return false;
    }

    // Even in windows, Ignore expects forward slashes.
    const normalizedPath = relativePath.replace(/\\/g, '/');

    if (normalizedPath.startsWith('/') || normalizedPath === '') {
      return false;
    }

    return this.ig.ignores(normalizedPath);
  }

  getPatterns(): string[] {
    return this.patterns;
  }

  getIgnoreFilePaths(): string[] {
    return this.fileNames
      .slice()
      .reverse()
      .map((fileName) => path.join(this.projectRoot, fileName))
      .filter((filePath) => fs.existsSync(filePath));
  }

  /**
   * Returns true if at least one ignore file exists and has patterns.
   */
  hasPatterns(): boolean {
    return this.patterns.length > 0;
  }
}
