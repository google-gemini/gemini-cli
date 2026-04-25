/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import {
  filterConsoleLogs,
  getConsoleLevelCounts,
  normalizeConsoleSearchText,
} from './App.js';

describe('devtools console filtering helpers', () => {
  const logs = [
    { type: 'log' as const, content: 'startup complete' },
    { type: 'info' as const, content: 'session registered' },
    { type: 'warn' as const, content: 'retry scheduled' },
    { type: 'error' as const, content: 'request failed' },
    { type: 'debug' as const, content: 'socket connected' },
    { type: 'debug' as const, content: 'network logging enabled' },
  ];

  it('computes per-level counts for the toolbar', () => {
    expect(getConsoleLevelCounts(logs as never[])).toEqual({
      all: 6,
      log: 1,
      info: 1,
      warn: 1,
      error: 1,
      debug: 2,
    });
  });

  it('filters by level only when a specific level is active', () => {
    expect(filterConsoleLogs(logs as never[], 'debug', '')).toEqual([
      { type: 'debug', content: 'socket connected' },
      { type: 'debug', content: 'network logging enabled' },
    ]);
  });

  it('filters by search text case-insensitively', () => {
    expect(filterConsoleLogs(logs as never[], 'all', 'SESSION')).toEqual([
      { type: 'info', content: 'session registered' },
    ]);
  });

  it('combines level and search filters', () => {
    expect(filterConsoleLogs(logs as never[], 'debug', 'network')).toEqual([
      { type: 'debug', content: 'network logging enabled' },
    ]);
  });

  it('returns an empty list when no logs match the active filters', () => {
    expect(filterConsoleLogs(logs as never[], 'error', 'socket')).toEqual([]);
  });

  it('normalizes search text by trimming surrounding whitespace', () => {
    expect(normalizeConsoleSearchText('  SESSION  ')).toBe('session');
    expect(filterConsoleLogs(logs as never[], 'all', '  SESSION  ')).toEqual([
      { type: 'info', content: 'session registered' },
    ]);
  });
});
