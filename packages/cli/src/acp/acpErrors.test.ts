/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getAcpErrorMessage } from './acpErrors.js';

describe('getAcpErrorMessage', () => {
  it('should return plain error message', () => {
    expect(getAcpErrorMessage(new Error('plain error'))).toBe('plain error');
  });

  it('should parse simple JSON error response', () => {
    const json = JSON.stringify({ error: { message: 'json error' } });
    expect(getAcpErrorMessage(new Error(json))).toBe('json error');
  });

  it('should parse double-encoded JSON error response', () => {
    const innerJson = JSON.stringify({ error: { message: 'nested error' } });
    const outerJson = JSON.stringify({ error: { message: innerJson } });
    expect(getAcpErrorMessage(new Error(outerJson))).toBe('nested error');
  });

  it('should parse array-style JSON error response', () => {
    const json = JSON.stringify([{ error: { message: 'array error' } }]);
    expect(getAcpErrorMessage(new Error(json))).toBe('array error');
  });

  it('should parse JSON with top-level message field', () => {
    const json = JSON.stringify({ message: 'top-level message' });
    expect(getAcpErrorMessage(new Error(json))).toBe('top-level message');
  });

  it('should handle JSON with trailing newline', () => {
    const json = JSON.stringify({ error: { message: 'newline error' } }) + '\n';
    expect(getAcpErrorMessage(new Error(json))).toBe('newline error');
  });

  it('should return original message if JSON parsing fails', () => {
    const invalidJson = '{ not-json }';
    expect(getAcpErrorMessage(new Error(invalidJson))).toBe(invalidJson);
  });
});
