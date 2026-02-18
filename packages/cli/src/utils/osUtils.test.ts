/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as os from 'node:os';
import { getUsername } from './osUtils.js';

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, userInfo: vi.fn() };
});

describe('getUsername', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    {
      source: 'os.userInfo().username',
      userInfo: 'os-user',
      user: 'ignored',
      username: 'ignored',
      expected: 'os-user',
    },
    {
      source: 'USER environment variable',
      userInfo: null,
      user: 'env-user',
      username: 'ignored',
      expected: 'env-user',
    },
    {
      source: 'USERNAME environment variable',
      userInfo: null,
      user: '',
      username: 'win-user',
      expected: 'win-user',
    },
    {
      source: 'the default "User" string',
      userInfo: null,
      user: '',
      username: '',
      expected: 'User',
    },
  ])(
    'prefers $source when available',
    ({ userInfo, user, username, expected }) => {
      if (userInfo) {
        vi.mocked(os.userInfo).mockReturnValue({
          username: userInfo,
          uid: 0,
          gid: 0,
          homedir: '',
          shell: '',
        });
      } else {
        vi.mocked(os.userInfo).mockImplementation(() => {
          throw new Error('userInfo failed');
        });
      }

      vi.stubEnv('USER', user);
      vi.stubEnv('USERNAME', username);

      expect(getUsername()).toBe(expected);
    },
  );
});
