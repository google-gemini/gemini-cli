/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { Content } from '@google/genai';
import { isFunctionResponse, isFunctionCall } from './messageInspectors.js';

describe('messageInspectors', () => {
  describe('isFunctionResponse', () => {
    it('should return true for valid function response', () => {
      const content: Content = {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'testFunction',
              response: { result: 'success' },
            },
          },
        ],
      };

      expect(isFunctionResponse(content)).toBe(true);
    });

    it('should return false when role is not user', () => {
      const content: Content = {
        role: 'model',
        parts: [
          {
            functionResponse: {
              name: 'testFunction',
              response: { result: 'success' },
            },
          },
        ],
      };

      expect(isFunctionResponse(content)).toBe(false);
    });

    it('should return false when parts is undefined', () => {
      const content: Content = {
        role: 'user',
        parts: undefined,
      };

      expect(isFunctionResponse(content)).toBe(false);
    });

    it('should return false when parts is empty', () => {
      const content: Content = {
        role: 'user',
        parts: [],
      };

      expect(isFunctionResponse(content)).toBe(false);
    });

    it('should return false when not all parts are function responses', () => {
      const content: Content = {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'testFunction',
              response: { result: 'success' },
            },
          },
          {
            text: 'some text',
          },
        ],
      };

      expect(isFunctionResponse(content)).toBe(false);
    });

    it('should return true when all parts are function responses', () => {
      const content: Content = {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'function1',
              response: { result: 'success' },
            },
          },
          {
            functionResponse: {
              name: 'function2',
              response: { data: 'test' },
            },
          },
        ],
      };

      expect(isFunctionResponse(content)).toBe(true);
    });
  });

  describe('isFunctionCall', () => {
    it('should return true for valid function call', () => {
      const content: Content = {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'testFunction',
              args: { param: 'value' },
            },
          },
        ],
      };

      expect(isFunctionCall(content)).toBe(true);
    });

    it('should return false when role is not model', () => {
      const content: Content = {
        role: 'user',
        parts: [
          {
            functionCall: {
              name: 'testFunction',
              args: { param: 'value' },
            },
          },
        ],
      };

      expect(isFunctionCall(content)).toBe(false);
    });

    it('should return false when parts is undefined', () => {
      const content: Content = {
        role: 'model',
        parts: undefined,
      };

      expect(isFunctionCall(content)).toBe(false);
    });

    it('should return false when parts is empty', () => {
      const content: Content = {
        role: 'model',
        parts: [],
      };

      expect(isFunctionCall(content)).toBe(false);
    });

    it('should return false when not all parts are function calls', () => {
      const content: Content = {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'testFunction',
              args: { param: 'value' },
            },
          },
          {
            text: 'some text',
          },
        ],
      };

      expect(isFunctionCall(content)).toBe(false);
    });

    it('should return true when all parts are function calls', () => {
      const content: Content = {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'function1',
              args: { param1: 'value1' },
            },
          },
          {
            functionCall: {
              name: 'function2',
              args: { param2: 'value2' },
            },
          },
        ],
      };

      expect(isFunctionCall(content)).toBe(true);
    });
  });
});
