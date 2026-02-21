/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

import { bytesToMB, formatBytes, formatDuration } from './formatters.js';

describe('bytesToMB', () => {
  it('converts bytes to megabytes', () => {
    expect(bytesToMB(0)).toBe(0);
    expect(bytesToMB(512 * 1024)).toBeCloseTo(0.5, 5);
    expect(bytesToMB(5 * 1024 * 1024)).toBe(5);
  });
});

describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats values below one kilobyte in B', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats values below one megabyte in KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(512 * 1024)).toBe('512.0 KB');
  });

  it('formats values below one gigabyte in MB', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats values of one gigabyte or larger in GB', () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
  });
});

describe('formatDuration', () => {
  it('formats zero milliseconds', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('formats durations below one second in ms', () => {
    expect(formatDuration(1)).toBe('1ms');
    expect(formatDuration(450)).toBe('450ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats exact seconds without a decimal', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(30000)).toBe('30s');
    expect(formatDuration(59000)).toBe('59s');
  });

  it('formats fractional seconds with one decimal place', () => {
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(2200)).toBe('2.2s');
  });

  it('formats durations of one minute or more in m/s notation', () => {
    expect(formatDuration(60000)).toBe('1m');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(120000)).toBe('2m');
    expect(formatDuration(154000)).toBe('2m 34s');
  });

  it('formats durations of one hour or more in h/m/s notation', () => {
    expect(formatDuration(3600000)).toBe('1h');
    expect(formatDuration(3661000)).toBe('1h 1m 1s');
    expect(formatDuration(7200000)).toBe('2h');
    expect(formatDuration(7384000)).toBe('2h 3m 4s');
  });

  it('clamps negative values to 0ms', () => {
    expect(formatDuration(-500)).toBe('0ms');
  });
});
