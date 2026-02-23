/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gitProvider } from './gitProvider.js';
import * as childProcess from 'node:child_process';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFile: vi.fn(),
  };
});

describe('gitProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suggests git subcommands for cursorIndex 1', async () => {
    const result = await gitProvider.getCompletions(['git', 'ch'], 1, '/tmp');

    expect(result.exclusive).toBe(true);
    expect(result.suggestions).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'checkout' })]),
    );
    expect(
      result.suggestions.find((s) => s.value === 'commit'),
    ).toBeUndefined();
  });

  it('suggests branch names for checkout at cursorIndex 2', async () => {
    vi.mocked(childProcess.execFile).mockImplementation(
      (_cmd, _args, _opts, cb: unknown) => {
        const callback = (typeof _opts === 'function' ? _opts : cb) as (
          error: Error | null,
          result: { stdout: string },
        ) => void;
        callback(null, {
          stdout: 'main\nfeature-branch\nfix/bug\nbranch(with)special\n',
        });
        return {} as ReturnType<typeof childProcess.execFile>;
      },
    );

    const result = await gitProvider.getCompletions(
      ['git', 'checkout', 'feat'],
      2,
      '/tmp',
    );

    expect(result.exclusive).toBe(true);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].label).toBe('feature-branch');
    expect(result.suggestions[0].value).toBe('feature-branch');
    expect(childProcess.execFile).toHaveBeenCalledWith(
      'git',
      ['branch', '--format=%(refname:short)'],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('escapes branch names with shell metacharacters', async () => {
    vi.mocked(childProcess.execFile).mockImplementation(
      (_cmd, _args, _opts, cb: unknown) => {
        const callback = (typeof _opts === 'function' ? _opts : cb) as (
          error: Error | null,
          result: { stdout: string },
        ) => void;
        callback(null, { stdout: 'main\nbranch(with)special\n' });
        return {} as ReturnType<typeof childProcess.execFile>;
      },
    );

    const result = await gitProvider.getCompletions(
      ['git', 'checkout', 'branch('],
      2,
      '/tmp',
    );

    expect(result.exclusive).toBe(true);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].label).toBe('branch(with)special');

    // On Windows, space escape is not done. But since UNIX_SHELL_SPECIAL_CHARS is mostly tested,
    // we can use a matcher that checks if escaping was applied (it differs per platform but that's handled by escapeShellPath).
    // Let's match the value against either unescaped (win) or escaped (unix).
    const isWin = process.platform === 'win32';
    expect(result.suggestions[0].value).toBe(
      isWin ? 'branch(with)special' : 'branch\\(with\\)special',
    );
  });

  it('returns empty results if git branch fails', async () => {
    vi.mocked(childProcess.execFile).mockImplementation(
      (_cmd, _args, _opts, cb: unknown) => {
        const callback = (typeof _opts === 'function' ? _opts : cb) as (
          error: Error,
          stdout?: string,
        ) => void;
        callback(new Error('Not a git repository'));
        return {} as ReturnType<typeof childProcess.execFile>;
      },
    );

    const result = await gitProvider.getCompletions(
      ['git', 'checkout', ''],
      2,
      '/tmp',
    );

    expect(result.exclusive).toBe(true);
    expect(result.suggestions).toHaveLength(0);
  });

  it('returns non-exclusive for unrecognized position', async () => {
    const result = await gitProvider.getCompletions(
      ['git', 'commit', '-m', 'some message'],
      3,
      '/tmp',
    );

    expect(result.exclusive).toBe(false);
    expect(result.suggestions).toHaveLength(0);
  });
});
