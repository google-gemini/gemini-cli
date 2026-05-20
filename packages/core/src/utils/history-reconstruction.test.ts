/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { type Content } from '@google/genai';
import { reconstructHistory } from './history-reconstruction.js';
import { type MessageRecord } from '../services/chatRecordingTypes.js';
import { CoreToolCallStatus } from '../scheduler/types.js';

describe('reconstructHistory', () => {
  it('should return an empty array for empty input', () => {
    expect(reconstructHistory([])).toEqual([]);
  });

  it('should reconstruct simple text turns', () => {
    const messages: MessageRecord[] = [
      { id: '1', timestamp: '...', type: 'user', content: 'hello' },
      { id: '2', timestamp: '...', type: 'gemini', content: 'hi' },
    ];
    const expected = [
      { role: 'user', parts: [{ text: 'hello' }] },
      { role: 'model', parts: [{ text: 'hi' }] },
    ];
    expect(reconstructHistory(messages)).toEqual(expected);
  });

  it('should handle array content with mixed strings and Parts', () => {
    const messages: MessageRecord[] = [
      {
        id: '1',
        timestamp: '...',
        type: 'user',
        content: [
          'text1',
          { text: 'text2' },
          { inlineData: { mimeType: 'image/png', data: 'base64...' } },
        ],
      },
    ];
    const expected = [
      {
        role: 'user',
        parts: [
          { text: 'text1' },
          { text: 'text2' },
          { inlineData: { mimeType: 'image/png', data: 'base64...' } },
        ],
      },
    ];
    expect(reconstructHistory(messages)).toEqual(expected);
  });

  it('should include function calls in gemini turns and skip empty model content', () => {
    const messages: MessageRecord[] = [
      {
        id: '1',
        timestamp: '...',
        type: 'gemini',
        content: '', // Real logs often have empty string content when tool calls are present
        toolCalls: [
          {
            id: 'call-1',
            name: 'test-tool',
            args: { a: 1 },
            status: CoreToolCallStatus.Success,
            timestamp: '...',
          },
        ],
      },
    ];
    const expected = [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'test-tool',
              args: { a: 1 },
              id: 'call-1',
            },
          },
        ],
      },
    ];
    expect(reconstructHistory(messages)).toEqual(expected);
  });

  it('should generate a subsequent user turn for tool results using functionResponse parts', () => {
    // This matches the format seen in real .jsonl logs
    const messages: MessageRecord[] = [
      {
        id: '1',
        timestamp: '...',
        type: 'gemini',
        content: '',
        toolCalls: [
          {
            id: 'call-1',
            name: 'read_file',
            args: { file_path: 'foo.txt' },
            status: CoreToolCallStatus.Success,
            timestamp: '...',
            result: [
              {
                functionResponse: {
                  id: 'call-1',
                  name: 'read_file',
                  response: { output: 'hello world' },
                },
              },
            ],
          },
        ],
      },
    ];
    const expected = [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'read_file',
              args: { file_path: 'foo.txt' },
              id: 'call-1',
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call-1',
              name: 'read_file',
              response: { output: 'hello world' },
            },
          },
        ],
      },
    ];
    expect(reconstructHistory(messages)).toEqual(expected);
  });

  it('should handle multiple tool calls in a single turn', () => {
    const messages: MessageRecord[] = [
      {
        id: '1',
        timestamp: '...',
        type: 'gemini',
        content: 'I will do two things.',
        toolCalls: [
          {
            id: 'c1',
            name: 't1',
            args: {},
            status: CoreToolCallStatus.Success,
            timestamp: '...',
            result: [
              {
                functionResponse: { id: 'c1', name: 't1', response: { r: 1 } },
              },
            ],
          },
          {
            id: 'c2',
            name: 't2',
            args: {},
            status: CoreToolCallStatus.Success,
            timestamp: '...',
            result: [
              {
                functionResponse: { id: 'c2', name: 't2', response: { r: 2 } },
              },
            ],
          },
        ],
      },
    ];

    const expected = [
      {
        role: 'model',
        parts: [
          { text: 'I will do two things.' },
          { functionCall: { id: 'c1', name: 't1', args: {} } },
          { functionCall: { id: 'c2', name: 't2', args: {} } },
        ],
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { id: 'c1', name: 't1', response: { r: 1 } } },
          { functionResponse: { id: 'c2', name: 't2', response: { r: 2 } } },
        ],
      },
    ];
    expect(reconstructHistory(messages)).toEqual(expected);
  });

  it('should maintain fidelity to established history structure (regression test)', () => {
    const messages: MessageRecord[] = [
      {
        id: 'user-1',
        timestamp: '...',
        type: 'user',
        content: [{ text: 'List files and show an image.' }],
      },
      {
        id: 'model-1',
        timestamp: '...',
        type: 'gemini',
        content: 'I will list the files.',
        toolCalls: [
          {
            id: 'call-1',
            name: 'list_files',
            args: { path: '.' },
            status: CoreToolCallStatus.Success,
            timestamp: '...',
            result: [{ text: 'file1.txt\nfile2.png' }],
          },
        ],
      },
      {
        id: 'user-2',
        timestamp: '...',
        type: 'user',
        content: [
          { text: 'Analyze this image.' },
          { inlineData: { data: 'base64...', mimeType: 'image/png' } },
        ],
      },
    ];

    const expected: Content[] = [
      {
        role: 'user',
        parts: [{ text: 'List files and show an image.' }],
      },
      {
        role: 'model',
        parts: [
          { text: 'I will list the files.' },
          {
            functionCall: {
              name: 'list_files',
              args: { path: '.' },
              id: 'call-1',
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [{ text: 'file1.txt\nfile2.png' }],
      },
      {
        role: 'user',
        parts: [
          { text: 'Analyze this image.' },
          { inlineData: { data: 'base64...', mimeType: 'image/png' } },
        ],
      },
    ];

    const result = reconstructHistory(messages);
    expect(result).toEqual(expected);
  });
});
