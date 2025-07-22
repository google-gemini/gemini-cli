/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { test, expect } from 'vitest';
import { MemoryCache } from './memory-cache.js';

test('MemoryCache basic usage', async () => {
  const files = [
    'foo.txt',
    'bar.js',
    'baz.md',
    'subdir/file.txt',
    'subdir/other.js',
    'subdir/nested/file.md',
  ];
  const cache = new MemoryCache(files, path.resolve('.'));
  const result = await cache.get('*.js', undefined);
  expect(result).toEqual(['bar.js', 'subdir/other.js']);
});

test('MemoryCache cache hit/miss', async () => {
  const files = ['foo.txt', 'bar.js', 'baz.md'];
  const cache = new MemoryCache(files, path.resolve('.'));
  // First call: miss
  const result1 = await cache.get('*.js', undefined);
  expect(result1).toEqual(['bar.js']);
  // Second call: hit
  const result2 = await cache.get('*.js', undefined);
  expect(result2).toEqual(['bar.js']);
});
