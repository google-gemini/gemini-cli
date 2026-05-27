/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Content } from '@google/genai';
import { isFunctionCall, isFunctionResponse } from './messageInspectors.js';

describe('isFunctionResponse', () => {
  it('returns true for a user message whose parts are all functionResponses', () => {
    const content: Content = {
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'call_1',
            name: 'do_thing',
            response: { output: 'ok' },
          },
        },
      ],
    };
    expect(isFunctionResponse(content)).toBe(true);
  });

  it('returns true when every part has a functionResponse (multiple parts)', () => {
    const content: Content = {
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'call_1',
            name: 'a',
            response: { output: '1' },
          },
        },
        {
          functionResponse: {
            id: 'call_2',
            name: 'b',
            response: { output: '2' },
          },
        },
      ],
    };
    expect(isFunctionResponse(content)).toBe(true);
  });

  it('returns false for an empty parts array (regression test for #23195)', () => {
    // `Array.prototype.every([])` is `true` (vacuous truth). Without an
    // explicit non-empty check, an empty user message would be misclassified
    // as a function response.
    const content: Content = { role: 'user', parts: [] };
    expect(isFunctionResponse(content)).toBe(false);
  });

  it('returns false when parts is undefined', () => {
    const content: Content = { role: 'user' };
    expect(isFunctionResponse(content)).toBe(false);
  });

  it('returns false for a model message even with functionResponse parts', () => {
    const content: Content = {
      role: 'model',
      parts: [
        {
          functionResponse: {
            id: 'call_1',
            name: 'do_thing',
            response: { output: 'ok' },
          },
        },
      ],
    };
    expect(isFunctionResponse(content)).toBe(false);
  });

  it('returns false when at least one part is plain text', () => {
    const content: Content = {
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'call_1',
            name: 'do_thing',
            response: { output: 'ok' },
          },
        },
        { text: 'extra commentary' },
      ],
    };
    expect(isFunctionResponse(content)).toBe(false);
  });

  it('returns false for a plain user text message', () => {
    const content: Content = {
      role: 'user',
      parts: [{ text: 'hello' }],
    };
    expect(isFunctionResponse(content)).toBe(false);
  });
});

describe('isFunctionCall', () => {
  it('returns true for a model message whose parts are all functionCalls', () => {
    const content: Content = {
      role: 'model',
      parts: [
        {
          functionCall: {
            id: 'call_1',
            name: 'do_thing',
            args: {},
          },
        },
      ],
    };
    expect(isFunctionCall(content)).toBe(true);
  });

  it('returns true when every part has a functionCall (multiple parts)', () => {
    const content: Content = {
      role: 'model',
      parts: [
        { functionCall: { id: 'call_1', name: 'a', args: {} } },
        { functionCall: { id: 'call_2', name: 'b', args: {} } },
      ],
    };
    expect(isFunctionCall(content)).toBe(true);
  });

  it('returns false for an empty parts array (regression test for #23195)', () => {
    // `Array.prototype.every([])` is `true` (vacuous truth). Without an
    // explicit non-empty check, an empty model message would be misclassified
    // as a function call and could be incorrectly pruned from history.
    const content: Content = { role: 'model', parts: [] };
    expect(isFunctionCall(content)).toBe(false);
  });

  it('returns false when parts is undefined', () => {
    const content: Content = { role: 'model' };
    expect(isFunctionCall(content)).toBe(false);
  });

  it('returns false for a user message even with functionCall parts', () => {
    const content: Content = {
      role: 'user',
      parts: [{ functionCall: { id: 'call_1', name: 'do_thing', args: {} } }],
    };
    expect(isFunctionCall(content)).toBe(false);
  });

  it('returns false when at least one part is plain text', () => {
    const content: Content = {
      role: 'model',
      parts: [
        { functionCall: { id: 'call_1', name: 'do_thing', args: {} } },
        { text: 'thinking out loud' },
      ],
    };
    expect(isFunctionCall(content)).toBe(false);
  });

  it('returns false for a plain model text message', () => {
    const content: Content = {
      role: 'model',
      parts: [{ text: 'hello' }],
    };
    expect(isFunctionCall(content)).toBe(false);
  });
});
