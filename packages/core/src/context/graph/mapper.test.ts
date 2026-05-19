/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ContextGraphMapper } from './mapper.js';
import type { HistoryTurn } from '../../core/agentChatHistory.js';
import { hardenHistory } from '../../utils/historyHardening.js';

describe('ContextGraphMapper (Round-Trip Fidelity)', () => {
  it('should flawlessly round-trip a complex history containing parallel tool calls and responses', () => {
    // 1. Define a complex, worst-case scenario history
    const originalHistory: HistoryTurn[] = [
      {
        id: 'system_prompt_id',
        content: {
          role: 'user',
          parts: [{ text: '<session_context>\nSystem Prompt here' }],
        },
      },
      {
        id: 'user_turn_1',
        content: {
          role: 'user',
          parts: [{ text: 'Please read file A and file B at the same time.' }],
        },
      },
      {
        id: 'model_turn_1',
        content: {
          role: 'model',
          parts: [
            { text: 'I will read both files concurrently.' },
            {
              functionCall: {
                id: 'call_A',
                name: 'read_file',
                args: { path: 'A.txt' },
              },
              thoughtSignature: 'synthetic_sig_xyz',
            },
            {
              functionCall: {
                id: 'call_B',
                name: 'read_file',
                args: { path: 'B.txt' },
              },
            },
          ],
        },
      },
      // Note: GeminiChat records these as separate sequential user turns initially
      {
        id: 'tool_resp_B_id',
        content: {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call_B',
                name: 'read_file',
                response: { content: 'File B' },
              },
            },
          ],
        },
      },
      {
        id: 'tool_resp_A_id',
        content: {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call_A',
                name: 'read_file',
                response: { content: 'File A' },
              },
            },
          ],
        },
      },
    ];

    // 2. We harden the original history first. The core agent loop feeds the hardener the pure history.
    // We want our round-tripped history to match what the hardener WOULD have produced natively.
    const hardenedOriginal = hardenHistory(originalHistory);

    // 3. Translate History -> Graph
    const mapper = new ContextGraphMapper();
    // Simulate the HistoryObserver capturing the push
    const nodes = mapper.applyEvent({
      type: 'SYNC_FULL',
      payload: originalHistory,
    });

    // 4. Translate Graph -> History
    const reconstructedHistory = mapper.fromGraph(nodes);

    // 5. Harden the reconstructed history (as the ContextManager does before sending to API)
    const hardenedReconstructed = hardenHistory(reconstructedHistory);

    // 6. Assert Absolute Equality
    // The round-trip through the Context Graph and Hardener must exactly equal
    // the original history put through the Hardener.
    expect(hardenedReconstructed).toEqual(hardenedOriginal);
  });
});
