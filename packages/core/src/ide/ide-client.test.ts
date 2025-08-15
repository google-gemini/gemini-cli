/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { IdeClient } from './ide-client.js';

describe('IdeClient.validateWorkspacePath', () => {
  it('should return valid if cwd is a subpath of the IDE workspace path', () => {
    const result = IdeClient.validateWorkspacePath(
      '/Users/person/gemini-cli',
      'VS Code',
      '/Users/person/gemini-cli/sub-dir',
    );
    expect(result.isValid).toBe(true);
  });

  it('should return invalid if GEMINI_CLI_IDE_WORKSPACE_PATH is undefined', () => {
    const result = IdeClient.validateWorkspacePath(
      undefined,
      'VS Code',
      '/Users/person/gemini-cli/sub-dir',
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Failed to connect');
  });

  it('should return invalid if GEMINI_CLI_IDE_WORKSPACE_PATH is empty', () => {
    const result = IdeClient.validateWorkspacePath(
      '',
      'VS Code',
      '/Users/person/gemini-cli/sub-dir',
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('please open a workspace folder');
  });

  it('should return invalid if cwd is not within the IDE workspace path', () => {
    const result = IdeClient.validateWorkspacePath(
      '/some/other/path',
      'VS Code',
      '/Users/person/gemini-cli/sub-dir',
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Directory mismatch');
  });

  it('should handle multiple workspace paths and return valid', () => {
    const result = IdeClient.validateWorkspacePath(
      ['/some/other/path', '/Users/person/gemini-cli'].join(path.delimiter),
      'VS Code',
      '/Users/person/gemini-cli/sub-dir',
    );
    expect(result.isValid).toBe(true);
  });

  it('should return invalid if cwd is not in any of the multiple workspace paths', () => {
    const result = IdeClient.validateWorkspacePath(
      ['/some/other/path', '/another/path'].join(path.delimiter),
      'VS Code',
      '/Users/person/gemini-cli/sub-dir',
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Directory mismatch');
  });

  it.skipIf(process.platform !== 'win32')('should handle windows paths', () => {
    const result = IdeClient.validateWorkspacePath(
      'c:/some/other/path;d:/Users/person/gemini-cli',
      'VS Code',
      'd:/Users/person/gemini-cli/sub-dir',
    );
    expect(result.isValid).toBe(true);
  });
});
