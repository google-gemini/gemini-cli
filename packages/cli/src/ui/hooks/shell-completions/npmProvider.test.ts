/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { npmProvider } from './npmProvider.js';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('npmProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suggests npm subcommands for cursorIndex 1', async () => {
    const result = await npmProvider.getCompletions(['npm', 'ru'], 1, '/tmp');

    expect(result.exclusive).toBe(true);
    expect(result.suggestions).toEqual([
      expect.objectContaining({ value: 'run' }),
    ]);
  });

  it('suggests package.json scripts for npm run at cursorIndex 2', async () => {
    const mockPackageJson = {
      scripts: {
        start: 'node index.js',
        build: 'tsc',
        'build:dev': 'tsc --watch',
      },
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockPackageJson));

    const result = await npmProvider.getCompletions(
      ['npm', 'run', 'bu'],
      2,
      '/tmp',
    );

    expect(result.exclusive).toBe(true);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].value).toBe('build');
    expect(result.suggestions[1].value).toBe('build:dev');
    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      'utf8',
    );
  });

  it('handles missing package.json gracefully', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const result = await npmProvider.getCompletions(
      ['npm', 'run', ''],
      2,
      '/tmp',
    );

    expect(result.exclusive).toBe(true);
    expect(result.suggestions).toHaveLength(0);
  });

  it('returns non-exclusive for unrecognized position', async () => {
    const result = await npmProvider.getCompletions(
      ['npm', 'install', 'react'],
      2,
      '/tmp',
    );

    expect(result.exclusive).toBe(false);
    expect(result.suggestions).toHaveLength(0);
  });
});
