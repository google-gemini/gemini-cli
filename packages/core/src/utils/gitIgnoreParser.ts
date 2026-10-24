/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ignorePkg, { type Ignore } from 'ignore';
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const ignore = ((ignorePkg as unknown as { default?: () => Ignore }).default ??
  ignorePkg) as () => Ignore;
import {
  getNormalizedRelativePath,
  expandWildcardDirectoryPatterns,
} from './ignorePathUtils.js';

export interface GitIgnoreFilter {
  isIgnored(filePath: string, isDirectory: boolean): boolean;
  clearCache?(): void;
}

interface DirIgnoreState {
  isIgnored: boolean;
  ig: Ignore;
  combinedIg: Ignore;
}

export class GitIgnoreParser implements GitIgnoreFilter {
  private projectRoot: string;
  private dirStateCache: Map<string, DirIgnoreState> = new Map();
  private gitignoreFileCache: Map<string, string[]> = new Map();
  private globalPatterns: string[] | undefined;
  private processedExtraPatterns: Ignore;
  private hasExtraPatterns: boolean;

  constructor(
    projectRoot: string,
    private readonly extraPatterns?: string[],
  ) {
    this.projectRoot = path.resolve(projectRoot);
    this.hasExtraPatterns = Boolean(
      this.extraPatterns && this.extraPatterns.length > 0,
    );
    this.processedExtraPatterns = ignore();
    if (this.extraPatterns) {
      // extraPatterns are assumed to be from project root (like .geminiignore)
      this.processedExtraPatterns.add(
        this.processPatterns(this.extraPatterns, '.'),
      );
    }
  }

  clearCache(): void {
    this.dirStateCache.clear();
    this.gitignoreFileCache.clear();
    this.globalPatterns = undefined;
  }

  private loadPatternsForFile(patternsFilePath: string): string[] {
    let content: string;
    try {
      content = fs.readFileSync(patternsFilePath, 'utf-8');
    } catch {
      return [];
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

    const rawPatterns = content.split(/\r\n|\n|\r/);
    return this.processPatterns(rawPatterns, relativeBaseDir);
  }

  private processPatterns(
    rawPatterns: string[],
    relativeBaseDir: string,
  ): string[] {
    const expandedPatterns = expandWildcardDirectoryPatterns(
      rawPatterns,
      this.extraPatterns,
    );
    return expandedPatterns
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

  private getPatternsForDir(dir: string): string[] {
    let patterns = this.gitignoreFileCache.get(dir);
    if (patterns === undefined) {
      const gitignorePath = path.join(dir, '.gitignore');
      patterns = this.loadPatternsForFile(gitignorePath);
      this.gitignoreFileCache.set(dir, patterns);
    }
    return patterns;
  }

  private getGlobalPatterns(): string[] {
    if (this.globalPatterns === undefined) {
      const excludeFile = path.join(
        this.projectRoot,
        '.git',
        'info',
        'exclude',
      );
      this.globalPatterns = this.loadPatternsForFile(excludeFile);
    }
    return this.globalPatterns;
  }

  private createCombinedIgnore(ig: Ignore): Ignore {
    return this.hasExtraPatterns
      ? ignore().add(ig).add(this.processedExtraPatterns)
      : ig;
  }

  private computeRelDirState(relDir: string): DirIgnoreState {
    if (relDir === '') {
      const ig = ignore().add('.git'); // Always ignore .git
      const globals = this.getGlobalPatterns();
      if (globals.length > 0) {
        ig.add(globals);
      }
      const rootPatterns = this.getPatternsForDir(this.projectRoot);
      if (rootPatterns.length > 0) {
        ig.add(rootPatterns);
      }
      return {
        isIgnored: false,
        ig,
        combinedIg: this.createCombinedIgnore(ig),
      };
    }

    const lastSlash = relDir.lastIndexOf('/');
    const parentRelDir = lastSlash === -1 ? '' : relDir.slice(0, lastSlash);
    const parentState = this.getRelDirState(parentRelDir);

    if (parentState.isIgnored || parentState.combinedIg.ignores(`${relDir}/`)) {
      return {
        isIgnored: true,
        ig: parentState.ig,
        combinedIg: parentState.combinedIg,
      };
    }

    const absDir = path.join(this.projectRoot, relDir);
    const dirPatterns = this.getPatternsForDir(absDir);
    if (dirPatterns.length === 0) {
      // Re-use parent's Ignore instance directly to avoid unnecessary allocations
      return {
        isIgnored: false,
        ig: parentState.ig,
        combinedIg: parentState.combinedIg,
      };
    }

    const ig = ignore().add(parentState.ig).add(dirPatterns);
    return {
      isIgnored: false,
      ig,
      combinedIg: this.createCombinedIgnore(ig),
    };
  }

  private getRelDirState(relDir: string): DirIgnoreState {
    let state = this.dirStateCache.get(relDir);
    if (state === undefined) {
      state = this.computeRelDirState(relDir);
      this.dirStateCache.set(relDir, state);
    }
    return state;
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
      let relDir: string;
      if (isDirectory) {
        relDir = normalizedPath.endsWith('/')
          ? normalizedPath.slice(0, -1)
          : normalizedPath;
      } else {
        const lastSlash = normalizedPath.lastIndexOf('/');
        relDir = lastSlash === -1 ? '' : normalizedPath.slice(0, lastSlash);
      }

      const dirState = this.getRelDirState(relDir);
      if (dirState.isIgnored) {
        return true;
      }

      if (isDirectory) {
        return false;
      }

      return dirState.combinedIg.ignores(normalizedPath);
    } catch {
      return false;
    }
  }
}
