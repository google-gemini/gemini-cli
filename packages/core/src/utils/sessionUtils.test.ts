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

    expect(history).toEqual([
      {
        id: 'msg1',
        content: { role: 'user', parts: [{ text: 'List files' }] },
      },
      {
        id: 'msg2',
        content: {
          role: 'model',
          parts: [
            { text: 'Let me check.' },
            { functionCall: { name: 'ls', args: { dir: '.' }, id: 'call123' } },
          ],
        },
      },
      {
        id: 'msg2_response',
        content: {
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
      },
    ]);
  });

  it('should not synthesize duplicate tool response turns when a recorded user functionResponse turn follows', () => {
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
        content: [
          { text: 'Let me check.' },
          { functionCall: { id: 'call123', name: 'ls', args: { dir: '.' } } },
        ],
        toolCalls: [
          {
            id: 'call123',
            name: 'ls',
            args: { dir: '.' },
            status: CoreToolCallStatus.Success,
            timestamp: '2024-01-01T10:01:05Z',
            result: [
              {
                functionResponse: {
                  id: 'call123',
                  name: 'ls',
                  response: { output: 'file.txt' },
                },
              },
            ],
          },
        ],
      },
      {
        id: 'msg3',
        type: 'user',
        timestamp: '2024-01-01T10:01:06Z',
        content: [
          {
            functionResponse: {
              id: 'call123',
              name: 'ls',
              response: { output: 'file.txt' },
            },
          },
        ],
      },
    ];

    const history = convertSessionToClientHistory(messages);

    expect(history).toEqual([
      {
        id: 'msg1',
        content: { role: 'user', parts: [{ text: 'List files' }] },
      },
      {
        id: 'msg2',
        content: {
          role: 'model',
          parts: [
            { text: 'Let me check.' },
            { functionCall: { id: 'call123', name: 'ls', args: { dir: '.' } } },
          ],
        },
      },
      {
        id: 'msg3',
        content: {
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
      },
    ]);
  });

  it('should handle parallel tool calls in a single turn without duplicating responses', () => {
    const respA = {
      functionResponse: {
        id: 'callA',
        name: 'read_file',
        response: { output: 'contents A' },
      },
    };
    const respB = {
      functionResponse: {
        id: 'callB',
        name: 'read_file',
        response: { output: 'contents B' },
      },
    };

    const messages: ConversationRecord['messages'] = [
      {
        id: 'msg1',
        type: 'user',
        timestamp: '2024-01-01T10:00:00Z',
        content: 'Read both files',
      },
      {
        id: 'msg2',
        type: 'gemini',
        timestamp: '2024-01-01T10:01:00Z',
        content: [
          {
            functionCall: {
              id: 'callA',
              name: 'read_file',
              args: { path: 'a.txt' },
            },
          },
          {
            functionCall: {
              id: 'callB',
              name: 'read_file',
              args: { path: 'b.txt' },
            },
          },
        ],
        toolCalls: [
          {
            id: 'callA',
            name: 'read_file',
            args: { path: 'a.txt' },
            status: CoreToolCallStatus.Success,
            timestamp: '2024-01-01T10:01:05Z',
            result: [respA, respB],
          },
          {
            id: 'callB',
            name: 'read_file',
            args: { path: 'b.txt' },
            status: CoreToolCallStatus.Success,
            timestamp: '2024-01-01T10:01:05Z',
            result: [respA, respB],
          },
        ],
      },
      {
        id: 'msg3',
        type: 'user',
        timestamp: '2024-01-01T10:01:06Z',
        content: [respA, respB],
      },
    ];

    const history = convertSessionToClientHistory(messages);

    expect(history).toEqual([
      {
        id: 'msg1',
        content: { role: 'user', parts: [{ text: 'Read both files' }] },
      },
      {
        id: 'msg2',
        content: {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'callA',
                name: 'read_file',
                args: { path: 'a.txt' },
              },
            },
            {
              functionCall: {
                id: 'callB',
                name: 'read_file',
                args: { path: 'b.txt' },
              },
            },
          ],
        },
      },
      {
        id: 'msg3',
        content: {
          role: 'user',
          parts: [respA, respB],
        },
      },
    ]);
  });

  it('should deduplicate already corrupted history containing duplicate functionResponse parts', () => {
    const dupResp = {
      functionResponse: {
        id: 'call123',
        name: 'ls',
        response: { output: 'file.txt' },
      },
    };

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
        content: [
          { functionCall: { id: 'call123', name: 'ls', args: { dir: '.' } } },
        ],
        toolCalls: [
          {
            id: 'call123',
            name: 'ls',
            args: { dir: '.' },
            status: CoreToolCallStatus.Success,
            timestamp: '2024-01-01T10:01:05Z',
            result: [dupResp, dupResp],
          },
        ],
      },
      {
        id: 'msg2_response',
        type: 'user',
        timestamp: '2024-01-01T10:01:05Z',
        content: [dupResp, dupResp],
      },
      {
        id: 'msg3',
        type: 'user',
        timestamp: '2024-01-01T10:01:06Z',
        content: [dupResp],
      },
    ];

    const history = convertSessionToClientHistory(messages);

    expect(history).toEqual([
      {
        id: 'msg1',
        content: { role: 'user', parts: [{ text: 'List files' }] },
      },
      {
        id: 'msg2',
        content: {
          role: 'model',
          parts: [
            { functionCall: { id: 'call123', name: 'ls', args: { dir: '.' } } },
          ],
        },
      },
      {
        id: 'msg2_response',
        content: {
          role: 'user',
          parts: [dupResp],
        },
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
});
