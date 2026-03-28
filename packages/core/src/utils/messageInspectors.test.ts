/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { Content } from '@google/genai';
import { isFunctionCall, isFunctionResponse } from './messageInspectors.js';

describe('messageInspectors', () => {
  it('returns false for empty parts in function-call detection', () => {
    const content = { role: 'model', parts: [] } as Content;
    expect(isFunctionCall(content)).toBe(false);
  });

  it('returns false for empty parts in function-response detection', () => {
    const content = { role: 'user', parts: [] } as Content;
    expect(isFunctionResponse(content)).toBe(false);
  });

  it('returns true when all parts are function calls', () => {
    const content = {
      role: 'model',
      parts: [{ functionCall: { name: 'tool_a', args: {} } }],
    } as unknown as Content;
    expect(isFunctionCall(content)).toBe(true);
  });

  it('returns true when all parts are function responses', () => {
    const content = {
      role: 'user',
      parts: [
        { functionResponse: { name: 'tool_a', response: { output: 'ok' } } },
      ],
    } as unknown as Content;
    expect(isFunctionResponse(content)).toBe(true);
  });
});
