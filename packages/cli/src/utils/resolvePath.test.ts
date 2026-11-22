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

  describe('on Windows', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      vi.mocked(os.homedir).mockReturnValue('C:\\Users\\user');
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it.each([
      ['~\\policies\\custom.toml', 'C:\\Users\\user\\policies\\custom.toml'],
      ['~\\', 'C:\\Users\\user\\'],
      ['~', 'C:\\Users\\user'],
      ['~/nested/dir/file.txt', 'C:\\Users\\user\\nested\\dir\\file.txt'],
      ['~\\foo\\..\\bar', 'C:\\Users\\user\\bar'],
      ['%USERPROFILE%\\custom\\path', 'C:\\Users\\user\\custom\\path'],
      ['%userprofile%/custom/path', 'C:\\Users\\user\\custom\\path'],
      ['~foo', '~foo'],
      ['relative\\path', 'relative\\path'],
    ])('on Windows, resolvePath(%s) should return %s', (input, expected) => {
      expect(resolvePath(input)).toBe(expected);
    });
  });

  describe('on POSIX', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      vi.mocked(os.homedir).mockReturnValue('/home/user');
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it.each([
      ['~\\policies\\custom.toml', '~\\policies\\custom.toml'],
      ['~\\foo', '~\\foo'],
      ['~/foo', '/home/user/foo'],
      ['~', '/home/user'],
      ['~foo', '~foo'],
      ['%userprofile%/foo', '/home/user/foo'],
      ['/foo/bar', '/foo/bar'],
    ])('on POSIX, resolvePath(%s) should return %s', (input, expected) => {
      expect(resolvePath(input)).toBe(expected);
    });
  });
});
