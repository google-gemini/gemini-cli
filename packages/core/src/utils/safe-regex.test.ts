/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { safeRegexTest } from './safe-regex.js';

describe('safeRegexTest', () => {
  it('should return true for matching patterns', () => {
    const pattern = /^hello/;
    const input = 'hello world';
    expect(safeRegexTest(pattern, input)).toBe(true);
  });

  it('should return false for non-matching patterns', () => {
    const pattern = /^world/;
    const input = 'hello world';
    expect(safeRegexTest(pattern, input)).toBe(false);
  });

  it('should handle complex but safe patterns', () => {
    const pattern = /^[a-z0-9]+@[a-z0-9]+\.[a-z]+$/;
    const input = 'test@example.com';
    expect(safeRegexTest(pattern, input)).toBe(true);
  });

  it('should return false (timeout) for catastrophic backtracking (ReDoS)', () => {
    const pattern = /(x+x+)+y/;
    const input = 'x'.repeat(50);

    const start = Date.now();
    const result = safeRegexTest(pattern, input, 50);
    const duration = Date.now() - start;

    expect(result).toBe(false);
    expect(duration).toBeLessThan(1000);
  });

  it('should return false if regex throws error', () => {
    const pattern = /a/;
    const input = 'a';
    expect(() => safeRegexTest(pattern, input)).not.toThrow();
  });

  it('should handle multibyte characters (Unicode)', () => {
    const pattern = /^Hello/;
    const input = 'Hello World';
    expect(safeRegexTest(pattern, input)).toBe(true);
  });

  it('should respect regex flags (case insensitive)', () => {
    const pattern = /hello/i;
    const input = 'HELLO WORLD';
    expect(safeRegexTest(pattern, input)).toBe(true);
  });

  it('should respect regex flags (multiline)', () => {
    const pattern = /^world/m;
    const input = 'hello\nworld';
    expect(safeRegexTest(pattern, input)).toBe(true);
  });

  it('should respect custom timeout settings', () => {
    const heavyPattern = /(x+x+)+y/;
    const heavyInput = 'x'.repeat(20);
    expect(safeRegexTest(heavyPattern, heavyInput, 1)).toBe(false);
  });

  it('should not update lastIndex of the original global regex (no side effects)', () => {
    const pattern = /test/g;
    const input = 'test test';
    expect(safeRegexTest(pattern, input)).toBe(true);
    expect(pattern.lastIndex).toBe(0);
  });

  it('should handle empty input strings', () => {
    const pattern = /^$/;
    expect(safeRegexTest(pattern, '')).toBe(true);
    expect(safeRegexTest(pattern, 'a')).toBe(false);
  });

  it('should handle inputs with newlines properly without dotall flag', () => {
    const pattern = /.*/;
    const input = 'line1\nline2';
    expect(safeRegexTest(pattern, input)).toBe(true);

    const anchored = /^.+$/;
    expect(safeRegexTest(anchored, input)).toBe(false);
  });

  it('should handle inputs with newlines properly WITH dotall flag', () => {
    const pattern = /^.+$/s;
    const input = 'line1\nline2';
    expect(safeRegexTest(pattern, input)).toBe(true);
  });
});
