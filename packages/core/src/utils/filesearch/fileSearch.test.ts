/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from 'vitest';
import { filter } from './fileSearch.js';

test('filter: glob pattern', async () => {
  const files = [
    'foo.txt',
    'bar.js',
    'baz.md',
    'subdir/file.txt',
    'subdir/other.js',
    'subdir/nested/file.md',
  ];
  const result = await filter(files, '*.js', undefined);
  expect(result).toEqual(['bar.js', 'subdir/other.js']);
});

test('filter: regex pattern', async () => {
  const files = [
    'foo.txt',
    'bar.js',
    'baz.md',
    'subdir/file.txt',
    'subdir/other.js',
    'subdir/nested/file.md',
  ];
  const result = await filter(files, '\\.(md|txt)$', undefined);
  expect(result).toEqual([
    'baz.md',
    'foo.txt',
    'subdir/file.txt',
    'subdir/nested/file.md',
  ]);
});
