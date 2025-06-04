/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { isGitRepository } from './gitUtils.js';

export interface GitIgnoreFilter {
  isIgnored(filePath: string): boolean;
  getIgnoredPatterns(): string[];
}

export class GitIgnoreParser implements GitIgnoreFilter {
  private ignorePatterns: string[] = [];
  private projectRoot: string;
  private isGitRepo: boolean = false;

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
      this.ignorePatterns = ['.git/**', '.git'];

      for (const gitIgnoreFile of gitIgnoreFiles) {
        try {
          const content = await fs.readFile(gitIgnoreFile, 'utf-8');
          const patterns = this.parseGitIgnoreContent(content);
          this.ignorePatterns.push(...patterns);
        } catch (_error) {
          // File doesn't exist or can't be read, continue silently
        }
      }
    }
  }

  private parseGitIgnoreContent(content: string): string[] {
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((pattern) => {
        // Handle negation patterns (!) - for now we'll skip them
        if (pattern.startsWith('!')) {
          return null;
        }

        // Convert gitignore patterns to minimatch-compatible patterns
        if (pattern.endsWith('/')) {
          // Directory pattern - match directory and all contents
          const dirPattern = pattern.slice(0, -1); // Remove trailing slash
          return [dirPattern, dirPattern + '/**'];
        }

        // If pattern doesn't contain /, it should match at any level
        if (!pattern.includes('/') && !pattern.startsWith('**/')) {
          return '**/' + pattern;
        }

        return pattern;
      })
      .filter((pattern) => pattern !== null)
      .flat() as string[];
  }

  isIgnored(filePath: string): boolean {
    // If not a git repository, nothing is ignored
    if (!this.isGitRepo) {
      return false;
    }

    // Normalize the input path (handle ./ prefixes)
    let cleanPath = filePath;
    if (cleanPath.startsWith('./')) {
      cleanPath = cleanPath.slice(2);
    }

    // Convert to relative path from project root
    const relativePath = path.relative(
      this.projectRoot,
      path.resolve(this.projectRoot, cleanPath),
    );

    // Handle paths that go outside project root
    if (relativePath.startsWith('..')) {
      return false;
    }

    // Normalize path separators for cross-platform compatibility
    const normalizedPath = relativePath.replace(/\\/g, '/');

    return this.ignorePatterns.some((pattern) =>
      minimatch(normalizedPath, pattern, {
        dot: true,
        matchBase: false,
        flipNegate: false,
      }),
    );
  }

  getIgnoredPatterns(): string[] {
    return [...this.ignorePatterns];
  }
}
