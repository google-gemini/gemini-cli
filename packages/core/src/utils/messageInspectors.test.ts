/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Content } from '@google/genai';
import { isFunctionCall, isFunctionResponse } from './messageInspectors.js';

describe('messageInspectors', () => {
  describe('isFunctionResponse', () => {
    it('returns true for a user message whose parts are all function responses', () => {
      const content: Content = {
        role: 'user',
        parts: [
          { functionResponse: { name: 'tool', response: { ok: true } } },
          { functionResponse: { name: 'tool2', response: { ok: true } } },
        ],
      };
      expect(isFunctionResponse(content)).toBe(true);
    });

    it('returns false when the role is not "user"', () => {
      const content: Content = {
        role: 'model',
        parts: [{ functionResponse: { name: 'tool', response: { ok: true } } }],
      };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('returns false when a part is not a function response', () => {
      const content: Content = {
        role: 'user',
        parts: [{ text: 'hello' }],
      };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('returns false when parts are mixed', () => {
      const content: Content = {
        role: 'user',
        parts: [
          { functionResponse: { name: 'tool', response: { ok: true } } },
          { text: 'hello' },
        ],
      };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('returns false when parts is undefined', () => {
      const content: Content = { role: 'user' };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('returns false when parts is an empty array', () => {
      const content: Content = { role: 'user', parts: [] };
      expect(isFunctionResponse(content)).toBe(false);
    });
  });

  describe('isFunctionCall', () => {
    it('returns true for a model message whose parts are all function calls', () => {
      const content: Content = {
        role: 'model',
        parts: [
          { functionCall: { name: 'tool', args: {} } },
          { functionCall: { name: 'tool2', args: {} } },
        ],
      };
      expect(isFunctionCall(content)).toBe(true);
    });

    it('returns false when the role is not "model"', () => {
      const content: Content = {
        role: 'user',
        parts: [{ functionCall: { name: 'tool', args: {} } }],
      };
      expect(isFunctionCall(content)).toBe(false);
    });

    it('returns false when a part is not a function call', () => {
      const content: Content = {
        role: 'model',
        parts: [{ text: 'hello' }],
      };
      expect(isFunctionCall(content)).toBe(false);
    });

    it('returns false when parts are mixed', () => {
      const content: Content = {
        role: 'model',
        parts: [
          { functionCall: { name: 'tool', args: {} } },
          { text: 'hello' },
        ],
      };
      expect(isFunctionCall(content)).toBe(false);
    });

    it('returns false when parts is undefined', () => {
      const content: Content = { role: 'model' };
      expect(isFunctionCall(content)).toBe(false);
    });

    it('returns false when parts is an empty array', () => {
      const content: Content = { role: 'model', parts: [] };
      expect(isFunctionCall(content)).toBe(false);
    });
  });
});
