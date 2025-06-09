/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';
import { isGitRepository } from './gitUtils.js';

export interface GitIgnoreFilter {
  isIgnored(filePath: string): boolean;
}

export class GitIgnoreParser implements GitIgnoreFilter {
  private projectRoot: string;
  private isGitRepo: boolean = false;
  private ig: Ignore = ignore();

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  async initialize(): Promise<void> {
    this.isGitRepo = isGitRepository(this.projectRoot);
    if (this.isGitRepo) {
      const gitIgnoreFiles = [
        path.join(this.projectRoot, '.gitignore'),
        path.join(this.projectRoot, '.git', 'info', 'exclude'),
      ];

      // Always ignore .git directory regardless of .gitignore content
      this.addPatterns(['.git']);

      for (const gitIgnoreFile of gitIgnoreFiles) {
        try {
          const content = await fs.readFile(gitIgnoreFile, 'utf-8');
          const patterns = content.split('\n').map((p) => p.trim());
          this.addPatterns(patterns);
        } catch (_error) {
          // File doesn't exist or can't be read, continue silently
        }
      }
    }
  }

  private addPatterns(patterns: string[]) {
    this.ig.add(patterns);
  }

  isIgnored(filePath: string): boolean {
    if (!this.isGitRepo) {
      return false;
    }

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

    const ignored = this.ig.ignores(normalizedPath);
    return ignored;
  }

  getGitRepoRoot(): string {
    return this.projectRoot;
  }
}
