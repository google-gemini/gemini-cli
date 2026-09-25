/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { type Part } from '@google/genai';
import { convertSessionToClientHistory } from './sessionUtils.js';
import { type ConversationRecord } from '../services/chatRecordingService.js';
import { type HistoryTurn } from '../core/agentChatHistory.js';
import { CoreToolCallStatus } from '../scheduler/types.js';

describe('convertSessionToClientHistory', () => {
  it('should convert a simple conversation without tool calls', () => {
    const messages: ConversationRecord['messages'] = [
      {
        id: '1',
        type: 'user',
        timestamp: '2024-01-01T10:00:00Z',
        content: 'Hello',
      },
      {
        id: '2',
        type: 'gemini',
        timestamp: '2024-01-01T10:01:00Z',
        content: 'Hi there',
      },
    ];

    const history = convertSessionToClientHistory(messages);

    expect(history.map((h) => h.content)).toEqual([
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] },
    ]);
  });

  it('should convert thinking tokens (thoughts) to model parts', () => {
    const messages: ConversationRecord['messages'] = [
      {
        id: '1',
        type: 'user',
        timestamp: '2024-01-01T10:00:00Z',
        content: 'Hello',
      },
      {
        id: '2',
        type: 'gemini',
        timestamp: '2024-01-01T10:01:00Z',
        content: 'Hi there',
        thoughts: [
          {
            subject: 'Thinking',
            description: 'I should be polite.',
            timestamp: '2024-01-01T10:00:50Z',
          },
        ],
      },
    ];

    const history = convertSessionToClientHistory(messages);

    expect(history.map((h) => h.content)).toEqual([
      { role: 'user', parts: [{ text: 'Hello' }] },
      {
        role: 'model',
        parts: [
          { text: '**Thinking** I should be polite.', thought: true },
          { text: 'Hi there' },
        ],
      },
    ]);
  });

  it('should ignore info, error, and slash commands', () => {
    const messages: ConversationRecord['messages'] = [
      {
        id: '1',
        type: 'info',
        timestamp: '2024-01-01T10:00:00Z',
        content: 'System info',
      },
      {
        id: '2',
        type: 'user',
        timestamp: '2024-01-01T10:01:00Z',
        content: '/clear',
      },
      {
        id: '3',
        type: 'user',
        timestamp: '2024-01-01T10:02:00Z',
        content: '?help',
      },
      {
        id: '4',
        type: 'user',
        timestamp: '2024-01-01T10:03:00Z',
        content: 'Actual query',
      },
    ];

    const history = convertSessionToClientHistory(messages);

    expect(history.map((h) => h.content)).toEqual([
      { role: 'user', parts: [{ text: 'Actual query' }] },
    ]);
  });

  it('should ignore <session_context> and <hook_context>', () => {
    const messages: ConversationRecord['messages'] = [
      {
        id: '1',
        type: 'user',
        timestamp: '2024-01-01T10:00:00Z',
        content: '<session_context>\nOld context\n</session_context>',
      },
      {
        id: '2',
        type: 'user',
        timestamp: '2024-01-01T10:01:00Z',
        content: '<hook_context>\nOld hook context\n</hook_context>',
      },
      {
        id: '3',
        type: 'user',
        timestamp: '2024-01-01T10:02:00Z',
        content: 'Actual query',
      },
    ];

    const history = convertSessionToClientHistory(messages);

    expect(history.map((h) => h.content)).toEqual([
      { role: 'user', parts: [{ text: 'Actual query' }] },
    ]);
  });

  it('should correctly map tool calls and their responses', () => {
    const messages: ConversationRecord['messages'] = [
      {
        id: 'msg1',
        type: 'user',
        timestamp: '2024-01-01T10:00:00Z',
        content: 'List files',
      },
      {
        id: 'msg2',
        type: 'gemini',
        timestamp: '2024-01-01T10:01:00Z',
        content: 'Let me check.',
        toolCalls: [
          {
            id: 'call123',
            name: 'ls',
            args: { dir: '.' },
            status: CoreToolCallStatus.Success,
            timestamp: '2024-01-01T10:01:05Z',
            result: 'file.txt',
          },
        ],
      },
    ];

    const history = convertSessionToClientHistory(messages);

    expect(history.map((h) => h.content)).toEqual([
      { role: 'user', parts: [{ text: 'List files' }] },
      {
        role: 'model',
        parts: [
          { text: 'Let me check.' },
          { functionCall: { name: 'ls', args: { dir: '.' }, id: 'call123' } },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call123',
              name: 'ls',
              response: { output: 'file.txt' },
            },
          },
        ],
      },
    ]);
  });

  it('should preserve multi-modal parts (inlineData)', () => {
    const messages: ConversationRecord['messages'] = [
      {
        id: 'msg1',
        type: 'user',
        timestamp: '2024-01-01T10:00:00Z',
        content: [
          { text: 'Look at this image' },
          { inlineData: { mimeType: 'image/png', data: 'base64data' } },
        ],
      },
    ];

    const history = convertSessionToClientHistory(messages);

    expect(history.map((h) => h.content)).toEqual([
      {
        role: 'user',
        parts: [
          { text: 'Look at this image' },
          { inlineData: { mimeType: 'image/png', data: 'base64data' } },
        ],
      },
    ]);
  });

  describe('tool responses recorded as user messages', () => {
    const fr = (id: string, output = `${id} output`): Part => ({
      functionResponse: { id, name: 'read_file', response: { output } },
    });

    const toolCall = (id: string, result: Part[] | string) => ({
      id,
      name: 'read_file',
      args: {},
      status: CoreToolCallStatus.Success,
      timestamp: '2024-01-01T10:01:05Z',
      result,
    });

    const responseIds = (history: HistoryTurn[]) =>
      history.flatMap((h) =>
        (h.content.parts ?? []).flatMap((p) =>
          p.functionResponse ? [p.functionResponse.id] : [],
        ),
      );

    it('should not regenerate a response that is already recorded', () => {
      const messages: ConversationRecord['messages'] = [
        {
          id: 'u1',
          type: 'user',
          timestamp: '2024-01-01T10:00:00Z',
          content: 'Read the note',
        },
        {
          id: 'm1',
          type: 'gemini',
          timestamp: '2024-01-01T10:01:00Z',
          content: '',
          toolCalls: [toolCall('call_a', [fr('call_a')])],
        },
        {
          id: 'r1',
          type: 'user',
          timestamp: '2024-01-01T10:01:06Z',
          content: [fr('call_a')],
        },
      ];

      const history = convertSessionToClientHistory(messages);

      expect(history.map((h) => h.id)).toEqual(['u1', 'm1', 'r1']);
      expect(responseIds(history)).toEqual(['call_a']);
    });

    it('should keep one response per parallel call', () => {
      const messages: ConversationRecord['messages'] = [
        {
          id: 'm1',
          type: 'gemini',
          timestamp: '2024-01-01T10:01:00Z',
          content: '',
          toolCalls: [
            toolCall('call_a', [fr('call_a')]),
            toolCall('call_b', [fr('call_b')]),
          ],
        },
        {
          id: 'r1',
          type: 'user',
          timestamp: '2024-01-01T10:01:06Z',
          content: [fr('call_a'), fr('call_b')],
        },
      ];

      const history = convertSessionToClientHistory(messages);

      expect(history.map((h) => h.id)).toEqual(['m1', 'r1']);
      expect(responseIds(history)).toEqual(['call_a', 'call_b']);
    });

    it('should collapse duplicate responses persisted by earlier resumes', () => {
      const bloated = [fr('call_a'), fr('call_b')];
      const messages: ConversationRecord['messages'] = [
        {
          id: 'm1',
          type: 'gemini',
          timestamp: '2024-01-01T10:01:00Z',
          content: '',
          toolCalls: [toolCall('call_a', bloated), toolCall('call_b', bloated)],
        },
        {
          id: 'm1_response',
          type: 'user',
          timestamp: '2024-01-01T10:01:06Z',
          content: [...bloated, ...bloated],
        },
        {
          id: 'r1',
          type: 'user',
          timestamp: '2024-01-01T10:01:06Z',
          content: bloated,
        },
        {
          id: 'u2',
          type: 'user',
          timestamp: '2024-01-01T10:02:00Z',
          content: 'What did it say?',
        },
      ];

      const history = convertSessionToClientHistory(messages);

      expect(history.map((h) => h.id)).toEqual(['m1', 'm1_response', 'u2']);
      expect(responseIds(history)).toEqual(['call_a', 'call_b']);
    });

    it('should regenerate only the calls without a recorded response', () => {
      const messages: ConversationRecord['messages'] = [
        {
          id: 'm1',
          type: 'gemini',
          timestamp: '2024-01-01T10:01:00Z',
          content: '',
          toolCalls: [
            toolCall('call_a', [fr('call_a')]),
            toolCall('call_b', [fr('call_b')]),
          ],
        },
        {
          id: 'r1',
          type: 'user',
          timestamp: '2024-01-01T10:01:06Z',
          content: [fr('call_a')],
        },
      ];

      const history = convertSessionToClientHistory(messages);

      expect(history.map((h) => h.id)).toEqual(['m1', 'm1_response', 'r1']);
      expect(responseIds(history)).toEqual(['call_b', 'call_a']);
    });

    it('should treat a call id reused in a later turn as a separate call', () => {
      const messages: ConversationRecord['messages'] = [
        {
          id: 'm1',
          type: 'gemini',
          timestamp: '2024-01-01T10:01:00Z',
          content: '',
          toolCalls: [toolCall('call_0', 'first')],
        },
        {
          id: 'u2',
          type: 'user',
          timestamp: '2024-01-01T10:02:00Z',
          content: 'Again',
        },
        {
          id: 'm2',
          type: 'gemini',
          timestamp: '2024-01-01T10:03:00Z',
          content: '',
          toolCalls: [toolCall('call_0', [fr('call_0', 'second')])],
        },
        {
          id: 'r2',
          type: 'user',
          timestamp: '2024-01-01T10:03:06Z',
          content: [fr('call_0', 'second')],
        },
      ];

      const history = convertSessionToClientHistory(messages);

      expect(history.map((h) => h.id)).toEqual([
        'm1',
        'm1_response',
        'u2',
        'm2',
        'r2',
      ]);
      expect(
        history.flatMap((h) =>
          (h.content.parts ?? []).flatMap((p) =>
            p.functionResponse ? [p.functionResponse.response] : [],
          ),
        ),
      ).toEqual([{ output: 'first' }, { output: 'second' }]);
    });
  });
});
