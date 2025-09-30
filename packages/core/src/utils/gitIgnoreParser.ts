/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { isGitRepository } from './gitUtils.js';

export interface GitIgnoreFilter {
  isIgnored(filePath: string): boolean;
  getPatterns(): string[];
}

export class GitIgnoreParser implements GitIgnoreFilter {
  private projectRoot: string;
  private ig: Ignore = ignore();
  private patterns: string[] = [];

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  loadGitRepoPatterns(): void {
    if (!isGitRepository(this.projectRoot)) return;

    // Always ignore .git directory regardless of .gitignore content
    this.addPatterns(['.git']);

    const patternFiles = ['.gitignore', path.join('.git', 'info', 'exclude')];
    for (const pf of patternFiles) {
      this.loadPatterns(pf);
    }
  }

  loadPatterns(patternsFileName: string): void {
    const patternsFilePath = path.join(this.projectRoot, patternsFileName);
    let content: string;
    try {
      content = fs.readFileSync(patternsFilePath, 'utf-8');
    } catch (_error) {
      // ignore file not found
      return;
    }
    const patterns = (content ?? '')
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p !== '' && !p.startsWith('#'));
    this.addPatterns(patterns);
  }

  private addPatterns(patterns: string[]) {
    this.ig.add(patterns);
    this.patterns.push(...patterns);
  }

  isIgnored(filePath: string): boolean {
    try {
      const resolved = path.resolve(this.projectRoot, filePath);
      const relativePath = path.relative(this.projectRoot, resolved);

      if (relativePath === '' || relativePath.startsWith('..')) {
        return false;
      }

      // Check if relativePath is actually still an absolute path (can happen on some systems)
      if (path.isAbsolute(relativePath)) {
        // This shouldn't happen with path.relative(), but if it does,
        // it means the path is outside the project root
        return false;
      }

      // Even in windows, Ignore expects forward slashes.
      const normalizedPath = relativePath.replace(/\\/g, '/');
      return this.ig.ignores(normalizedPath);
    } catch (error) {
      // Handle any errors that might occur with international characters
      console.warn(`GitIgnore: Failed to process path "${filePath}":`, error);
      return false;
    }
  }

  getPatterns(): string[] {
    return this.patterns;
  }
}
