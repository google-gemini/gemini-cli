/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { coerceCommaSeparated } from './commaSeparated.js';

describe('coerceCommaSeparated', () => {
  it('should return an empty array for undefined', () => {
    expect(coerceCommaSeparated(undefined)).toEqual([]);
  });

  it('should return an empty array for null', () => {
    expect(coerceCommaSeparated(null)).toEqual([]);
  });

  it('should ignore non-string values', () => {
    expect(coerceCommaSeparated(true)).toEqual([]);
  });

  it('should handle a single string', () => {
    expect(coerceCommaSeparated('read_file')).toEqual(['read_file']);
  });

  it('should split comma-separated values', () => {
    expect(coerceCommaSeparated(['read_file,write_file'])).toEqual([
      'read_file',
      'write_file',
    ]);
  });

  it('should trim whitespace', () => {
    expect(coerceCommaSeparated([' read_file , write_file '])).toEqual([
      'read_file',
      'write_file',
    ]);
  });

  it('should ignore non-string array elements', () => {
    expect(coerceCommaSeparated(['read_file', true])).toEqual(['read_file']);
  });

  it('should preserve the existing empty-string behavior', () => {
    expect(coerceCommaSeparated([''])).toEqual(['']);
  });
});
