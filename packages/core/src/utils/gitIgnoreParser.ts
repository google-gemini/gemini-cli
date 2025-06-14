/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import ignore, { type Ignore } from 'ignore';
import { isGitRepository } from './gitUtils.js';

export interface GitIgnoreFilter {
  isIgnored(filePath: string): boolean;
}

export class GitIgnoreParser implements GitIgnoreFilter {
  private projectRoot: string;
  private isGitRepo: boolean = false;
  private ig: Ignore = ignore();
  private patterns: string[] = [];

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  async initialize(patternsFileName?: string): Promise<void> {
    const patternFiles = [];
    if (patternsFileName && patternsFileName !== '') {
      patternFiles.push(patternsFileName);
    }

    this.isGitRepo = isGitRepository(this.projectRoot);
    if (this.isGitRepo) {
      patternFiles.push('.gitignore');
      patternFiles.push(path.join('.git', 'info', 'exclude'));

      // Always ignore .git directory regardless of .gitignore content
      this.addPatterns(['.git']);
    }
    for (const pf of patternFiles) {
      try {
        await this.loadPatterns(pf);
      } catch (_error) {
        // File doesn't exist or can't be read, continue silently
      }
    }
  }

  async loadPatterns(patternsFileName: string): Promise<void> {
    const patternsFilePath = path.join(this.projectRoot, patternsFileName);
    const content = await fs.readFile(patternsFilePath, 'utf-8');
    const patterns = content
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p !== '' && !p.startsWith('#'));
    if (patterns.length > 0) {
      console.log(
        `Loaded ${patterns.length} patterns from ${patternsFilePath}`,
      );
    }
    this.addPatterns(patterns);
  }

  private addPatterns(patterns: string[]) {
    this.ig.add(patterns);
    this.patterns.push(...patterns);
  }

  isIgnored(filePath: string): boolean {
    const relativePath = path.isAbsolute(filePath)
      ? path.relative(this.projectRoot, filePath)
      : filePath;

    if (relativePath === '' || relativePath.startsWith('..')) {
      return false;
    }

    let normalizedPath = relativePath.replace(/\\/g, '/');
    if (normalizedPath.startsWith('./')) {
      normalizedPath = normalizedPath.substring(2);
    }

    return this.ig.ignores(normalizedPath);
  }

  getPatterns(): string[] {
    return this.patterns;
  }
}
