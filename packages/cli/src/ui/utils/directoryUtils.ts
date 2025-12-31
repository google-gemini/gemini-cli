/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

const MAX_SUGGESTIONS = 50;

export function expandHomeDir(p: string): string {
  if (!p) {
    return '';
  }
  let expandedPath = p;
  if (p.toLowerCase().startsWith('%userprofile%')) {
    expandedPath = os.homedir() + p.substring('%userprofile%'.length);
  } else if (p === '~' || p.startsWith('~/')) {
    expandedPath = os.homedir() + p.substring(1);
  }
  return path.normalize(expandedPath);
}

/**
 * Gets directory suggestions based on a partial path.
 *
 * @param partialPath The partial path typed by the user.
 * @returns An array of directory path suggestions.
 */
export function getDirectorySuggestions(partialPath: string): string[] {
  try {
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
        searchDir = os.homedir();
        filter = partialPath.substring(1);
      }
    }

    if (!fs.existsSync(searchDir) || !fs.statSync(searchDir).isDirectory()) {
      return [];
    }

    const entries = fs.readdirSync(searchDir, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .filter((name) => name.toLowerCase().startsWith(filter.toLowerCase()))
      .sort()
      .slice(0, MAX_SUGGESTIONS);

    return directories.map((name) => {
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

      return resultPrefix + name + path.sep;
    });
  } catch (_) {
    return [];
  }
}
