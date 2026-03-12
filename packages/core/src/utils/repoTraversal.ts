/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { GitIgnoreParser } from './gitIgnoreParser.js';
import { DEFAULT_FILE_EXCLUDES } from './ignorePatterns.js';

export interface RepoTreeNode {
  name: string;
  isDirectory: boolean;
  children?: RepoTreeNode[];
}

export interface RepoTraversalOptions {
  projectRoot: string;
  subPath?: string;
  extraPatterns?: string[];
}

/**
 * Builds a hierarchical tree of the repository, honoring .gitignore
 * rules and default exclusion patterns.
 */
export async function buildRepoTree(
  options: RepoTraversalOptions,
): Promise<RepoTreeNode> {
  const { projectRoot, subPath = '', extraPatterns = [] } = options;
  const parser = new GitIgnoreParser(projectRoot, [
    ...DEFAULT_FILE_EXCLUDES,
    ...extraPatterns,
  ]);

  const rootAbsPath = path.resolve(projectRoot, subPath);

  const normalizePath = (p: string) => p.replace(/\\/g, '/');

  async function traverse(currentPath: string): Promise<RepoTreeNode | null> {
    const relPath = path.relative(projectRoot, currentPath);
    const normalizedRelPath = normalizePath(relPath);

    // Check if the file is ignored directly.
    // To correctly evaluate directory exclusions (like `**/node_modules/**`),
    // we also check a dummy file path inside the directory.
    const isIgnoredDirectly = parser.isIgnored(normalizedRelPath);
    const isDirectoryIgnored = parser.isIgnored(
      path.posix.join(normalizedRelPath, '.gemini-dummy'),
    );

    if (normalizedRelPath !== '' && (isIgnoredDirectly || isDirectoryIgnored)) {
      return null;
    }

    try {
      const stats = await fs.stat(currentPath);
      const node: RepoTreeNode = {
        name: path.basename(currentPath) || path.basename(projectRoot),
        isDirectory: stats.isDirectory(),
      };

      if (stats.isDirectory()) {
        node.children = [];
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        // Sort entries: directories first, then alphabetically
        const sortedEntries = entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) {
            return -1;
          }
          if (!a.isDirectory() && b.isDirectory()) {
            return 1;
          }
          return a.name.localeCompare(b.name);
        });

        for (const entry of sortedEntries) {
          const childPath = path.join(currentPath, entry.name);
          const childNode = await traverse(childPath);
          if (childNode) {
            node.children.push(childNode);
          }
        }
      }

      return node;
    } catch (_error) {
      // In case of permission errors or broken symlinks, just skip the element.
      return null;
    }
  }

  const result = await traverse(rootAbsPath);
  return (
    result || {
      name: path.basename(rootAbsPath),
      isDirectory: true,
      children: [],
    }
  );
}
