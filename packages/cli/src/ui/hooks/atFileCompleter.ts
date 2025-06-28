/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  escapePath,
  performFileSearch,
  SearchType,
  TimeUnit,
} from '@google/gemini-cli-core';
import { Suggestion } from '../components/SuggestionsDisplay.js';
import * as path from 'path';

async function search(
  pattern: string,
  cwd: string,
  type: SearchType,
  changed_within?: { value: number; unit: TimeUnit },
): Promise<string[]> {
  const { entries } = await performFileSearch({
    pattern,
    rootDirectory: cwd,
    max_results: 50,
    search_type: type,
    changed_within,
  });
  return entries;
}

function mapResults(
  files: string[],
  dirs: string[],
  cwd: string,
): Suggestion[] {
  return [
    ...dirs.map((dir) => {
      const relativePath = path.relative(cwd, dir);
      return {
        label: relativePath + path.sep,
        value: escapePath(relativePath + path.sep),
      };
    }),
    ...files.map((file) => {
      const relativePath = path.relative(cwd, file);
      return {
        label: relativePath,
        value: escapePath(relativePath),
      };
    }),
  ];
}

export async function getAtFileSuggestions(
  pattern: string,
  cwd: string,
): Promise<Suggestion[]> {
  if (pattern === '') {
    const timePeriods: Array<{ value: number; unit: TimeUnit }> = [
      { value: 1, unit: TimeUnit.DAY },
      { value: 1, unit: TimeUnit.WEEK },
      { value: 1, unit: TimeUnit.MONTH },
      { value: 1, unit: TimeUnit.YEAR },
    ];
    for (const period of timePeriods) {
      const files = await search('', cwd, SearchType.FILE, period);
      if (files.length > 0) {
        return mapResults(files, [], cwd);
      }
    }
    return [];
  }

  const dirSearchPromises: Array<Promise<string[]>> = [];

  if (pattern.endsWith(path.sep)) {
    // For a path ending in '/', we want the exact directory match to appear first.
    dirSearchPromises.push(
      search(pattern.slice(0, -1) + '$', cwd, SearchType.DIRECTORY),
    );
  }

  // Always search for directories matching the pattern.
  // If it ends with '/', this will find subdirectories.
  // If it doesn't, it finds matching directories.
  dirSearchPromises.push(search(pattern, cwd, SearchType.DIRECTORY));

  const fileSearchPromise = search(pattern, cwd, SearchType.FILE);

  const [files, ...dirResults] = await Promise.all([
    fileSearchPromise,
    ...dirSearchPromises,
  ]);

  // Flatten the array of directory search results into a single list.
  const combinedDirs = dirResults.flat();

  return mapResults(files, combinedDirs, cwd);
}
