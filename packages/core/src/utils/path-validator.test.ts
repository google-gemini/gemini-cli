/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { validatePath } from './path-validator.js';

describe('PathValidator', () => {
  it('should validate normal paths', () => {
    expect(validatePath('src/index.ts').isValid).toBe(true);
    expect(validatePath('/usr/local/bin').isValid).toBe(true);
    expect(validatePath('C:\\Users\\name\\Documents').isValid).toBe(true);
    expect(validatePath('relative/path/to/file.js').isValid).toBe(true);
  });

  it('should reject empty or non-string paths', () => {
    expect(validatePath('').isValid).toBe(false);
    expect(validatePath(null as unknown as string).isValid).toBe(false);
  });

  it('should reject paths with newlines or control characters', () => {
    expect(validatePath('path/with\nnewline').isValid).toBe(false);
    expect(validatePath('path/with\rreturn').isValid).toBe(false);
    expect(validatePath('path/with\0null').isValid).toBe(false);
    expect(validatePath('path/with\ttab').isValid).toBe(false);
  });

  it('should reject excessively long paths', () => {
    const longPath = 'a'.repeat(4097);
    const result = validatePath(longPath);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Path is too long');
  });

  it('should reject paths with excessively long components', () => {
    const longComponent = 'a'.repeat(256);
    const result = validatePath(`path/to/${longComponent}/file`);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(
      'component "aaaaaaaaaaaaaaaaaaaa..." is too long',
    );
  });

  it('should reject misinterpreted log fragments with quotes or ellipses', () => {
    const logFragment =
      'Error: No "formatTimeRange" export is defined on the lib/formatTimeRange mock.';
    const result = validatePath(logFragment);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('suspicious characters');
  });

  it('should reject code snippets with braces/parens', () => {
    const codeSnippet =
      'vi.mock(import("@/lib/formatTimeRange"), async (importOriginal) => { return { ...actual }; })';
    const result = validatePath(codeSnippet);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(
      'misinterpreted log fragment or code snippet',
    );
  });

  it('should reject misinterpreted log fragments with log markers', () => {
    expect(validatePath('FAIL tests/int/my.test.ts').isValid).toBe(false);
    expect(
      validatePath('AssertionError: expected true to be false').isValid,
    ).toBe(false);
    expect(validatePath('✓ test passed').isValid).toBe(false);
    expect(validatePath('× test failed').isValid).toBe(false);
  });

  it('should allow short paths with quotes (even if unusual)', () => {
    // Some systems might technically allow this, and we only want to block long/obvious log fragments
    expect(validatePath('file"with"quote.txt').isValid).toBe(true);
  });
});
