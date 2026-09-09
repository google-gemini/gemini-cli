/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isFunctionResponse, isFunctionCall } from './messageInspectors.js';

describe('messageInspectors', () => {
  describe('isFunctionResponse', () => {
    it('should return false if content role is not user', () => {
      const content = {
        role: 'model',
        parts: [
          {
            functionResponse: {
              name: 'test_tool',
              response: { success: true },
            },
          },
        ],
      };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('should return false if content has no parts', () => {
      const content = {
        role: 'user',
      };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('should return false if parts are empty', () => {
      const content = {
        role: 'user',
        parts: [],
      };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('should return false if none of the parts is a functionResponse', () => {
      const content = {
        role: 'user',
        parts: [
          {
            text: 'Hello world',
          },
          {
            fileData: {
              mimeType: 'image/png',
              fileUri: 'https://example.com/image.png',
            },
          },
        ],
      };
      expect(isFunctionResponse(content)).toBe(false);
    });

    it('should return true if all parts are functionResponses', () => {
      const content = {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'test_tool_1',
              response: { success: true },
            },
          },
          {
            functionResponse: {
              name: 'test_tool_2',
              response: { value: 42 },
            },
          },
        ],
      };
      expect(isFunctionResponse(content)).toBe(true);
    });

    it('should return true if content is a mixed multimodal tool response containing functionResponse and sibling parts', () => {
      const content = {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'test_tool',
              response: { success: true },
            },
          },
          {
            fileData: {
              mimeType: 'image/png',
              fileUri: 'https://example.com/image.png',
            },
          },
        ],
      };
      expect(isFunctionResponse(content)).toBe(true);
    });
  });

  describe('isFunctionCall', () => {
    it('should return false if content role is not model', () => {
      const content = {
        role: 'user',
        parts: [
          {
            functionCall: {
              name: 'test_tool',
              args: {},
            },
          },
        ],
      };
      expect(isFunctionCall(content)).toBe(false);
    });

    it('should return false if content has no parts', () => {
      const content = {
        role: 'model',
      };
      expect(isFunctionCall(content)).toBe(false);
    });

    it('should return false if parts are empty', () => {
      const content = {
        role: 'model',
        parts: [],
      };
      expect(isFunctionCall(content)).toBe(false);
    });

    it('should return false if none of the parts is a functionCall', () => {
      const content = {
        role: 'model',
        parts: [
          {
            text: 'I am thinking...',
          },
        ],
      };
      expect(isFunctionCall(content)).toBe(false);
    });

    it('should return true if all parts are functionCalls', () => {
      const content = {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'test_tool_1',
              args: {},
            },
          },
          {
            functionCall: {
              name: 'test_tool_2',
              args: { query: 'foo' },
            },
          },
        ],
      };
      expect(isFunctionCall(content)).toBe(true);
    });
  });
});
