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

  it('should not duplicate explicit tool response turns on resume', () => {
    const toolResponse = {
      functionResponse: {
        id: 'toolu_1',
        name: 'web_fetch',
        response: { output: 'page content' },
      },
    };
    const messages: ConversationRecord['messages'] = [
      {
        id: 'msg1',
        type: 'user',
        timestamp: '2024-01-01T10:00:00Z',
        content: 'Fetch this page',
      },
      {
        id: 'msg2',
        type: 'gemini',
        timestamp: '2024-01-01T10:01:00Z',
        content: [
          { text: 'Let me fetch it.' },
          {
            functionCall: {
              id: 'toolu_1',
              name: 'web_fetch',
              args: { url: 'https://example.com' },
            },
          },
        ],
        toolCalls: [
          {
            id: 'toolu_1',
            name: 'web_fetch',
            args: { url: 'https://example.com' },
            status: CoreToolCallStatus.Success,
            timestamp: '2024-01-01T10:01:05Z',
            result: [toolResponse],
          },
        ],
      },
      {
        id: 'msg3',
        type: 'user',
        timestamp: '2024-01-01T10:01:06Z',
        content: [toolResponse],
      },
    ];

    const history = convertSessionToClientHistory(messages);

    expect(history.map((h) => h.content)).toEqual([
      { role: 'user', parts: [{ text: 'Fetch this page' }] },
      {
        role: 'model',
        parts: [
          { text: 'Let me fetch it.' },
          {
            functionCall: {
              id: 'toolu_1',
              name: 'web_fetch',
              args: { url: 'https://example.com' },
            },
          },
        ],
      },
      { role: 'user', parts: [toolResponse] },
    ]);
  });

  it('should deduplicate grouped tool results stored on multiple tool calls', () => {
    const groupedResults = [
      {
        functionResponse: {
          id: 'call1',
          name: 'read_file',
          response: { output: 'file contents' },
        },
      },
      {
        functionResponse: {
          id: 'call2',
          name: 'list_files',
          response: { output: 'file.txt' },
        },
      },
    ];
    const messages: ConversationRecord['messages'] = [
      {
        id: 'msg1',
        type: 'user',
        timestamp: '2024-01-01T10:00:00Z',
        content: 'Inspect the project',
      },
      {
        id: 'msg2',
        type: 'gemini',
        timestamp: '2024-01-01T10:01:00Z',
        content: 'I will inspect it.',
        toolCalls: [
          {
            id: 'call1',
            name: 'read_file',
            args: { path: 'README.md' },
            status: CoreToolCallStatus.Success,
            timestamp: '2024-01-01T10:01:05Z',
            result: groupedResults,
          },
          {
            id: 'call2',
            name: 'list_files',
            args: { dir: '.' },
            status: CoreToolCallStatus.Success,
            timestamp: '2024-01-01T10:01:06Z',
            result: groupedResults,
          },
        ],
      },
    ];

    const history = convertSessionToClientHistory(messages);

    expect(history.map((h) => h.content)).toEqual([
      { role: 'user', parts: [{ text: 'Inspect the project' }] },
      {
        role: 'model',
        parts: [
          { text: 'I will inspect it.' },
          {
            functionCall: {
              id: 'call1',
              name: 'read_file',
              args: { path: 'README.md' },
            },
          },
          {
            functionCall: {
              id: 'call2',
              name: 'list_files',
              args: { dir: '.' },
            },
          },
        ],
      },
      { role: 'user', parts: groupedResults },
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
