/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishOrTag } from '../publish-or-tag';

vi.mock('node:child_process');

describe('publish-or-tag', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should update the tag if the version already exists', () => {
    const versions = ['1.0.0', '1.0.1'];
    vi.mocked(execSync).mockReturnValue(JSON.stringify(versions));

    publishOrTag('@google/gemini-cli', '1.0.1', 'latest', false);

    expect(execSync).toHaveBeenCalledWith(
      'npm view @google/gemini-cli versions --json',
    );
    expect(execSync).toHaveBeenCalledWith(
      'npm dist-tag add @google/gemini-cli@1.0.1 latest',
    );
    expect(execSync).not.toHaveBeenCalledWith(
      expect.stringContaining('npm publish'),
    );
  });

  it('should publish the package if the version does not exist', () => {
    const versions = ['1.0.0'];
    vi.mocked(execSync).mockReturnValue(JSON.stringify(versions));

    publishOrTag('@google/gemini-cli', '1.0.1', 'latest', false);

    expect(execSync).toHaveBeenCalledWith(
      'npm view @google/gemini-cli versions --json',
    );
    expect(execSync).toHaveBeenCalledWith(
      'npm publish --workspace=@google/gemini-cli --tag=latest ',
    );
    expect(execSync).not.toHaveBeenCalledWith(
      expect.stringContaining('npm dist-tag add'),
    );
  });

  it('should handle race conditions where another process publishes the version', () => {
    const initialVersions = ['1.0.0'];
    const finalVersions = ['1.0.0', '1.0.1'];
    vi.mocked(execSync)
      .mockReturnValueOnce(JSON.stringify(initialVersions)) // First call to npm view
      .mockImplementationOnce(() => {
        throw new Error('npm publish failed');
      })
      .mockReturnValueOnce(JSON.stringify(finalVersions)); // Second call to npm view

    publishOrTag('@google/gemini-cli', '1.0.1', 'latest', false);

    expect(execSync).toHaveBeenCalledWith(
      'npm view @google/gemini-cli versions --json',
    );
    expect(execSync).toHaveBeenCalledWith(
      'npm publish --workspace=@google/gemini-cli --tag=latest ',
    );
    expect(execSync).toHaveBeenCalledWith(
      'npm dist-tag add @google/gemini-cli@1.0.1 latest',
    );
  });

  it('should exit with an error if required arguments are missing', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const processExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    expect(() => {
      publishOrTag('@google/gemini-cli', '1.0.1', '', false);
    }).toThrow('process.exit');

    expect(consoleError).toHaveBeenCalledWith(
      'Usage: node scripts/publish-or-tag.js <package-name> <version> <tag> [--dry-run]',
    );
    expect(processExit).toHaveBeenCalledWith(1);
  });
});
