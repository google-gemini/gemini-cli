/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { decodeByteCodedString } from './byteDecoder.js';

describe('decodeByteCodedString', () => {
  it('should decode pure byte-coded strings', () => {
    const text = 'Hello, World! How are you?';
    const byteCoded = Array.from(new TextEncoder().encode(text)).join(',');
    expect(decodeByteCodedString(byteCoded)).toBe(text);
  });

  it('should decode a JSON error message from byte codes', () => {
    const json = JSON.stringify({
      error: {
        code: 429,
        message: 'No capacity available for model gemini-3-flash-preview',
        status: 'RESOURCE_EXHAUSTED',
      },
    });
    const byteCoded = Array.from(new TextEncoder().encode(json)).join(',');
    expect(decodeByteCodedString(byteCoded)).toBe(json);
  });

  it('should return non-byte strings unchanged', () => {
    expect(decodeByteCodedString('Normal error message')).toBe(
      'Normal error message',
    );
  });

  it('should handle empty strings', () => {
    expect(decodeByteCodedString('')).toBe('');
  });

  it('should return strings with normal commas unchanged', () => {
    expect(decodeByteCodedString('Error: foo, bar, baz')).toBe(
      'Error: foo, bar, baz',
    );
  });

  it('should handle ". " prefix followed by byte-coded body', () => {
    const body = '{"error":"test"}';
    const byteCoded = Array.from(new TextEncoder().encode(body)).join(',');
    const input = `got status: 429. ${byteCoded}`;
    const result = decodeByteCodedString(input);
    expect(result).toBe(`got status: 429. ${body}`);
  });

  it('should handle ": " prefix followed by byte-coded body', () => {
    const body = '{"error":"Resource exhausted"}';
    const byteCoded = Array.from(new TextEncoder().encode(body)).join(',');
    const input = `API Error: ${byteCoded}`;
    const result = decodeByteCodedString(input);
    expect(result).toBe(`API Error: ${body}`);
  });

  it('should handle space-only prefix followed by byte-coded body', () => {
    const body = 'Resource exhausted for this model';
    const byteCoded = Array.from(new TextEncoder().encode(body)).join(',');
    const input = `status 429 ${byteCoded}`;
    const result = decodeByteCodedString(input);
    expect(result).toBe(`status 429 ${body}`);
  });

  it('should not decode strings with values above 255', () => {
    expect(decodeByteCodedString('300,200,100,50')).toBe('300,200,100,50');
  });

  it('should not decode strings with fewer than 16 parts', () => {
    expect(decodeByteCodedString('72,101,108')).toBe('72,101,108');
    // 4 parts — too short
    expect(decodeByteCodedString('1,2,3,4')).toBe('1,2,3,4');
    // 8 parts — still under threshold
    expect(decodeByteCodedString('72,101,108,108,111,33,10,32')).toBe(
      '72,101,108,108,111,33,10,32',
    );
    // 15 parts — just under threshold
    expect(
      decodeByteCodedString('72,101,108,108,111,32,87,111,114,108,100,33,10,13,9'),
    ).toBe('72,101,108,108,111,32,87,111,114,108,100,33,10,13,9');
  });

  it('should not false-positive on version-like strings', () => {
    expect(decodeByteCodedString('v1,2,3,4')).toBe('v1,2,3,4');
  });

  it('should handle spaced byte sequences in prefix mode', () => {
    const body = '{"error":"capacity limit reached"}';
    const byteCoded = Array.from(new TextEncoder().encode(body))
      .join(', ');
    const input = `Error: ${byteCoded}`;
    const result = decodeByteCodedString(input);
    expect(result).toBe(`Error: ${body}`);
  });

  it('should not decode strings with leading zeros', () => {
    expect(decodeByteCodedString('072,101,108,108')).toBe('072,101,108,108');
  });

  it('should not decode strings with non-numeric parts', () => {
    expect(decodeByteCodedString('abc,def,ghi,jkl')).toBe('abc,def,ghi,jkl');
  });

  it('should reject invalid UTF-8 byte sequences', () => {
    // 0xFF,0xFE is not valid UTF-8 — repeated 16+ times to meet threshold
    const invalidUtf8 = Array(20).fill('255').join(',');
    expect(decodeByteCodedString(invalidUtf8)).toBe(invalidUtf8);
  });

  it('should reject decoded text dominated by control characters', () => {
    // 16+ byte values that are valid UTF-8 but mostly control chars (0x01-0x08)
    const controlBytes = Array(20).fill('1').join(',');
    expect(decodeByteCodedString(controlBytes)).toBe(controlBytes);
  });
});
