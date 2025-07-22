/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Patterns with trailing spaces (even if escaped) are not supported due to picomatch trimming patterns and input.
// This is a known limitation and rare edge case.
import picomatch from 'picomatch';

export class Ignore {
  private readonly allPositivePatterns: string[] = [];
  private readonly allNegativePatterns: string[] = [];
  private readonly dirPositivePatterns: string[] = [];
  private readonly dirNegativePatterns: string[] = [];
  private readonly filePositivePatterns: string[] = [];
  private readonly fileNegativePatterns: string[] = [];

  private matcher: picomatch.Matcher = picomatch([]);
  private dirMatcher: picomatch.Matcher = picomatch([]);
  private fileMatcher: picomatch.Matcher = picomatch([]);

  add(patterns: string | string[]): this {
    if (typeof patterns === 'string') {
      patterns = patterns.split(/\r?\n/);
    }

    for (const p of patterns) {
      let pattern = p.trim();

      if (pattern === '') {
        continue;
      }

      // Handle comments: a leading # marks a comment, unless it's escaped.
      if (pattern.startsWith('#')) {
        continue;
      }

      // Handle negation: a leading ! marks a negation, unless it's escaped.
      const isNegative = pattern.startsWith('!');
      if (isNegative) {
        pattern = pattern.slice(1);
      }

      // Handle escaped characters.
      pattern = pattern.replace(/\\#/g, '#').replace(/\\!/g, '!');

      // Handle trailing spaces: they are removed unless escaped with a backslash.
      pattern = pattern.endsWith('\\ ')
        ? pattern.replace(/\\ $/, ' ')
        : pattern.trimEnd();

      // A slash at the end marks a directory.
      let isDirPattern = false;
      if (pattern.endsWith('/')) {
        pattern += '**';
        isDirPattern = true;
      }

      if (pattern.endsWith('/**')) {
        isDirPattern = true;
      }

      // If a pattern doesn't contain a slash, it matches at any level.
      // Otherwise, it's relative to the root.
      if (!pattern.startsWith('/') && !pattern.includes('/')) {
        pattern = `**/${pattern}`;
      }

      // Remove leading slash for picomatch
      if (pattern.startsWith('/')) {
        pattern = pattern.slice(1);
      }

      // Store patterns for all, dir, and file matchers
      if (isNegative) {
        this.allNegativePatterns.push(pattern);
        if (isDirPattern) {
          this.dirNegativePatterns.push(pattern);
        } else {
          this.fileNegativePatterns.push(pattern);
        }
      } else {
        this.allPositivePatterns.push(pattern);
        if (isDirPattern) {
          this.dirPositivePatterns.push(pattern);
        } else {
          this.filePositivePatterns.push(pattern);
        }
      }
    }

    // Build matchers
    this.matcher = picomatch(this.allPositivePatterns, {
      dot: true,
      posix: true,
      ignore: this.allNegativePatterns,
    });
    this.dirMatcher = picomatch(this.dirPositivePatterns, {
      dot: true,
      posix: true,
      ignore: this.dirNegativePatterns,
    });
    this.fileMatcher = picomatch(this.filePositivePatterns, {
      dot: true,
      posix: true,
      ignore: this.fileNegativePatterns,
    });

    return this;
  }

  /**
   * @deprecated Use getDirectoryFilter or getFileFilter instead.
   */
  ignores(filePath: string): boolean {
    return this.matcher(filePath);
  }

  /**
   * Returns a predicate that matches explicit directory ignore patterns (patterns ending with '/').
   * @returns {(dirPath: string) => boolean}
   */
  getDirectoryFilter(): (dirPath: string) => boolean {
    return (dirPath: string) => this.dirMatcher(dirPath);
  }

  /**
   * Returns a predicate that matches file ignore patterns (all patterns not ending with '/').
   * Note: This may also match directories if a file pattern matches a directory name, but all explicit directory patterns are handled by getDirectoryFilter.
   * @returns {(filePath: string) => boolean}
   */
  getFileFilter(): (filePath: string) => boolean {
    return (filePath: string) => this.fileMatcher(filePath);
  }

  filter(paths: string[]): string[] {
    return paths.filter((p) => !this.ignores(p));
  }

  getFingerprint(): string {
    return [...this.allPositivePatterns, ...this.allNegativePatterns].join(
      '\n',
    );
  }
}
