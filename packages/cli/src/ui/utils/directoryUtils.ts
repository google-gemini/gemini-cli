/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { opendir } from 'node:fs/promises';
import { homedir } from '@google/gemini-cli-core';

const MAX_SUGGESTIONS = 50;
const MATCH_BUFFER_MULTIPLIER = 3;

export function expandHomeDir(p: string): string {
  if (!p) {
    return '';
  }
  let expandedPath = p;
  if (p.toLowerCase().startsWith('%userprofile%')) {
    expandedPath = homedir() + p.substring('%userprofile%'.length);
  } else if (p === '~' || p.startsWith('~/')) {
    expandedPath = homedir() + p.substring(1);
  }
  return path.normalize(expandedPath);
}

interface ParsedPath {
  searchDir: string;
  filter: string;
  isHomeExpansion: boolean;
  resultPrefix: string;
}

function parsePartialPath(partialPath: string): ParsedPath {
  const isHomeExpansion = partialPath.startsWith('~');
  const expandedPath = expandHomeDir(partialPath || '.');

  let searchDir: string;
  let filter: string;

  if (
    partialPath === '' ||
    partialPath.endsWith('/') ||
    partialPath.endsWith(path.sep)
  ) {
    searchDir = expandedPath;
    filter = '';
  } else {
    searchDir = path.dirname(expandedPath);
    filter = path.basename(expandedPath);

    // Special case for ~ because path.dirname('~') can be '.'
    if (
      isHomeExpansion &&
      !partialPath.includes('/') &&
      !partialPath.includes(path.sep)
    ) {
      searchDir = homedir();
      filter = partialPath.substring(1);
    }
  }

  // Calculate result prefix
  let resultPrefix = '';
  if (
    partialPath === '' ||
    partialPath.endsWith('/') ||
    partialPath.endsWith(path.sep)
  ) {
    resultPrefix = partialPath;
  } else {
    const lastSlashIndex = Math.max(
      partialPath.lastIndexOf('/'),
      partialPath.lastIndexOf(path.sep),
    );
    if (lastSlashIndex !== -1) {
      resultPrefix = partialPath.substring(0, lastSlashIndex + 1);
    } else if (isHomeExpansion) {
      resultPrefix = `~${path.sep}`;
    }
  }

  return { searchDir, filter, isHomeExpansion, resultPrefix };
}

/**
 * Gets directory suggestions based on a partial path.
 * Uses async iteration with fs.opendir for efficient handling of large directories.
 *
 * @param partialPath The partial path typed by the user.
 * @returns A promise resolving to an array of directory path suggestions.
 */
export async function getDirectorySuggestions(
  partialPath: string,
): Promise<string[]> {
  try {
    const { searchDir, filter, resultPrefix } = parsePartialPath(partialPath);

    if (!fs.existsSync(searchDir) || !fs.statSync(searchDir).isDirectory()) {
      return [];
    }

    const matches: string[] = [];
    const filterLower = filter.toLowerCase();
    const showHidden = filter.startsWith('.');
    const dir = await opendir(searchDir);

    try {
      for await (const entry of dir) {
        if (!entry.isDirectory()) {
          continue;
        }
        if (entry.name.startsWith('.') && !showHidden) {
          continue;
        }

        if (entry.name.toLowerCase().startsWith(filterLower)) {
          matches.push(entry.name);

          // Early termination with buffer for sorting
          if (matches.length >= MAX_SUGGESTIONS * MATCH_BUFFER_MULTIPLIER) {
            break;
          }
        }
      }
    } finally {
      await dir.close().catch(() => {});
    }

    // Use the separator style from user's input for consistency
    const userSep = resultPrefix.includes('/') ? '/' : path.sep;

    return matches
      .sort()
      .slice(0, MAX_SUGGESTIONS)
      .map((name) => resultPrefix + name + userSep);
  } catch (_) {
    return [];
  }
}
