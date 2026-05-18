/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  hardenHistory,
  SYNTHETIC_THOUGHT_SIGNATURE,
} from './historyHardening.js';
import type { HistoryTurn } from '../core/agentChatHistory.js';
import { deriveStableId } from './cryptoUtils.js';
import type { Part } from '@google/genai';

describe('hardenHistory', () => {
  it('should return an empty array if input is empty', () => {
    expect(hardenHistory([])).toEqual([]);
  });

  it('should coalesce adjacent turns of the same role', () => {
    const history: HistoryTurn[] = [
      { id: '1', content: { role: 'user', parts: [{ text: 'hello' }] } },
      { id: '2', content: { role: 'user', parts: [{ text: 'world' }] } },
    ];
    const hardened = hardenHistory(history);
    expect(hardened.length).toBe(1);
    expect(hardened[0].content.parts).toEqual([
      { text: 'hello' },
      { text: 'world' },
    ]);
    expect(hardened[0].id).toBe('1'); // Inherits ID of the first turn in the sequence
  });

  it('should inject thoughtSignature into the first functionCall of a model turn if missing', () => {
    const history: HistoryTurn[] = [
      { id: '1', content: { role: 'user', parts: [{ text: 'do it' }] } },
      {
        id: '2',
        content: {
          role: 'model',
          parts: [{ functionCall: { name: 'myTool', args: {} } }],
        },
      },
      {
        id: '3',
        content: {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'myTool',
                response: { ok: true },
              },
            },
          ],
        },
      },
    ];

    const hardened = hardenHistory(history);
    const modelPart = hardened[1].content.parts![0];
    expect(modelPart).toHaveProperty(
      'thoughtSignature',
      SYNTHETIC_THOUGHT_SIGNATURE,
    );
  });

  it('should inject a sentinel user turn if history ends with a model turn', () => {
    const history: HistoryTurn[] = [
      { id: '1', content: { role: 'user', parts: [{ text: 'hello' }] } },
      { id: '2', content: { role: 'model', parts: [{ text: 'hi' }] } },
    ];

    const hardened = hardenHistory(history);
    expect(hardened.length).toBe(3);
    expect(hardened[2].content.role).toBe('user');
    expect(hardened[2].content.parts![0]).toEqual({ text: 'Please continue.' });
    expect(hardened[2].id).toBe(deriveStableId(['2', 'sentinel_end']));
  });

  it('should inject a sentinel user turn if history starts with a model turn', () => {
    const history: HistoryTurn[] = [
      { id: '1', content: { role: 'model', parts: [{ text: 'hi' }] } },
      { id: '2', content: { role: 'user', parts: [{ text: 'hello' }] } },
    ];

    const hardened = hardenHistory(history, {
      sentinels: { continuation: 'Custom start' },
    });
    expect(hardened.length).toBe(3);
    expect(hardened[0].content.role).toBe('user');
    expect(hardened[0].content.parts![0]).toEqual({ text: 'Custom start' });
    expect(hardened[0].id).toBe(deriveStableId(['1', 'sentinel_start']));
  });

  it('should inject sentinel responses for missing functionResponses', () => {
    const history: HistoryTurn[] = [
      { id: '1', content: { role: 'user', parts: [{ text: 'do it' }] } },
      {
        id: '2',
        content: {
          role: 'model',
          parts: [
            {
              functionCall: { id: 'call_1', name: 'toolA', args: {} },
              thoughtSignature: 'sig',
            },
            { functionCall: { id: 'call_2', name: 'toolB', args: {} } },
          ],
        },
      },
      // Note: Turn 3 is missing, so toolA and toolB have no responses
    ];

    const hardened = hardenHistory(history, {
      sentinels: { lostToolResponse: 'Lost.' },
    });

    // The history should now be: User -> Model -> User (sentinel responses) -> User (sentinel end)
    // Wait, the sentinel responses turn will satisfy the "ends with user" rule.
    expect(hardened.length).toBe(3);
    expect(hardened[2].content.role).toBe('user');
    expect(hardened[2].content.parts).toHaveLength(2);

    const resp1 = hardened[2].content.parts![0].functionResponse;
    expect(resp1?.id).toBe('call_1');
    expect(resp1?.response).toEqual({ error: 'Lost.' });

    const resp2 = hardened[2].content.parts![1].functionResponse;
    expect(resp2?.id).toBe('call_2');
    expect(resp2?.response).toEqual({ error: 'Lost.' });

    expect(hardened[2].id).toBe(deriveStableId(['2', 'sentinel_resp']));
  });

  it('should successfully match parallel tool calls and responses even if responses are originally split across separate user turns', () => {
    const history: HistoryTurn[] = [
      { id: '1', content: { role: 'user', parts: [{ text: 'do it' }] } },
      {
        id: '2',
        content: {
          role: 'model',
          parts: [
            {
              functionCall: { id: 'call_1', name: 'toolA', args: {} },
              thoughtSignature: 'sig',
            },
            { functionCall: { id: 'call_2', name: 'toolB', args: {} } },
          ],
        },
      },
      // Responses arrive as separate user turns
      {
        id: '3',
        content: {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call_1',
                name: 'toolA',
                response: { ok: true },
              },
            },
          ],
        },
      },
      {
        id: '4',
        content: {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call_2',
                name: 'toolB',
                response: { ok: true },
              },
            },
          ],
        },
      },
    ];

    // The hardener should coalesce Turn 3 and Turn 4 *before* it tries to pair them with Turn 2.
    // Otherwise, it would look at Turn 3, see 'call_2' is missing, inject a sentinel for 'call_2',
    // and then look at Turn 4 and consider 'call_2' to be orphaned.
    const hardened = hardenHistory(history);

    // Total turns: User(1), Model(2), User(3+4 merged)
    expect(hardened.length).toBe(3);

    const userResponseTurn = hardened[2];
    expect(userResponseTurn.content.role).toBe('user');
    expect(userResponseTurn.content.parts).toHaveLength(2);

    // Verify no sentinels were injected and original responses were preserved
    expect(userResponseTurn.content.parts![0].functionResponse?.id).toBe(
      'call_1',
    );
    expect(userResponseTurn.content.parts![1].functionResponse?.id).toBe(
      'call_2',
    );

    // Ensure no error properties exist
    expect(
      userResponseTurn.content.parts![0].functionResponse?.response,
    ).toEqual({ ok: true });
    expect(
      userResponseTurn.content.parts![1].functionResponse?.response,
    ).toEqual({ ok: true });
  });

  it('should synthesize a functionCall for a singleton orphaned functionResponse', () => {
    const history: HistoryTurn[] = [
      { id: '1', content: { role: 'user', parts: [{ text: 'hello' }] } },
      { id: '2', content: { role: 'model', parts: [{ text: 'hi' }] } },
      {
        id: '3',
        content: {
          role: 'user',
          parts: [
            { text: 'text is kept' },
            {
              functionResponse: { id: 'orphan_1', name: 'toolA', response: {} },
            },
          ],
        },
      },
    ];

    const hardened = hardenHistory(history);
    // Turn 1: user, Turn 2: model (with synthetic call), Turn 3: user
    expect(hardened.length).toBe(3);

    const modelTurn = hardened[1];
    expect(modelTurn.content.role).toBe('model');
    expect(modelTurn.content.parts).toHaveLength(2); // text + synthetic call
    expect(modelTurn.content.parts![1].functionCall).toBeDefined();
    expect(modelTurn.content.parts![1].functionCall?.id).toBe('orphan_1');
    expect(
      (modelTurn.content.parts![1] as unknown as { thoughtSignature: string })
        .thoughtSignature,
    ).toBe(SYNTHETIC_THOUGHT_SIGNATURE);

    const userTurn = hardened[2];
    expect(userTurn.content.parts).toHaveLength(2); // hoisted response + text
    expect(userTurn.content.parts![0].functionResponse?.id).toBe('orphan_1');
    expect(userTurn.content.parts![1]).toEqual({ text: 'text is kept' });
  });

  it('should synthesize functionCalls for multiple orphaned functionResponses in parallel', () => {
    const history: HistoryTurn[] = [
      {
        id: '1',
        content: { role: 'user', parts: [{ text: 'Parallel action' }] },
      },
      // Previous model turn exists but has NO tool calls
      {
        id: '2',
        content: { role: 'model', parts: [{ text: 'I will do nothing' }] },
      },
      {
        id: '3',
        content: {
          role: 'user',
          parts: [
            {
              functionResponse: { id: 'orphan_A', name: 'toolA', response: {} },
            },
            {
              functionResponse: { id: 'orphan_B', name: 'toolB', response: {} },
            },
            {
              functionResponse: { id: 'orphan_C', name: 'toolC', response: {} },
            },
          ],
        },
      },
    ];

    const hardened = hardenHistory(history);
    expect(hardened.length).toBe(3);

    const modelTurn = hardened[1];
    expect(modelTurn.content.role).toBe('model');
    expect(modelTurn.content.parts).toHaveLength(4); // original text + 3 synthetic calls

    // Only the FIRST function call should get the synthetic signature
    const callA = modelTurn.content.parts![1];
    expect(callA.functionCall?.id).toBe('orphan_A');
    expect(
      (callA as unknown as { thoughtSignature?: string }).thoughtSignature,
    ).toBe(SYNTHETIC_THOUGHT_SIGNATURE);

    const callB = modelTurn.content.parts![2];
    expect(callB.functionCall?.id).toBe('orphan_B');
    expect(
      (callB as unknown as { thoughtSignature?: string }).thoughtSignature,
    ).toBeUndefined();

    const callC = modelTurn.content.parts![3];
    expect(callC.functionCall?.id).toBe('orphan_C');
    expect(
      (callC as unknown as { thoughtSignature?: string }).thoughtSignature,
    ).toBeUndefined();

    const userTurn = hardened[2];
    expect(userTurn.content.parts).toHaveLength(3);
    expect(userTurn.content.parts![0].functionResponse?.id).toBe('orphan_A');
    expect(userTurn.content.parts![1].functionResponse?.id).toBe('orphan_B');
    expect(userTurn.content.parts![2].functionResponse?.id).toBe('orphan_C');
  });

  it('should hoist and re-order tool responses to match functionCall order', () => {
    const history: HistoryTurn[] = [
      { id: '1', content: { role: 'user', parts: [{ text: 'do it' }] } },
      {
        id: '2',
        content: {
          role: 'model',
          parts: [
            {
              functionCall: { id: 'c1', name: 'toolA', args: {} },
              thoughtSignature: 'sig',
            },
            { functionCall: { id: 'c2', name: 'toolB', args: {} } },
          ],
        },
      },
      {
        id: '3',
        content: {
          role: 'user',
          parts: [
            { text: 'some text' },
            { functionResponse: { id: 'c2', name: 'toolB', response: {} } },
            { functionResponse: { id: 'c1', name: 'toolA', response: {} } },
          ],
        },
      },
    ];

    const hardened = hardenHistory(history);
    expect(hardened[2].content.parts).toHaveLength(3);

    // Order should be: resp(c1) -> resp(c2) -> text
    const p0 = hardened[2].content.parts![0];
    const p1 = hardened[2].content.parts![1];
    const p2 = hardened[2].content.parts![2];

    expect(p0.functionResponse?.id).toBe('c1');
    expect(p1.functionResponse?.id).toBe('c2');
    expect(p2.text).toBe('some text');
  });

  it('should scrub non-standard properties from parts', () => {
    const history: HistoryTurn[] = [
      {
        id: '1',
        content: {
          role: 'user',
          parts: [
            {
              text: 'hello',
              extraProp: 'should be removed',
            } as unknown as Part,
          ],
        },
      },
    ];

    const hardened = hardenHistory(history);
    expect(hardened[0].content.parts![0]).not.toHaveProperty('extraProp');
    expect(hardened[0].content.parts![0]).toHaveProperty('text', 'hello');
  });
});
