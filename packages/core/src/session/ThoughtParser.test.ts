/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { extractThoughts, parseStreamingThoughts } from './ThoughtParser.js';

describe('ThoughtParser', () => {
  describe('extractThoughts', () => {
    it('extracts <thought> tag from text and removes it from content', () => {
      const input = '<thought>\nEvaluating event loop phases.\n</thought>\nNode.js uses libuv.';
      const result = extractThoughts(input);

      expect(result.thought).toBe('Evaluating event loop phases.');
      expect(result.content).toBe('Node.js uses libuv.');
    });

    it('extracts <think> tag from text (DeepSeek / local models)', () => {
      const input = '<think>Internal reasoning step</think>Final answer.';
      const result = extractThoughts(input);

      expect(result.thought).toBe('Internal reasoning step');
      expect(result.content).toBe('Final answer.');
    });

    it('returns original content when no thought tags are present', () => {
      const input = 'Just a standard response without thoughts.';
      const result = extractThoughts(input);

      expect(result.thought).toBeUndefined();
      expect(result.content).toBe('Just a standard response without thoughts.');
    });

    it('handles empty thought tags gracefully', () => {
      const input = '<thought>   </thought>Some text.';
      const result = extractThoughts(input);

      expect(result.thought).toBeUndefined();
      expect(result.content).toBe('Some text.');
    });
  });

  describe('parseStreamingThoughts', () => {
    it('detects active in-flight thought when tag is not closed', () => {
      const streamInput = '<thought>Thinking through the architecture...';
      const result = parseStreamingThoughts(streamInput);

      expect(result.isThinking).toBe(true);
      expect(result.thought).toBe('Thinking through the architecture...');
      expect(result.content).toBe('');
    });

    it('detects completed thought and separates subsequent content', () => {
      const streamInput = '<thought>Done reasoning.</thought> Here is the explanation.';
      const result = parseStreamingThoughts(streamInput);

      expect(result.isThinking).toBe(false);
      expect(result.thought).toBe('Done reasoning.');
      expect(result.content).toBe('Here is the explanation.');
    });

    it('handles normal stream without thought tags', () => {
      const streamInput = 'Streaming regular tokens...';
      const result = parseStreamingThoughts(streamInput);

      expect(result.isThinking).toBe(false);
      expect(result.thought).toBeUndefined();
      expect(result.content).toBe('Streaming regular tokens...');
    });
  });
});
