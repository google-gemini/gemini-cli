/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { formatMemoryUsage } from './formatters.js';

describe('formatMemoryUsage', () => {
  it('should format bytes less than 1 MB as KB', () => {
    expect(formatMemoryUsage(1024)).toBe('1.0 KB');
    expect(formatMemoryUsage(512)).toBe('0.5 KB');
    expect(formatMemoryUsage(10240)).toBe('10.0 KB');
    expect(formatMemoryUsage(1023 * 1024)).toBe('1023.0 KB');
  });

  it('should format bytes less than 1 GB as MB', () => {
    expect(formatMemoryUsage(1024 * 1024)).toBe('1.0 MB');
    expect(formatMemoryUsage(1024 * 1024 * 10)).toBe('10.0 MB');
    expect(formatMemoryUsage(1024 * 1024 * 512)).toBe('512.0 MB');
    expect(formatMemoryUsage(1024 * 1024 * 1023)).toBe('1023.0 MB');
  });

  it('should format bytes 1 GB or more as GB', () => {
    expect(formatMemoryUsage(1024 * 1024 * 1024)).toBe('1.00 GB');
    expect(formatMemoryUsage(1024 * 1024 * 1024 * 2)).toBe('2.00 GB');
    expect(formatMemoryUsage(1024 * 1024 * 1024 * 1.5)).toBe('1.50 GB');
    expect(formatMemoryUsage(1024 * 1024 * 1024 * 16)).toBe('16.00 GB');
  });

  it('should handle edge case of 0 bytes', () => {
    expect(formatMemoryUsage(0)).toBe('0.0 KB');
  });

  it('should handle very small byte values', () => {
    expect(formatMemoryUsage(1)).toBe('0.0 KB');
    expect(formatMemoryUsage(100)).toBe('0.1 KB');
  });

  it('should use correct decimal places for each unit', () => {
    // KB uses 1 decimal place
    expect(formatMemoryUsage(1536)).toMatch(/^\d+\.\d KB$/);

    // MB uses 1 decimal place
    expect(formatMemoryUsage(1024 * 1024 * 1.5)).toMatch(/^\d+\.\d MB$/);

    // GB uses 2 decimal places
    expect(formatMemoryUsage(1024 * 1024 * 1024 * 1.234)).toMatch(
      /^\d+\.\d{2} GB$/,
    );
  });
});
