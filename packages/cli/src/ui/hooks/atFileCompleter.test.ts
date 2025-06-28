/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { getAtFileSuggestions } from './atFileCompleter.js';
import { escapePath } from '@google/gemini-cli-core';

describe('getAtFileSuggestions with real file system', () => {
  let tempRootDir: string;

  beforeEach(async () => {
    // Create a temporary directory structure for testing
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atFileCompleter-'));
    await fs.mkdir(path.join(tempRootDir, 'src'));
    await fs.writeFile(path.join(tempRootDir, 'src', 'index.ts'), 'content');
    await fs.writeFile(path.join(tempRootDir, 'src', 'app.ts'), 'content');
    await fs.mkdir(path.join(tempRootDir, 'src', 'components'));
    await fs.writeFile(
      path.join(tempRootDir, 'src', 'components', 'button.ts'),
      'content',
    );
    await fs.writeFile(path.join(tempRootDir, 'README.md'), 'content');
  });

  afterEach(async () => {
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  it('should return files and directories for a simple pattern', async () => {
    const suggestions = await getAtFileSuggestions('src', tempRootDir);
    const expected = [
      {
        label: `src${path.sep}`,
        value: escapePath(`src${path.sep}`),
      },
    ].sort((a, b) => a.label.localeCompare(b.label));

    const sortedSuggestions = suggestions.sort((a, b) =>
      a.label.localeCompare(b.label),
    );

    expect(sortedSuggestions).toEqual(expected);
  });

  it('should return contents of a directory when pattern ends with a separator', async () => {
    const suggestions = await getAtFileSuggestions(
      `src${path.sep}`,
      tempRootDir,
    );
    const expected = [
      {
        label: `src${path.sep}`,
        value: escapePath(`src${path.sep}`),
      },
      {
        label: path.join('src', 'app.ts'),
        value: escapePath(path.join('src', 'app.ts')),
      },
      {
        label: path.join('src', 'index.ts'),
        value: escapePath(path.join('src', 'index.ts')),
      },
      {
        label: path.join('src', 'components') + path.sep,
        value: escapePath(path.join('src', 'components') + path.sep),
      },
      {
        label: path.join('src', 'components', 'button.ts'),
        value: escapePath(path.join('src', 'components', 'button.ts')),
      },
    ].sort((a, b) => a.label.localeCompare(b.label));

    const sortedSuggestions = suggestions.sort((a, b) =>
      a.label.localeCompare(b.label),
    );

    expect(sortedSuggestions).toEqual(expected);
  });

  it('should return no suggestions for a pattern that does not match', async () => {
    const suggestions = await getAtFileSuggestions('nonexistent', tempRootDir);
    expect(suggestions).toEqual([]);
  });

  it('should return recently modified files when pattern is empty', async () => {
    // All files are recent, so it should return all of them.
    const suggestions = await getAtFileSuggestions('', tempRootDir);
    // There are 4 files in the temp directory
    expect(suggestions.length).toBe(4);
  });

  it('should trigger fuzzy search for patterns with separators', async () => {
    const suggestions = await getAtFileSuggestions('s/c/b', tempRootDir);
    const expected = [
      {
        label: path.join('src', 'components', 'button.ts'),
        value: escapePath(path.join('src', 'components', 'button.ts')),
      },
    ];
    expect(suggestions).toEqual(expected);
  });
});
