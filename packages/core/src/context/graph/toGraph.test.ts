/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ContextGraphBuilder } from './toGraph.js';
import type { BaseConcreteNode } from './types.js';
import { NodeIdService } from './nodeIdService.js';
import type { HistoryTurn } from '../../core/agentChatHistory.js';

describe('ContextGraphBuilder', () => {
  describe('toGraph', () => {
    it('should skip legacy <session_context> headers even if they appear later in the history', () => {
      const history: HistoryTurn[] = [
        {
          id: '1',
          content: { role: 'user', parts: [{ text: 'Message 1' }] },
        },
        {
          id: '2',
          content: { role: 'model', parts: [{ text: 'Reply 1' }] },
        },
        {
          id: '3',
          content: {
            role: 'user',
            parts: [
              {
                text: '<session_context>\nThis is the Gemini CLI\nSome context...',
              },
            ],
          },
        },
        {
          id: '4',
          content: { role: 'user', parts: [{ text: 'Message 2' }] },
        },
      ];

      const builder = new ContextGraphBuilder(new NodeIdService());
      const nodes = builder.processHistory(history);

      // We expect the first two messages and the last one to be present
      // The session context message should be filtered out
      expect(nodes.length).toBe(3);
      expect((nodes[0] as BaseConcreteNode).payload.text).toBe('Message 1');
      expect((nodes[1] as BaseConcreteNode).payload.text).toBe('Reply 1');
      expect((nodes[2] as BaseConcreteNode).payload.text).toBe('Message 2');
    });

    it('should generate completely deterministic graph structure and UUIDs across JSON serialization cycles', () => {
      vi.spyOn(Date, 'now').mockReturnValue(0);

      const complexHistory: HistoryTurn[] = [
        {
          id: 'turn-1',
          content: {
            role: 'user',
            parts: [{ text: 'Step 1: complex analysis' }],
          },
        },
        {
          id: 'turn-2',
          content: {
            role: 'model',
            parts: [
              { text: 'Thinking about the tool to use.' },
              {
                functionCall: {
                  name: 'fetch_data',
                  args: { query: 'test data' },
                },
              },
            ],
          },
        },
        {
          id: 'turn-3',
          content: {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'fetch_data',
                  response: { status: 'success', data: [1, 2, 3] },
                },
              },
            ],
          },
        },
        {
          id: 'turn-4',
          content: { role: 'model', parts: [{ text: 'Analysis complete.' }] },
        },
      ];

      // 1. Initial Graph Generation
      const builder1 = new ContextGraphBuilder(new NodeIdService());
      const nodes1 = builder1.processHistory(complexHistory);

      // 2. Serialize and Deserialize (Simulating saving and loading from disk)
      const serializedHistory = JSON.stringify(complexHistory);
      const parsedHistory = JSON.parse(serializedHistory) as HistoryTurn[];

      // 3. Second Graph Generation from parsed JSON
      const builder2 = new ContextGraphBuilder(new NodeIdService());
      const nodes2 = builder2.processHistory(parsedHistory);

      // Assertion: The arrays must be completely identical, including all generated UUIDs
      expect(nodes1).toEqual(nodes2);

      // Sanity check to ensure IDs are actually populated and consistent
      expect(nodes1.length).toBeGreaterThan(0);
      nodes1.forEach((node, index) => {
        expect(node.id).toBeDefined();
        expect(node.id).toBe(nodes2[index].id);
        expect(node.timestamp).toBe(0);
        if ('turnId' in node) {
          expect(node.turnId).toBeDefined();
          expect(node.turnId).toBe((nodes2[index] as BaseConcreteNode).turnId);
        }
      });

      vi.restoreAllMocks();
    });
  });
});
