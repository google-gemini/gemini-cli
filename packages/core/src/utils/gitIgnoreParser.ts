/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { getNormalizedRelativePath } from './ignorePathUtils.js';

export interface GitIgnoreFilter {
  isIgnored(filePath: string, isDirectory: boolean): boolean;
}

export class GitIgnoreParser implements GitIgnoreFilter {
  private projectRoot: string;
  private cache: Map<string, Ignore> = new Map();
  private globalPatterns: Ignore | undefined;
  private processedExtraPatterns: Ignore;

  constructor(
    projectRoot: string,
    private readonly extraPatterns?: string[],
  ) {
    this.projectRoot = path.resolve(projectRoot);
    this.processedExtraPatterns = ignore();
    if (this.extraPatterns) {
      // extraPatterns are assumed to be from project root (like .geminiignore)
      this.processedExtraPatterns.add(
        this.processPatterns(this.extraPatterns, '.'),
      );
    }
  }

  private loadPatternsForFile(patternsFilePath: string): Ignore {
    let content: string;
    try {
      content = fs.readFileSync(patternsFilePath, 'utf-8');
    } catch {
      return ignore();
    }

    const isExcludeFile = patternsFilePath.endsWith(
      path.join('.git', 'info', 'exclude'),
    );

    const relativeBaseDir = isExcludeFile
      ? '.'
      : path
          .dirname(path.relative(this.projectRoot, patternsFilePath))
          .split(path.sep)
          .join(path.posix.sep);

    const rawPatterns = content.split('\n');
    return ignore().add(this.processPatterns(rawPatterns, relativeBaseDir));
  }

  private processPatterns(
    rawPatterns: string[],
    relativeBaseDir: string,
  ): string[] {
    return rawPatterns
      .map((p) => p.trimStart())
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
            newPattern = path.posix.join('**', p);
          }

          // Prepend the .gitignore file's directory.
          newPattern = path.posix.join(relativeBaseDir, newPattern);

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

        return newPattern;
      })
      .filter((p) => p !== '');
  }

  isIgnored(filePath: string, isDirectory: boolean): boolean {
    const normalizedPath = getNormalizedRelativePath(
      this.projectRoot,
      filePath,
      isDirectory,
    );
    // Root directory is never ignored by gitignore
    if (
      normalizedPath === null ||
      normalizedPath === '' ||
      normalizedPath === '/'
    ) {
      return false;
    }

    try {
      const ig = ignore().add('.git'); // Always ignore .git

      // Load global patterns from .git/info/exclude
      if (this.globalPatterns === undefined) {
        const excludeFile = path.join(
          this.projectRoot,
          '.git',
          'info',
          'exclude',
        );
        this.globalPatterns = fs.existsSync(excludeFile)
          ? this.loadPatternsForFile(excludeFile)
          : ignore();
      }
      ig.add(this.globalPatterns);

      // Git checks directories hierarchically. If a parent directory is ignored,
      // its children are ignored automatically, and we can stop processing.
      const pathParts = normalizedPath.split('/');
      let currentAbsDir = this.projectRoot;
      const dirsToVisit = [this.projectRoot];

      for (let i = 0; i < pathParts.length - 1; i++) {
        currentAbsDir = path.join(currentAbsDir, pathParts[i]);
        dirsToVisit.push(currentAbsDir);
      }

      for (const dir of dirsToVisit) {
        const relativeDir = path.relative(this.projectRoot, dir);
        if (relativeDir) {
          // Check if this parent directory is already ignored by patterns found so far
          const parentDirRelative = getNormalizedRelativePath(
            this.projectRoot,
            dir,
            true,
          );
          const currentIg = ignore().add(ig).add(this.processedExtraPatterns);
          if (parentDirRelative && currentIg.ignores(parentDirRelative)) {
            // Optimization: Stop once an ancestor is ignored
            break;
          }
        }

        // Load and add patterns from .gitignore in the current directory
        let patterns = this.cache.get(dir);
        if (patterns === undefined) {
          const gitignorePath = path.join(dir, '.gitignore');
          patterns = fs.existsSync(gitignorePath)
            ? this.loadPatternsForFile(gitignorePath)
            : ignore();
          this.cache.set(dir, patterns);
        }
        ig.add(patterns);
      }

      // Extra patterns (like .geminiignore) have final precedence
      return ig.add(this.processedExtraPatterns).ignores(normalizedPath);
    } catch {
      return false;
    }
  }
}
