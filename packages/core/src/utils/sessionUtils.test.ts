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

    expect(history).toEqual([
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] },
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

    expect(history).toEqual([
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

    expect(history).toEqual([
      {
        role: 'user',
        parts: [
          { text: 'Look at this image' },
          { inlineData: { mimeType: 'image/png', data: 'base64data' } },
        ],
      },
    ]);
  });

  it('should deduplicate function calls by id when already present in content', () => {
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
          { functionCall: { name: 'ls', args: { dir: '.' }, id: 'call123' } },
        ],
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
    const modelTurn = history[1];
    const functionCalls =
      modelTurn?.parts
        .filter((p) => !!p.functionCall)
        .map((p) => p.functionCall) ?? [];

    expect(functionCalls).toHaveLength(1);
    expect(functionCalls[0]?.id).toBe('call123');
  });

  it('should deduplicate by stable args fingerprint with count-based matching when content function calls have no id', () => {
    const messages: ConversationRecord['messages'] = [
      {
        id: 'msg1',
        type: 'user',
        timestamp: '2024-01-01T10:00:00Z',
        content: 'Run tool',
      },
      {
        id: 'msg2',
        type: 'gemini',
        timestamp: '2024-01-01T10:01:00Z',
        content: [
          {
            functionCall: {
              name: 'ls',
              args: { dir: '.', options: { recursive: true, depth: 1 } },
            },
          },
          {
            functionCall: {
              name: 'ls',
              args: { options: { depth: 1, recursive: true }, dir: '.' },
            },
          },
        ],
        toolCalls: [
          {
            id: 'call1',
            name: 'ls',
            args: { options: { recursive: true, depth: 1 }, dir: '.' },
            status: CoreToolCallStatus.Success,
            timestamp: '2024-01-01T10:01:05Z',
            result: 'first',
          },
          {
            id: 'call2',
            name: 'ls',
            args: { dir: '.', options: { depth: 1, recursive: true } },
            status: CoreToolCallStatus.Success,
            timestamp: '2024-01-01T10:01:06Z',
            result: 'second',
          },
          {
            id: 'call3',
            name: 'ls',
            args: { dir: '.', options: { depth: 1, recursive: true } },
            status: CoreToolCallStatus.Success,
            timestamp: '2024-01-01T10:01:07Z',
            result: 'third',
          },
        ],
      },
    ];

    const history = convertSessionToClientHistory(messages);
    const modelTurn = history[1];
    const functionCalls =
      modelTurn?.parts
        .filter((p) => !!p.functionCall)
        .map((p) => p.functionCall) ?? [];

    expect(functionCalls).toHaveLength(3);
    expect(functionCalls[0]?.id).toBeUndefined();
    expect(functionCalls[1]?.id).toBeUndefined();
    expect(functionCalls[2]?.id).toBe('call3');
  });
});
