/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Content } from '@google/genai';
import { isFunctionCall, isFunctionResponse } from './messageInspectors.js';

describe('messageInspectors', () => {
  describe('isFunctionCall', () => {
    it('returns true for a model message with functionCall parts', () => {
      const content: Content = {
        role: 'model',
        parts: [{ functionCall: { name: 'readFile', args: {} } }],
      };
      expect(isFunctionCall(content)).toBe(true);
    });

    it('returns true for multiple functionCall parts', () => {
      const content: Content = {
        role: 'model',
        parts: [
          { functionCall: { name: 'readFile', args: {} } },
          { functionCall: { name: 'writeFile', args: {} } },
        ],
      };
      expect(isFunctionCall(content)).toBe(true);
    });

    it('returns false for a user message with functionCall parts', () => {
      const content: Content = {
        role: 'user',
        parts: [{ functionCall: { name: 'readFile', args: {} } }],
      };
      expect(isFunctionCall(content)).toBe(false);
    });

    it('returns false for a model message with text parts', () => {
      const content: Content = {
        role: 'model',
        parts: [{ text: 'hello' }],
      };
      expect(isFunctionCall(content)).toBe(false);
    });

    it('returns false for mixed functionCall and text parts', () => {
      const content: Content = {
        role: 'model',
        parts: [
          { functionCall: { name: 'readFile', args: {} } },
          { text: 'some text' },
        ],
      };
      expect(isFunctionCall(content)).toBe(false);
    });

    it('returns false for empty parts array', () => {
      const content: Content = { role: 'model', parts: [] };
      expect(isFunctionCall(content)).toBe(false);
    });

    it('returns false when parts is undefined', () => {
      const content = { role: 'model' } as Content;
      expect(isFunctionCall(content)).toBe(false);
    });
  });

  describe('isFunctionResponse', () => {
    it('returns true for a user message with functionResponse parts', () => {
      const content: Content = {
        role: 'user',
        parts: [
          { functionResponse: { name: 'readFile', response: { output: '' } } },
        ],
      };
      expect(isFunctionResponse(content)).toBe(true);
    });

    it('returns true for multiple functionResponse parts', () => {
      const content: Content = {
        role: 'user',
        parts: [
          { functionResponse: { name: 'readFile', response: { output: '' } } },
          {
            functionResponse: {
              name: 'writeFile',
              response: { output: '' },
            },
          },
        ],
      };
      expect(isFunctionResponse(content)).toBe(true);
    });

    it('returns false for a model message with functionResponse parts', () => {
      const content: Content = {
        role: 'model',
        parts: [
          { functionResponse: { name: 'readFile', response: { output: '' } } },
        ],
      };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('returns false for a user message with text parts', () => {
      const content: Content = {
        role: 'user',
        parts: [{ text: 'hello' }],
      };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('returns false for empty parts array', () => {
      const content: Content = { role: 'user', parts: [] };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('returns false when parts is undefined', () => {
      const content = { role: 'user' } as Content;
      expect(isFunctionResponse(content)).toBe(false);
    });
  });
});
