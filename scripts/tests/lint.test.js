/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { runYamllint } from '../lint.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}));

describe('runYamllint', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Exit ${code}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('passes tracked YAML filenames as separate arguments without a shell', () => {
    const files = [
      '.github/workflows/ci.yml',
      'config with spaces.yaml',
      '日本語.yml',
      '-strict.yml',
    ];
    vi.mocked(execFileSync).mockReturnValueOnce(files.join('\0') + '\0');

    runYamllint();

    expect(execFileSync).toHaveBeenNthCalledWith(
      1,
      'git',
      ['ls-files', '-z', '--', '*.yaml', '*.yml'],
      { encoding: 'utf8' },
    );
    expect(execFileSync).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      ['-X', 'utf8', '-m', 'yamllint', '--format', 'github', '--', ...files],
      { stdio: 'inherit' },
    );
  });

  it('does not invoke yamllint with no files and wait for stdin', () => {
    vi.mocked(execFileSync).mockReturnValueOnce('');

    runYamllint();

    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('fails when Git cannot enumerate the files', () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('Git failed');
    });

    expect(() => runYamllint()).toThrow('Exit 1');
    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      'Error running yamllint:',
      'Git failed',
    );
  });

  it('fails when yamllint reports invalid YAML', () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce('invalid.yml\0')
      .mockImplementationOnce(() => {
        throw new Error('YAML lint failed');
      });

    expect(() => runYamllint()).toThrow('Exit 1');
    expect(console.error).toHaveBeenCalledWith(
      'Error running yamllint:',
      'YAML lint failed',
    );
  });
});
