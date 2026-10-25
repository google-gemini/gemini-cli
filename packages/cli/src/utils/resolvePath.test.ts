/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolvePath } from './resolvePath.js';

vi.mock('node:path', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:path')>()),
}));

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

  describe.each(['win32', 'linux', 'darwin'] as const)(
    '%s paths',
    (platform) => {
      const isWindows = platform === 'win32';
      const home = isWindows ? 'C:\\Users\\Test User' : '/home/test user';
      const separator = isWindows ? '\\' : '/';
      const policyPath = `${home}${separator}policies${separator}custom.toml`;

      beforeEach(() => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
        vi.mocked(os.homedir).mockReturnValue(home);
        vi.spyOn(path, 'normalize').mockImplementation(
          (isWindows ? path.win32 : path.posix).normalize,
        );
      });

      it.each([
        ['~', home],
        ['~/policies/custom.toml', policyPath],
        ['~/policies/../custom.toml', `${home}${separator}custom.toml`],
        ['%USERPROFILE%/policies/custom.toml', policyPath],
        ['%userprofile%/policies/custom.toml', policyPath],
        ['~someone', '~someone'],
        ['~\\', isWindows ? `${home}\\` : '~\\'],
        [
          '~\\policies\\custom.toml',
          isWindows ? policyPath : '~\\policies\\custom.toml',
        ],
        [
          '~\\policies\\..\\custom.toml',
          isWindows ? `${home}\\custom.toml` : '~\\policies\\..\\custom.toml',
        ],
        [
          '~\\policies/custom.toml',
          isWindows ? policyPath : '~\\policies/custom.toml',
        ],
      ])('resolves %s to %s', (input, expected) => {
        expect(resolvePath(input)).toBe(expected);
      });
    },
  );
});
