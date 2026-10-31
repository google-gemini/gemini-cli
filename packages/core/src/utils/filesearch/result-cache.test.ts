/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from 'vitest';
import { ResultCache } from './result-cache.js';

test('ResultCache basic usage', async () => {
  const files = [
    'foo.txt',
    'bar.js',
    'baz.md',
    'subdir/file.txt',
    'subdir/other.js',
    'subdir/nested/file.md',
  ];
  const cache = new ResultCache(files);
  const { files: resultFiles, isExactMatch } = await cache.get('*.js');
  expect(resultFiles).toEqual(files);
  expect(isExactMatch).toBe(false);
});

test('ResultCache cache hit/miss', async () => {
  const files = ['foo.txt', 'bar.js', 'baz.md'];
  const cache = new ResultCache(files);
  // First call: miss
  const { files: result1Files, isExactMatch: isExactMatch1 } =
    await cache.get('*.js');
  expect(result1Files).toEqual(files);
  expect(isExactMatch1).toBe(false);

  // Simulate FileSearch applying the filter and setting the result
  cache.set('*.js', ['bar.js']);

  // Second call: hit
  const { files: result2Files, isExactMatch: isExactMatch2 } =
    await cache.get('*.js');
  expect(result2Files).toEqual(['bar.js']);
  expect(isExactMatch2).toBe(true);
});

test('ResultCache returns all candidates for a different query with a cached prefix', async () => {
  const files = ['SrcUpper.ts', 'srcutils.ts'];
  const cache = new ResultCache(files);

  // Sharing a prefix does not guarantee matching semantics are compatible.
  cache.set('Src', ['SrcUpper.ts']);

  // A different query must be able to match files excluded by the cached query.
  const { files: resultFiles, isExactMatch } = await cache.get('Src*');
  expect(resultFiles).toEqual(files);
  expect(isExactMatch).toBe(false);
});
