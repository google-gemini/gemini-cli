/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

const { removeNpmDistTag } = await import('../remove-npm-dist-tag.js');

describe('removeNpmDistTag', () => {
  beforeEach(() => {
    vi.spyOn(Atomics, 'wait').mockImplementation(() => 'ok');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('removes the dist-tag on the first attempt', () => {
    execFileSync.mockReturnValue('');

    removeNpmDistTag({
      packageName: '@google/gemini-cli-core',
      tag: 'staging-tmp',
    });

    expect(execFileSync).toHaveBeenCalledWith(
      'npm',
      ['dist-tag', 'rm', '@google/gemini-cli-core', 'staging-tmp'],
      expect.objectContaining({ encoding: 'utf8' }),
    );
    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(Atomics.wait).not.toHaveBeenCalled();
  });

  it('retries when the registry has not propagated the dist-tag yet', () => {
    const notReady = Object.assign(new Error('Command failed'), {
      stderr:
        'npm error staging-tmp is not a dist-tag on @google/gemini-cli-core',
      stdout: '',
    });

    execFileSync
      .mockImplementationOnce(() => {
        throw notReady;
      })
      .mockImplementationOnce(() => ''); // successful rm

    removeNpmDistTag({
      packageName: '@google/gemini-cli-core',
      tag: 'staging-tmp',
      maxAttempts: 3,
      retryDelayMs: 1000,
    });

    expect(execFileSync).toHaveBeenNthCalledWith(
      1,
      'npm',
      ['dist-tag', 'rm', '@google/gemini-cli-core', 'staging-tmp'],
      expect.any(Object),
    );
    expect(Atomics.wait).toHaveBeenCalledWith(
      expect.any(Int32Array),
      0,
      0,
      1000,
    );
    expect(execFileSync).toHaveBeenNthCalledWith(
      2,
      'npm',
      ['dist-tag', 'rm', '@google/gemini-cli-core', 'staging-tmp'],
      expect.any(Object),
    );
  });

  it('does not retry on unexpected npm errors', () => {
    const authError = Object.assign(new Error('Command failed'), {
      stderr: 'npm error code ENEEDAUTH',
      stdout: '',
    });
    execFileSync.mockImplementation(() => {
      throw authError;
    });

    expect(() =>
      removeNpmDistTag({
        packageName: '@google/gemini-cli-core',
        tag: 'staging-tmp',
        maxAttempts: 3,
        retryDelayMs: 1000,
      }),
    ).toThrow(authError);

    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(Atomics.wait).not.toHaveBeenCalled();
  });

  it('throws after exhausting retries for missing dist-tags', () => {
    const notReady = Object.assign(new Error('Command failed'), {
      stderr:
        'npm error staging-tmp is not a dist-tag on @google/gemini-cli-core',
      stdout: '',
    });
    execFileSync.mockImplementation(() => {
      throw notReady;
    });

    expect(() =>
      removeNpmDistTag({
        packageName: '@google/gemini-cli-core',
        tag: 'staging-tmp',
        maxAttempts: 2,
        retryDelayMs: 1000,
      }),
    ).toThrow(/Failed to remove dist-tag "staging-tmp"/);

    expect(execFileSync).toHaveBeenCalledTimes(2);
    expect(Atomics.wait).toHaveBeenCalledTimes(1);
  });
});
