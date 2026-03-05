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

  describe('compression marker handling', () => {
    it('should use compressed history from marker and only process post-marker messages', () => {
      const messages: ConversationRecord['messages'] = [
        {
          id: '1',
          type: 'user',
          timestamp: '2024-01-01T10:00:00Z',
          content: 'Old message A',
        },
        {
          id: '2',
          type: 'gemini',
          timestamp: '2024-01-01T10:01:00Z',
          content: 'Old response A',
        },
        {
          id: '3',
          type: 'user',
          timestamp: '2024-01-01T10:02:00Z',
          content: 'Old message B',
        },
        {
          id: '4',
          type: 'gemini',
          timestamp: '2024-01-01T10:03:00Z',
          content: 'Old response B',
        },
        {
          id: 'marker-1',
          type: 'compression_marker',
          timestamp: '2024-01-01T10:04:00Z',
          content: 'Context was compressed.',
          compressedHistory: [
            { role: 'user', parts: [{ text: 'Summary of conversation' }] },
            {
              role: 'model',
              parts: [{ text: 'Got it. Thanks for the additional context!' }],
            },
          ],
        },
        {
          id: '5',
          type: 'user',
          timestamp: '2024-01-01T10:05:00Z',
          content: 'New message after compression',
        },
        {
          id: '6',
          type: 'gemini',
          timestamp: '2024-01-01T10:06:00Z',
          content: 'New response after compression',
        },
      ];

      const history = convertSessionToClientHistory(messages);

      // Should contain the compressed history + only post-marker messages
      expect(history).toEqual([
        {
          role: 'user',
          parts: [{ text: 'Summary of conversation' }],
        },
        {
          role: 'model',
          parts: [{ text: 'Got it. Thanks for the additional context!' }],
        },
        {
          role: 'user',
          parts: [{ text: 'New message after compression' }],
        },
        {
          role: 'model',
          parts: [{ text: 'New response after compression' }],
        },
      ]);
    });

    it('should use the last compression marker when multiple exist', () => {
      const messages: ConversationRecord['messages'] = [
        {
          id: '1',
          type: 'user',
          timestamp: '2024-01-01T10:00:00Z',
          content: 'Very old message',
        },
        {
          id: 'marker-1',
          type: 'compression_marker',
          timestamp: '2024-01-01T10:01:00Z',
          content: 'Context was compressed.',
          compressedHistory: [
            { role: 'user', parts: [{ text: 'First summary' }] },
            { role: 'model', parts: [{ text: 'Acknowledged first summary' }] },
          ],
        },
        {
          id: '2',
          type: 'user',
          timestamp: '2024-01-01T10:02:00Z',
          content: 'Message between compressions',
        },
        {
          id: '3',
          type: 'gemini',
          timestamp: '2024-01-01T10:03:00Z',
          content: 'Response between compressions',
        },
        {
          id: 'marker-2',
          type: 'compression_marker',
          timestamp: '2024-01-01T10:04:00Z',
          content: 'Context was compressed.',
          compressedHistory: [
            { role: 'user', parts: [{ text: 'Second summary (latest)' }] },
            {
              role: 'model',
              parts: [{ text: 'Acknowledged second summary' }],
            },
          ],
        },
        {
          id: '4',
          type: 'user',
          timestamp: '2024-01-01T10:05:00Z',
          content: 'Final message',
        },
      ];

      const history = convertSessionToClientHistory(messages);

      // Should only use the LAST marker's compressed history + post-marker messages
      expect(history).toEqual([
        {
          role: 'user',
          parts: [{ text: 'Second summary (latest)' }],
        },
        {
          role: 'model',
          parts: [{ text: 'Acknowledged second summary' }],
        },
        {
          role: 'user',
          parts: [{ text: 'Final message' }],
        },
      ]);
    });

    it('should handle compression marker with no subsequent messages', () => {
      const messages: ConversationRecord['messages'] = [
        {
          id: '1',
          type: 'user',
          timestamp: '2024-01-01T10:00:00Z',
          content: 'Old message',
        },
        {
          id: 'marker-1',
          type: 'compression_marker',
          timestamp: '2024-01-01T10:01:00Z',
          content: 'Context was compressed.',
          compressedHistory: [
            { role: 'user', parts: [{ text: 'Summary' }] },
            { role: 'model', parts: [{ text: 'Got it' }] },
          ],
        },
      ];

      const history = convertSessionToClientHistory(messages);

      expect(history).toEqual([
        { role: 'user', parts: [{ text: 'Summary' }] },
        { role: 'model', parts: [{ text: 'Got it' }] },
      ]);
    });
  });
});
