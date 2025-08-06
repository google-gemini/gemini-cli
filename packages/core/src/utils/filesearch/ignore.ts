/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import ignore from 'ignore';
import picomatch from 'picomatch';

const hasFileExtension = picomatch('**/*[*.]*');

export class Ignore {
  private readonly allPatterns: string[] = [];
  private dirIgnorer = ignore();
  private fileIgnorer = ignore();

  /**
   * Adds one or more ignore patterns.
   * @param patterns A single pattern string or an array of pattern strings.
   *                 Each pattern can be a glob-like string similar to .gitignore rules.
   * @returns The `Ignore` instance for chaining.
   */
  add(patterns: string | string[]): this {
    if (typeof patterns === 'string') {
      patterns = patterns.split(/\r?\n/);
    }

    for (const p of patterns) {
      const pattern = p.trim();

      if (pattern === '' || pattern.startsWith('#')) {
        continue;
      }

      this.allPatterns.push(pattern);

      const isPositiveDirPattern =
        pattern.endsWith('/') && !pattern.startsWith('!');

      if (isPositiveDirPattern) {
        this.dirIgnorer.add(pattern);
      } else {
        // An ambiguous pattern (e.g., "build") could match a file or a
        // directory. To optimize the file system crawl, we use a heuristic:
        // patterns without a dot in the last segment are included in the
        // directory exclusion check.
        //
        // This heuristic can fail. For example, an ignore pattern of "my.assets"
        // intended to exclude a directory will not be treated as a directory
        // pattern because it contains a ".". This results in crawling a
        // directory that should have been excluded, reducing efficiency.
        // Correctness is still maintained. The incorrectly crawled directory
        // will be filtered out by the final ignore check.
        //
        // For maximum crawl efficiency, users should explicitly mark directory
        // patterns with a trailing slash (e.g., "my.assets/").
        this.fileIgnorer.add(pattern);
        if (!hasFileExtension(pattern)) {
          this.dirIgnorer.add(pattern);
        }
      }
    }

    return this;
  }

  /**
   * Returns a predicate that matches explicit directory ignore patterns (patterns ending with '/').
   * @returns {(dirPath: string) => boolean}
   */
  getDirectoryFilter(): (dirPath: string) => boolean {
    return (dirPath: string) => this.dirIgnorer.ignores(dirPath);
  }

  /**
   * Returns a predicate that matches file ignore patterns (all patterns not ending with '/').
   * Note: This may also match directories if a file pattern matches a directory name, but all explicit directory patterns are handled by getDirectoryFilter.
   * @returns {(filePath: string) => boolean}
   */
  getFileFilter(): (filePath: string) => boolean {
    return (filePath: string) => this.fileIgnorer.ignores(filePath);
  }

  /**
   * Returns a string representing the current set of ignore patterns.
   * This can be used to generate a unique identifier for the ignore configuration,
   * useful for caching purposes.
   * @returns A string fingerprint of the ignore patterns.
   */
  getFingerprint(): string {
    return this.allPatterns.join('\n');
  }
}
