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

  it('should allow paths with single quotes (apostrophes)', () => {
    // This was previously a false positive
    expect(validatePath("/Users/john's_files/project/index.ts").isValid).toBe(
      true,
    );
  });

  it('should allow long paths with brackets or parentheses', () => {
    // These were previously false positives (Next.js dynamic routes, Windows copies)
    expect(
      validatePath('packages/web/app/dashboard/[id]/settings/page.tsx').isValid,
    ).toBe(true);
    expect(
      validatePath('/Users/name/Documents/Project (Copy)/index.ts').isValid,
    ).toBe(true);
  });

  it('should only reject log markers at the start of a component', () => {
    // Legitimate paths containing these strings should now be allowed
    expect(validatePath('src/tests/FAIL_CASE.txt').isValid).toBe(true);
    expect(validatePath('FAILURE_LOG.txt').isValid).toBe(true);
    expect(validatePath('docs/AssertionError_details.md').isValid).toBe(true);

    // But they should be rejected if they start a component
    expect(validatePath('FAIL tests/int/my.test.ts').isValid).toBe(false);
    expect(validatePath('/project/root/FAIL tests/my.test.ts').isValid).toBe(
      false,
    );
    expect(
      validatePath('AssertionError: expected true to be false').isValid,
    ).toBe(false);
    expect(validatePath('✓ test passed').isValid).toBe(false);
  });

  it('should reject misinterpreted log fragments with double quotes or ellipses', () => {
    const logFragment =
      'Error: No "formatTimeRange" export is defined on the lib/formatTimeRange mock.';
    const result = validatePath(logFragment);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('suspicious characters');
  });

  it('should allow short paths with double quotes (even if unusual)', () => {
    // Some systems might technically allow this, and we only want to block long/obvious log fragments
    expect(validatePath('file"with"quote.txt').isValid).toBe(true);
  });

  it('should reject long paths with ellipses', () => {
    expect(
      validatePath('this/is/a/very/long/path/with/ellipses/.../and/more')
        .isValid,
    ).toBe(false);
  });

  it('should allow paths with Unicode characters', () => {
    expect(validatePath('src/文件.ts').isValid).toBe(true);
    expect(validatePath('docs/🚀_launch.md').isValid).toBe(true);
  });

  it('should allow paths with multiple consecutive slashes (normalizing is handled by OS layer)', () => {
    expect(validatePath('src//index.ts').isValid).toBe(true);
  });

  it('should allow paths with trailing slashes', () => {
    expect(validatePath('src/utils/').isValid).toBe(true);
  });

  it('should allow paths with dots as components', () => {
    expect(validatePath('./src/../index.ts').isValid).toBe(true);
  });

  it('should reject paths that are only dots if they exceed suspicious length (none currently do)', () => {
    expect(validatePath('...').isValid).toBe(true); // Short ellipses are allowed as filenames
  });

  it('should reject paths with mixed invalid characters', () => {
    expect(validatePath('path\nwith\0invalid').isValid).toBe(false);
  });
});
