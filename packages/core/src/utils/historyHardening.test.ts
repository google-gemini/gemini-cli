/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  hardenHistory,
  scrubHistory,
  SYNTHETIC_THOUGHT_SIGNATURE,
} from './historyHardening.js';
import type { Content, Part } from '@google/genai';

interface TestThoughtPart extends Part {
  thought_signature?: string;
  thoughtSignature?: string;
}

describe('historyHardening', () => {
  describe('hardenHistory (Signatures)', () => {
    it('should inject snake_case thought_signature on first function call', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        {
          role: 'model',
          parts: [
            { functionCall: { name: 'tool1', args: {} } },
            { functionCall: { name: 'tool2', args: {} } },
          ],
        },
        { role: 'user', parts: [{ text: 'response' }] },
      ];

      const hardened = hardenHistory(history);
      const modelTurn = hardened[1];

      const part0 = modelTurn.parts![0] as TestThoughtPart;
      const part1 = modelTurn.parts![1] as TestThoughtPart;

      expect(part0.thought_signature).toBe(SYNTHETIC_THOUGHT_SIGNATURE);
      expect(part1.thought_signature).toBeUndefined();
    });

    it('should preserve existing snake_case thought_signature', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: { name: 'tool1', args: {} },
              thought_signature: 'existing-sig',
            } as TestThoughtPart,
          ],
        },
        { role: 'user', parts: [{ text: 'response' }] },
      ];

      const hardened = hardenHistory(history);
      const part = hardened[1].parts![0] as TestThoughtPart;
      expect(part.thought_signature).toBe('existing-sig');
    });

    it('should convert camelCase thoughtSignature to snake_case thought_signature', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: { name: 'tool1', args: {} },
              thoughtSignature: 'camel-sig',
            } as TestThoughtPart,
          ],
        },
        { role: 'user', parts: [{ text: 'response' }] },
      ];

      const hardened = hardenHistory(history);
      const part = hardened[1].parts![0] as TestThoughtPart;
      expect(part.thought_signature).toBe('camel-sig');
      expect(part).not.toHaveProperty('thoughtSignature');
    });
  });

  describe('scrubHistory', () => {
    it('should preserve thought_signature and drop thoughtSignature after conversion', () => {
      const history: Content[] = [
        {
          role: 'model',
          parts: [
            {
              text: 'Thinking...',
              thought_signature: 'real-sig',
            } as TestThoughtPart,
            {
              text: 'Legacy thinking',
              thoughtSignature: 'legacy-sig',
            } as TestThoughtPart,
          ],
        },
      ];

      const scrubbed = scrubHistory(history);

      const part0 = scrubbed[0].parts![0] as TestThoughtPart;
      const part1 = scrubbed[0].parts![1] as TestThoughtPart;

      expect(part0.thought_signature).toBe('real-sig');
      expect(part1.thought_signature).toBe('legacy-sig');
      expect(part1).not.toHaveProperty('thoughtSignature');
    });

    it('should drop unknown internal properties but keep standard ones', () => {
      const history: Content[] = [
        {
          role: 'model',
          parts: [
            {
              functionCall: { name: 'tool', args: {} },
              ...({ internalTrackId: 'xyz' } as Record<string, unknown>),
            } as Part,
          ],
        },
      ];

      const scrubbed = scrubHistory(history);
      const part = scrubbed[0].parts![0];

      expect(part.functionCall).toBeDefined();
      expect(part.functionCall?.name).toBe('tool');
      expect(part).not.toHaveProperty('internalTrackId');
    });
  });
});
