/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parsePosixSandboxDenials } from './sandboxDenialUtils.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';

describe('parsePosixSandboxDenials', () => {
  it('should detect file system denial and extract paths', () => {
    const parsed = parsePosixSandboxDenials({
      output: 'ls: /root: Operation not permitted',
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.filePaths).toContain('/root');
  });

  it('should detect network denial', () => {
    const parsed = parsePosixSandboxDenials({
      output: 'curl: (6) Could not resolve host: google.com',
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.network).toBe(true);
  });

  it('should use fallback heuristic for absolute paths', () => {
    const parsed = parsePosixSandboxDenials({
      output:
        'operation not permitted\nsome error happened with /some/path/to/file',
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.filePaths).toContain('/some/path/to/file');
  });

  it('should return undefined if no denial detected', () => {
    const parsed = parsePosixSandboxDenials({
      output: 'hello world',
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeUndefined();
  });
});
