/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Content } from '@google/genai';
import { isFunctionResponse, isFunctionCall } from './messageInspectors.js';

describe('messageInspectors', () => {
  describe('isFunctionResponse', () => {
    it('returns true for a user message with a single functionResponse part', () => {
      const content: Content = {
        role: 'user',
        parts: [{ functionResponse: { name: 'tool', response: {} } }],
      };
      expect(isFunctionResponse(content)).toBe(true);
    });

    it('returns true for a user message with multiple functionResponse parts', () => {
      const content: Content = {
        role: 'user',
        parts: [
          { functionResponse: { name: 'tool1', response: {} } },
          { functionResponse: { name: 'tool2', response: {} } },
        ],
      };
      expect(isFunctionResponse(content)).toBe(true);
    });

    it('returns false for a model message with functionResponse parts', () => {
      const content: Content = {
        role: 'model',
        parts: [{ functionResponse: { name: 'tool', response: {} } }],
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

    it('returns false for a user message with mixed parts', () => {
      const content: Content = {
        role: 'user',
        parts: [
          { functionResponse: { name: 'tool', response: {} } },
          { text: 'hello' },
        ],
      };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('returns false when parts is undefined', () => {
      const content: Content = { role: 'user' };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('returns false when parts is empty', () => {
      const content: Content = { role: 'user', parts: [] };
      expect(isFunctionResponse(content)).toBe(false);
    });
  });

  describe('isFunctionCall', () => {
    it('returns true for a model message with a single functionCall part', () => {
      const content: Content = {
        role: 'model',
        parts: [{ functionCall: { name: 'tool', args: {} } }],
      };
      expect(isFunctionCall(content)).toBe(true);
    });

    it('returns true for a model message with multiple functionCall parts', () => {
      const content: Content = {
        role: 'model',
        parts: [
          { functionCall: { name: 'tool1', args: {} } },
          { functionCall: { name: 'tool2', args: {} } },
        ],
      };
      expect(isFunctionCall(content)).toBe(true);
    });

    it('returns false for a user message with functionCall parts', () => {
      const content: Content = {
        role: 'user',
        parts: [{ functionCall: { name: 'tool', args: {} } }],
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

    it('returns false for a model message with mixed parts', () => {
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

    it('returns false when parts is empty', () => {
      const content: Content = { role: 'model', parts: [] };
      expect(isFunctionCall(content)).toBe(false);
    });
  });
});
