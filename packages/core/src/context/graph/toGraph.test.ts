/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ContextGraphBuilder } from './toGraph.js';
import type { Content } from '@google/genai';
import type { BaseConcreteNode } from './types.js';

describe('ContextGraphBuilder', () => {
  describe('toGraph', () => {
    it('should skip legacy <session_context> headers even if they appear later in the history', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Message 1' }] },
        { role: 'model', parts: [{ text: 'Reply 1' }] },
        {
          role: 'user',
          parts: [
            {
              text: '<session_context>\nThis is the Gemini CLI\nSome context...',
            },
          ],
        },
        { role: 'user', parts: [{ text: 'Message 2' }] },
      ];

      const builder = new ContextGraphBuilder();
      const nodes = builder.processHistory(history);

      // We expect the first two messages and the last one to be present
      // The session context message should be filtered out
      expect(nodes.length).toBe(3);
      expect((nodes[0] as BaseConcreteNode).payload.text).toBe('Message 1');
      expect((nodes[1] as BaseConcreteNode).payload.text).toBe('Reply 1');
      expect((nodes[2] as BaseConcreteNode).payload.text).toBe('Message 2');
    });
  });
});
