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

    this.loadPatterns(path.join('.git', 'info', 'exclude'));
    this.findAndLoadGitignoreFiles(this.projectRoot);
  }

  private findAndLoadGitignoreFiles(dir: string): void {
    const relativeDir = path.relative(this.projectRoot, dir);

    // For sub-directories, check if they are ignored before proceeding.
    // The root directory (relativeDir === '') should not be checked.
    if (relativeDir && this.isIgnored(relativeDir)) {
      return;
    }

    // Load patterns from .gitignore in the current directory
    const gitignorePath = path.join(dir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      this.loadPatterns(path.relative(this.projectRoot, gitignorePath));
    }

    // Recurse into subdirectories
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.git') {
          continue;
        }
        if (entry.isDirectory()) {
          this.findAndLoadGitignoreFiles(path.join(dir, entry.name));
        }
      }
    } catch (_error) {
      // ignore readdir errors
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

    // .git/info/exclude file patterns are relative to project root and not file directory
    const isExcludeFile =
      patternsFileName.replace(/\\/g, '/') === '.git/info/exclude';
    const relativeBaseDir = isExcludeFile
      ? '.'
      : path.dirname(patternsFileName);

    const patterns = (content ?? '')
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p !== '' && !p.startsWith('#'))
      .map((p) => {
        const isNegative = p.startsWith('!');
        if (isNegative) {
          p = p.substring(1);
        }

        const isAnchoredInFile = p.startsWith('/');
        if (isAnchoredInFile) {
          p = p.substring(1);
        }

        // An empty pattern can result from a negated pattern like `!`,
        // which we can ignore.
        if (p === '') {
          return '';
        }

        let newPattern = p;
        if (relativeBaseDir && relativeBaseDir !== '.') {
          // Only in nested .gitignore files, the patterns need to be modified according to:
          // - If `a/b/.gitignore` defines `/c` then it needs to be changed to `/a/b/c`
          // - If `a/b/.gitignore` defines `c` then it needs to be changed to `/a/b/**/c`
          // - If `a/b/.gitignore` defines `c/d` then it needs to be changed to `/a/b/c/d`

          if (!isAnchoredInFile && !p.includes('/')) {
            // If no slash and not anchored in file, it matches files in any
            // subdirectory.
            newPattern = path.join('**', p);
          }

          // Prepend the .gitignore file's directory.
          newPattern = path.join(relativeBaseDir, newPattern);

          // Anchor the pattern to a nested gitignore directory.
          if (!newPattern.startsWith('/')) {
            newPattern = '/' + newPattern;
          }
        }

        // Anchor the pattern if originally anchored
        if (isAnchoredInFile && !newPattern.startsWith('/')) {
          newPattern = '/' + newPattern;
        }

        if (isNegative) {
          newPattern = '!' + newPattern;
        }

        // Even in windows, Ignore expects forward slashes.
        newPattern = newPattern.replace(/\\/g, '/');

        return newPattern;
      })
      .filter((p) => p !== '');
    this.addPatterns(patterns);
  }

  private addPatterns(patterns: string[]) {
    this.ig.add(patterns);
    this.patterns.push(...patterns);
  }

  isIgnored(filePath: string): boolean {
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

    try {
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
    } catch (_error) {
      return false;
    }
  }

  getPatterns(): string[] {
    return this.patterns;
  }
}
