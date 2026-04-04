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

  it('should detect npm specific file system denials', () => {
    const output = `
npm verbose logfile could not be created: Error: EPERM: operation not permitted, open '/Users/galzahavi/.npm/_logs/2026-04-01T02_47_18_624Z-debug-0.log'
    `;
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.filePaths).toContain(
      '/Users/galzahavi/.npm/_logs/2026-04-01T02_47_18_624Z-debug-0.log',
    );
  });

  it('should detect npm specific path errors', () => {
    const output = `
npm error code EPERM
npm error syscall open
npm error path /Users/galzahavi/.npm/_cacache/tmp/ccf579a2
    `;
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.filePaths).toContain(
      '/Users/galzahavi/.npm/_cacache/tmp/ccf579a2',
    );
  });

  it('should detect network denials with ENOTFOUND', () => {
    const output = `
npm http fetch GET https://registry.npmjs.org/2 attempt 1 failed with ENOTFOUND
    `;
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.network).toBe(true);
  });

  it('should detect non-verbose npm path errors', () => {
    const output = `
npm ERR! code EPERM
npm ERR! syscall open
npm ERR! path /Users/galzahavi/.npm/_cacache/tmp/ccf579a2
    `;
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.filePaths).toContain(
      '/Users/galzahavi/.npm/_cacache/tmp/ccf579a2',
    );
  });

  it('should detect pnpm specific network errors', () => {
    const output = `
ERR_PNPM_FETCH_404 GET https://registry.npmjs.org/nonexistent: Not Found
    `;
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.network).toBe(true);
  });

  it('should detect pnpm specific file system errors', () => {
    const output = `
EACCES: permission denied, mkdir '/Users/galzahavi/.pnpm-store/v3'
    `;
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.filePaths).toContain('/Users/galzahavi/.pnpm-store/v3');
  });
});
