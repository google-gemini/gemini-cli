/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCustomHeaders } from './customHeaderUtils.js';

describe('parseCustomHeaders', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return an empty object if input is undefined', () => {
    expect(parseCustomHeaders(undefined)).toEqual({});
  });

  it('should return an empty object if input is empty string', () => {
    expect(parseCustomHeaders('')).toEqual({});
  });

  it('should parse a single header correctly', () => {
    const input = 'Authorization: Bearer abc123';
    expect(parseCustomHeaders(input)).toEqual({
      Authorization: 'Bearer abc123',
    });
  });

  it('should parse multiple headers separated by commas', () => {
    const input =
      'Authorization: Bearer abc123, Content-Type: application/json';
    expect(parseCustomHeaders(input)).toEqual({
      Authorization: 'Bearer abc123',
      'Content-Type': 'application/json',
    });
  });

  it('should ignore entries without colon', () => {
    const input = 'Authorization Bearer abc123, Content-Type: application/json';
    expect(parseCustomHeaders(input)).toEqual({
      'Content-Type': 'application/json',
    });
  });

  it('should trim whitespace around names and values', () => {
    const input =
      '  Authorization  :   Bearer abc123  ,  Content-Type : application/json  ';
    expect(parseCustomHeaders(input)).toEqual({
      Authorization: 'Bearer abc123',
      'Content-Type': 'application/json',
    });
  });

  it('should handle headers with colons in the value', () => {
    const input = 'X-Custom: value:with:colons, Authorization: Bearer xyz';
    expect(parseCustomHeaders(input)).toEqual({
      'X-Custom': 'value:with:colons',
      Authorization: 'Bearer xyz',
    });
  });

  it('should skip headers with empty name', () => {
    const input = ': no-name, Authorization: Bearer abc';
    expect(parseCustomHeaders(input)).toEqual({
      Authorization: 'Bearer abc',
    });
  });

  it('should skip completely empty entries', () => {
    const input = ', , Authorization: Bearer abc';
    expect(parseCustomHeaders(input)).toEqual({
      Authorization: 'Bearer abc',
    });
  });

  it('should handle Authorization Bearer with different casing', () => {
    const input = 'authorization: Bearer token123';
    expect(parseCustomHeaders(input)).toEqual({
      authorization: 'Bearer token123',
    });
  });

  it('should handle values with commas correctly', () => {
    const input = 'X-Header: value,with,commas, Authorization: Bearer abc';
    expect(parseCustomHeaders(input)).toEqual({
      'X-Header': 'value,with,commas',
      Authorization: 'Bearer abc',
    });
  });
});
