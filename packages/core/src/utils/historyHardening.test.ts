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

  it('should drop orphaned functionResponses', () => {
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
    expect(hardened.length).toBe(3);
    expect(hardened[2].content.parts).toHaveLength(1);
    expect(hardened[2].content.parts![0]).toEqual({ text: 'text is kept' });
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
