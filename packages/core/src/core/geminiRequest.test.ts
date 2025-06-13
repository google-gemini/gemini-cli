/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { partListUnionToString } from './geminiRequest.js';
import { type Part } from '@google/genai';

describe('partListUnionToString', () => {
  it('should return the string value if the input is a string', () => {
    const result = partListUnionToString('hello');
    expect(result).toBe('hello');
  });

  it('should return a concatenated string if the input is an array of strings', () => {
    const result = partListUnionToString(['hello', ' ', 'world']);
    expect(result).toBe('hello world');
  });

  it('should handle videoMetadata', () => {
    const part: Part = { videoMetadata: {} };
    const result = partListUnionToString(part);
    expect(result).toBe('[Video Metadata]');
  });

  it('should handle thought', () => {
    const part: Part = { thought: true };
    const result = partListUnionToString(part);
    expect(result).toBe('[Thought: true]');
  });

  it('should handle codeExecutionResult', () => {
    const part: Part = { codeExecutionResult: {} };
    const result = partListUnionToString(part);
    expect(result).toBe('[Code Execution Result]');
  });

  it('should handle executableCode', () => {
    const part: Part = { executableCode: {} };
    const result = partListUnionToString(part);
    expect(result).toBe('[Executable Code]');
  });

  it('should handle fileData', () => {
    const part: Part = {
      fileData: { mimeType: 'text/plain', fileUri: 'file.txt' },
    };
    const result = partListUnionToString(part);
    expect(result).toBe('[File Data]');
  });

  it('should handle functionCall', () => {
    const part: Part = { functionCall: { name: 'myFunction' } };
    const result = partListUnionToString(part);
    expect(result).toBe('[Function Call: myFunction]');
  });

  it('should handle functionResponse', () => {
    const part: Part = {
      functionResponse: { name: 'myFunction', response: {} },
    };
    const result = partListUnionToString(part);
    expect(result).toBe('[Function Response: myFunction]');
  });

  it('should handle inlineData', () => {
    const part: Part = { inlineData: { mimeType: 'image/png', data: '...' } };
    const result = partListUnionToString(part);
    expect(result).toBe('<image/png>');
  });

  it('should handle text', () => {
    const part: Part = { text: 'hello' };
    const result = partListUnionToString(part);
    expect(result).toBe('hello');
  });

  it('should return an empty string for an unknown part type', () => {
    const part: Part = {};
    const result = partListUnionToString(part);
    expect(result).toBe('');
  });
});
