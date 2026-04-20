/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { buildBar, formatBytes } from './barChart.js';

describe('buildBar', () => {
  it('should return all empty for fraction 0', () => {
    const result = buildBar(0, 20);
    expect(result.filled).toBe(0);
    expect(result.empty).toBe(20);
  });

  it('should return all filled for fraction 1', () => {
    const result = buildBar(1, 20);
    expect(result.filled).toBe(20);
    expect(result.empty).toBe(0);
  });

  it('should return half-filled for fraction 0.5', () => {
    const result = buildBar(0.5, 20);
    expect(result.filled).toBe(10);
    expect(result.empty).toBe(10);
  });

  it('should show at least 1 tick for small positive fractions', () => {
    const result = buildBar(0.001, 20);
    expect(result.filled).toBeGreaterThanOrEqual(1);
    expect(result.empty).toBe(19);
  });

  it('should not fill completely for fractions less than 1', () => {
    const result = buildBar(0.999, 20);
    expect(result.filled).toBeLessThanOrEqual(19);
    expect(result.empty).toBeGreaterThanOrEqual(1);
  });

  it('should clamp negative fractions to 0', () => {
    const result = buildBar(-0.5, 20);
    expect(result.filled).toBe(0);
    expect(result.empty).toBe(20);
  });

  it('should clamp fractions greater than 1', () => {
    const result = buildBar(1.5, 20);
    expect(result.filled).toBe(20);
    expect(result.empty).toBe(0);
  });

  it('should use default width of 20', () => {
    const result = buildBar(0.5);
    expect(result.filled + result.empty).toBe(20);
  });

  it('should respect custom width', () => {
    const result = buildBar(0.5, 10);
    expect(result.filled + result.empty).toBe(10);
  });
});

describe('formatBytes', () => {
  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50.0 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
});
