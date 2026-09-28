/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { convertSessionToClientHistory } from './sessionUtils.js';
import { type ConversationRecord } from '../services/chatRecordingService.js';
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

  describe('issue #29365 - avoid duplicating tool response turns on resume', () => {
    it('should not duplicate tool responses in modern sessions where tool response is recorded as a user message', () => {
      const messages: ConversationRecord['messages'] = [
        {
          id: 'user_prompt',
          type: 'user',
          timestamp: '2024-01-01T10:00:00Z',
          content: 'Run command',
        },
        {
          id: 'model_call',
          type: 'gemini',
          timestamp: '2024-01-01T10:01:00Z',
          content: 'Running...',
          toolCalls: [
            {
              id: 'call_1',
              name: 'run_shell_command',
              args: { command: 'echo hello' },
              status: CoreToolCallStatus.Success,
              timestamp: '2024-01-01T10:01:05Z',
              result: [
                {
                  functionResponse: {
                    id: 'call_1',
                    name: 'run_shell_command',
                    response: { output: 'hello\n' },
                  },
                },
              ],
            },
          ],
        },
        {
          id: 'synthetic_tool_resp',
          type: 'user',
          timestamp: '2024-01-01T10:01:06Z',
          content: [
            {
              functionResponse: {
                id: 'call_1',
                name: 'run_shell_command',
                response: { output: 'hello\n' },
              },
            },
          ],
        },
        {
          id: 'model_final',
          type: 'gemini',
          timestamp: '2024-01-01T10:01:10Z',
          content: 'Done!',
        },
      ];

      const history = convertSessionToClientHistory(messages);

      // Verify that there is exactly ONE response turn for call_1, not two
      const responseTurns = history.filter(
        (h) =>
          h.content.role === 'user' &&
          h.content.parts.some((p) => !!p.functionResponse),
      );
      expect(responseTurns).toHaveLength(1);
      expect(responseTurns[0].id).toBe('synthetic_tool_resp');
      expect(history.map((h) => h.id)).toEqual([
        'user_prompt',
        'model_call',
        'synthetic_tool_resp',
        'model_final',
      ]);
    });

    it('should not duplicate parallel tool calls across multiple turns', () => {
      const messages: ConversationRecord['messages'] = [
        {
          id: 'user_prompt',
          type: 'user',
          timestamp: '2024-01-01T10:00:00Z',
          content: 'Run parallel',
        },
        {
          id: 'model_call',
          type: 'gemini',
          timestamp: '2024-01-01T10:01:00Z',
          content: '',
          toolCalls: [
            {
              id: 'call_a',
              name: 'tool_a',
              args: {},
              status: CoreToolCallStatus.Success,
              timestamp: '2024-01-01T10:01:05Z',
              result: [{ functionResponse: { id: 'call_a', name: 'tool_a', response: { output: 'a' } } }],
            },
            {
              id: 'call_b',
              name: 'tool_b',
              args: {},
              status: CoreToolCallStatus.Success,
              timestamp: '2024-01-01T10:01:05Z',
              result: [{ functionResponse: { id: 'call_b', name: 'tool_b', response: { output: 'b' } } }],
            },
          ],
        },
        {
          id: 'user_parallel_resp',
          type: 'user',
          timestamp: '2024-01-01T10:01:06Z',
          content: [
            { functionResponse: { id: 'call_a', name: 'tool_a', response: { output: 'a' } } },
            { functionResponse: { id: 'call_b', name: 'tool_b', response: { output: 'b' } } },
          ],
        },
      ];

      const history = convertSessionToClientHistory(messages);

      const userTurns = history.filter((h) => h.content.role === 'user');
      expect(userTurns).toHaveLength(2); // user_prompt + user_parallel_resp
      const parallelRespTurn = userTurns[1];
      expect(parallelRespTurn.id).toBe('user_parallel_resp');
      expect(parallelRespTurn.content.parts).toHaveLength(2);
      expect(parallelRespTurn.content.parts[0].functionResponse?.id).toBe('call_a');
      expect(parallelRespTurn.content.parts[1].functionResponse?.id).toBe('call_b');
    });

    it('should deduplicate corrupted sessions containing duplicate recorded functionResponse user messages', () => {
      const messages: ConversationRecord['messages'] = [
        {
          id: 'model_call',
          type: 'gemini',
          timestamp: '2024-01-01T10:01:00Z',
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              name: 'tool_1',
              args: {},
              status: CoreToolCallStatus.Success,
              timestamp: '2024-01-01T10:01:05Z',
              result: [{ functionResponse: { id: 'call_1', name: 'tool_1', response: { output: 'ok' } } }],
            },
          ],
        },
        // Duplicate user turns from prior buggy resume checkpoint:
        {
          id: 'model_call_response',
          type: 'user',
          timestamp: '2024-01-01T10:01:06Z',
          content: [{ functionResponse: { id: 'call_1', name: 'tool_1', response: { output: 'ok' } } }],
        },
        {
          id: 'synthetic_orig',
          type: 'user',
          timestamp: '2024-01-01T10:01:07Z',
          content: [{ functionResponse: { id: 'call_1', name: 'tool_1', response: { output: 'ok' } } }],
        },
      ];

      const history = convertSessionToClientHistory(messages);

      const respTurns = history.filter(
        (h) =>
          h.content.role === 'user' &&
          h.content.parts.some((p) => !!p.functionResponse),
      );
      expect(respTurns).toHaveLength(1);
    });
  });
});
