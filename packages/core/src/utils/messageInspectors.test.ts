/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Content } from '@google/genai';
import { isFunctionCall, isFunctionResponse } from './messageInspectors.js';

describe('isFunctionCall', () => {
  it('should return true for a model message with function call parts', () => {
    const content: Content = {
      role: 'model',
      parts: [{ functionCall: { name: 'tool', args: {} } }],
    };
    expect(isFunctionCall(content)).toBe(true);
  });

  it('should return true for multiple function call parts', () => {
    const content: Content = {
      role: 'model',
      parts: [
        { functionCall: { name: 'tool_a', args: {} } },
        { functionCall: { name: 'tool_b', args: { x: 1 } } },
      ],
    };
    expect(isFunctionCall(content)).toBe(true);
  });

  it('should return false for an empty parts array', () => {
    const content: Content = {
      role: 'model',
      parts: [],
    };
    expect(isFunctionCall(content)).toBe(false);
  });

  it('should return false when parts is undefined', () => {
    const content: Content = {
      role: 'model',
    };
    expect(isFunctionCall(content)).toBe(false);
  });

  it('should return false for a user message with function call parts', () => {
    const content: Content = {
      role: 'user',
      parts: [{ functionCall: { name: 'tool', args: {} } }],
    };
    expect(isFunctionCall(content)).toBe(false);
  });

  it('should return false when parts contain text instead of function calls', () => {
    const content: Content = {
      role: 'model',
      parts: [{ text: 'hello' }],
    };
    expect(isFunctionCall(content)).toBe(false);
  });

  it('should return false when parts mix function calls and text', () => {
    const content: Content = {
      role: 'model',
      parts: [{ functionCall: { name: 'tool', args: {} } }, { text: 'hello' }],
    };
    expect(isFunctionCall(content)).toBe(false);
  });
});

describe('isFunctionResponse', () => {
  it('should return true for a user message with function response parts', () => {
    const content: Content = {
      role: 'user',
      parts: [{ functionResponse: { name: 'tool', response: {} } }],
    };
    expect(isFunctionResponse(content)).toBe(true);
  });

  it('should return true for multiple function response parts', () => {
    const content: Content = {
      role: 'user',
      parts: [
        { functionResponse: { name: 'tool_a', response: {} } },
        { functionResponse: { name: 'tool_b', response: { result: 'ok' } } },
      ],
    };
    expect(isFunctionResponse(content)).toBe(true);
  });

  it('should return false for an empty parts array', () => {
    const content: Content = {
      role: 'user',
      parts: [],
    };
    expect(isFunctionResponse(content)).toBe(false);
  });

  it('should return false when parts is undefined', () => {
    const content: Content = {
      role: 'user',
    };
    expect(isFunctionResponse(content)).toBe(false);
  });

  it('should return false for a model message with function response parts', () => {
    const content: Content = {
      role: 'model',
      parts: [{ functionResponse: { name: 'tool', response: {} } }],
    };
    expect(isFunctionResponse(content)).toBe(false);
  });

  it('should return false when parts contain text instead of function responses', () => {
    const content: Content = {
      role: 'user',
      parts: [{ text: 'hello' }],
    };
    expect(isFunctionResponse(content)).toBe(false);
  });

  it('should return false when parts mix function responses and text', () => {
    const content: Content = {
      role: 'user',
      parts: [
        { functionResponse: { name: 'tool', response: {} } },
        { text: 'hello' },
      ],
    };
    expect(isFunctionResponse(content)).toBe(false);
  });
});
