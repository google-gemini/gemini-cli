/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolvePath } from './resolvePath.js';

vi.mock('node:os', () => ({
  homedir: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', () => ({
  homedir: () => os.homedir(),
}));

describe('resolvePath', () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue('/home/user');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('expands a tilde followed by a Windows path separator', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    expect(resolvePath('~\\policies\\custom.toml')).toBe(
      path.normalize('/home/user\\policies\\custom.toml'),
    );
  });

  it('preserves a literal backslash after a tilde on POSIX', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    expect(resolvePath('~\\policies\\custom.toml')).toBe(
      path.normalize('~\\policies\\custom.toml'),
    );
  });

  it.each([
    ['', ''],
    ['/foo/bar', path.normalize('/foo/bar')],
    ['~/foo', path.join('/home/user', 'foo')],
    ['~', path.normalize('/home/user')],
    ['%userprofile%/foo', path.join('/home/user', 'foo')],
    ['%USERPROFILE%/foo', path.join('/home/user', 'foo')],
  ])('resolvePath(%s) should return %s', (input, expected) => {
    expect(resolvePath(input)).toBe(expected);
  });

  it('should handle path normalization', () => {
    expect(resolvePath('/foo//bar/../baz')).toBe(path.normalize('/foo/baz'));
  });
});
