/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Content } from '@google/genai';
import type { HistoryTurn } from '../core/agentChatHistory.js';
import {
  INTERRUPTED_RESPONSE_TEXT,
  BENIGN_INTERRUPTION_REPLACEMENT,
  isInterruptionPlaceholder,
  isInterruptionContent,
  sanitizePart,
  sanitizeContent,
  sanitizeInterruptedTurns,
  sanitizeContentHistory,
} from './interruptionSanitizer.js';

describe('interruptionSanitizer', () => {
  describe('isInterruptionPlaceholder', () => {
    it('should match the exact placeholder string', () => {
      expect(isInterruptionPlaceholder(INTERRUPTED_RESPONSE_TEXT)).toBe(true);
    });

    it('should match when placeholder is embedded in surrounding text', () => {
      expect(
        isInterruptionPlaceholder(
          `Some prefix ${INTERRUPTED_RESPONSE_TEXT} some suffix`,
        ),
      ).toBe(true);
    });

    it('should not match unrelated text', () => {
      expect(isInterruptionPlaceholder('Hello world')).toBe(false);
      expect(isInterruptionPlaceholder('')).toBe(false);
      expect(isInterruptionPlaceholder('interrupted')).toBe(false);
    });

    it('should not match partial placeholder text', () => {
      expect(
        isInterruptionPlaceholder('[The previous response was interrupted'),
      ).toBe(false);
    });
  });

  describe('isInterruptionContent', () => {
    it('should detect model turns with the placeholder', () => {
      const content: Content = {
        role: 'model',
        parts: [{ text: INTERRUPTED_RESPONSE_TEXT }],
      };
      expect(isInterruptionContent(content)).toBe(true);
    });

    it('should not flag user turns even with placeholder text', () => {
      const content: Content = {
        role: 'user',
        parts: [{ text: INTERRUPTED_RESPONSE_TEXT }],
      };
      expect(isInterruptionContent(content)).toBe(false);
    });

    it('should not flag model turns without placeholder', () => {
      const content: Content = {
        role: 'model',
        parts: [{ text: 'Normal response' }],
      };
      expect(isInterruptionContent(content)).toBe(false);
    });

    it('should not flag model turns with empty parts', () => {
      const content: Content = { role: 'model', parts: [] };
      expect(isInterruptionContent(content)).toBe(false);
    });

    it('should not flag model turns with undefined parts', () => {
      const content: Content = { role: 'model', parts: undefined };
      expect(isInterruptionContent(content)).toBe(false);
    });

    it('should detect placeholder among multiple parts', () => {
      const content: Content = {
        role: 'model',
        parts: [
          { text: 'Some thought', thought: true },
          { text: INTERRUPTED_RESPONSE_TEXT },
        ],
      };
      expect(isInterruptionContent(content)).toBe(true);
    });

    it('should not flag parts with functionCall even if text matches', () => {
      const content: Content = {
        role: 'model',
        parts: [{ functionCall: { name: 'test', args: {} } }],
      };
      expect(isInterruptionContent(content)).toBe(false);
    });
  });

  describe('sanitizePart', () => {
    it('should replace placeholder text with benign replacement', () => {
      const part = { text: INTERRUPTED_RESPONSE_TEXT };
      const result = sanitizePart(part);
      expect(result.text).toBe(BENIGN_INTERRUPTION_REPLACEMENT);
    });

    it('should not mutate the original part', () => {
      const part = { text: INTERRUPTED_RESPONSE_TEXT };
      sanitizePart(part);
      expect(part.text).toBe(INTERRUPTED_RESPONSE_TEXT);
    });

    it('should return non-matching parts as-is', () => {
      const part = { text: 'Normal text' };
      const result = sanitizePart(part);
      expect(result).toBe(part); // same reference
    });

    it('should return non-text parts as-is', () => {
      const part = { functionCall: { name: 'test', args: {} } };
      const result = sanitizePart(part);
      expect(result).toBe(part);
    });
  });

  describe('sanitizeContent', () => {
    it('should sanitize a model turn with the placeholder', () => {
      const content: Content = {
        role: 'model',
        parts: [{ text: INTERRUPTED_RESPONSE_TEXT }],
      };
      const result = sanitizeContent(content);
      expect(result.role).toBe('model');
      expect(result.parts![0].text).toBe(BENIGN_INTERRUPTION_REPLACEMENT);
    });

    it('should not mutate the original content', () => {
      const content: Content = {
        role: 'model',
        parts: [{ text: INTERRUPTED_RESPONSE_TEXT }],
      };
      sanitizeContent(content);
      expect(content.parts![0].text).toBe(INTERRUPTED_RESPONSE_TEXT);
    });

    it('should return non-matching content by reference', () => {
      const content: Content = {
        role: 'model',
        parts: [{ text: 'Normal response' }],
      };
      const result = sanitizeContent(content);
      expect(result).toBe(content);
    });

    it('should handle content with mixed parts', () => {
      const content: Content = {
        role: 'model',
        parts: [
          { text: 'Thinking...', thought: true },
          { text: INTERRUPTED_RESPONSE_TEXT },
          { functionCall: { name: 'foo', args: {} } },
        ],
      };
      const result = sanitizeContent(content);
      expect(result.parts![0].text).toBe('Thinking...');
      expect(result.parts![1].text).toBe(BENIGN_INTERRUPTION_REPLACEMENT);
      expect(result.parts![2].functionCall?.name).toBe('foo');
    });
  });

  describe('sanitizeInterruptedTurns', () => {
    it('should sanitize HistoryTurn arrays with interrupted model turns', () => {
      const turns: HistoryTurn[] = [
        {
          id: 'u1',
          content: { role: 'user', parts: [{ text: 'Hello' }] },
        },
        {
          id: 'm1',
          content: {
            role: 'model',
            parts: [{ text: INTERRUPTED_RESPONSE_TEXT }],
          },
        },
        {
          id: 'u2',
          content: { role: 'user', parts: [{ text: 'Follow up' }] },
        },
      ];
      const result = sanitizeInterruptedTurns(turns);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe(turns[0]); // user turn unchanged by reference
      expect(result[1].content.parts![0].text).toBe(
        BENIGN_INTERRUPTION_REPLACEMENT,
      );
      expect(result[1].id).toBe('m1'); // preserves turn ID
      expect(result[2]).toBe(turns[2]); // next user turn unchanged
    });

    it('should handle empty arrays', () => {
      expect(sanitizeInterruptedTurns([])).toEqual([]);
    });

    it('should handle arrays with no interruption', () => {
      const turns: HistoryTurn[] = [
        {
          id: 'u1',
          content: { role: 'user', parts: [{ text: 'Hi' }] },
        },
        {
          id: 'm1',
          content: { role: 'model', parts: [{ text: 'Hello!' }] },
        },
      ];
      const result = sanitizeInterruptedTurns(turns);
      expect(result[0]).toBe(turns[0]);
      expect(result[1]).toBe(turns[1]);
    });
  });

  describe('sanitizeContentHistory', () => {
    it('should sanitize Content[] with interrupted model turns', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Do something' }] },
        { role: 'model', parts: [{ text: INTERRUPTED_RESPONSE_TEXT }] },
        { role: 'user', parts: [{ text: 'Next prompt' }] },
        { role: 'model', parts: [{ text: 'Normal answer' }] },
      ];
      const result = sanitizeContentHistory(history);
      expect(result).toHaveLength(4);
      expect(result[0]).toBe(history[0]);
      expect(result[1].parts![0].text).toBe(BENIGN_INTERRUPTION_REPLACEMENT);
      expect(result[2]).toBe(history[2]);
      expect(result[3]).toBe(history[3]);
    });

    it('should handle multiple consecutive interrupted turns', () => {
      const history: Content[] = [
        { role: 'model', parts: [{ text: INTERRUPTED_RESPONSE_TEXT }] },
        { role: 'model', parts: [{ text: INTERRUPTED_RESPONSE_TEXT }] },
      ];
      const result = sanitizeContentHistory(history);
      expect(result[0].parts![0].text).toBe(BENIGN_INTERRUPTION_REPLACEMENT);
      expect(result[1].parts![0].text).toBe(BENIGN_INTERRUPTION_REPLACEMENT);
    });

    it('should handle empty history', () => {
      expect(sanitizeContentHistory([])).toEqual([]);
    });
  });
});
