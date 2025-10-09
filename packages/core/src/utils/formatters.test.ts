/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

import { bytesToMB, formatMemoryUsage } from './formatters.js';

describe('bytesToMB', () => {
  it('converts bytes to megabytes', () => {
    expect(bytesToMB(0)).toBe(0);
    expect(bytesToMB(512 * 1024)).toBeCloseTo(0.5, 5);
    expect(bytesToMB(5 * 1024 * 1024)).toBe(5);
  });
});

describe('formatMemoryUsage', () => {
  it('formats values below one megabyte in KB', () => {
    expect(formatMemoryUsage(512 * 1024)).toBe('512.0 KB');
  });

  it('formats values below one gigabyte in MB', () => {
    expect(formatMemoryUsage(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats values of one gigabyte or larger in GB', () => {
    expect(formatMemoryUsage(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
  });
});
