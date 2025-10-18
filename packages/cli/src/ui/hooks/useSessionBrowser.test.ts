/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { convertSessionToHistoryFormats } from './useSessionBrowser.js';
import { MessageType, ToolCallStatus } from '../types.js';
import type { MessageRecord } from '@google/gemini-cli-core';

describe('convertSessionToHistoryFormats', () => {
  it('should convert empty messages array', () => {
    const result = convertSessionToHistoryFormats([]);

    expect(result.uiHistory).toEqual([]);
    expect(result.clientHistory).toEqual([]);
  });

  it('should convert basic user and gemini messages', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: 'Hello',
        type: 'user',
      },
      {
        id: 'msg-2',
        timestamp: '2025-01-01T00:02:00Z',
        content: 'Hi there!',
        type: 'gemini',
      },
    ];

    const result = convertSessionToHistoryFormats(messages);

    expect(result.uiHistory).toHaveLength(2);
    expect(result.uiHistory[0]).toEqual({
      type: MessageType.USER,
      text: 'Hello',
    });
    expect(result.uiHistory[1]).toEqual({
      type: MessageType.GEMINI,
      text: 'Hi there!',
    });

    expect(result.clientHistory).toHaveLength(2);
    expect(result.clientHistory[0]).toEqual({
      role: 'user',
      parts: [{ text: 'Hello' }],
    });
    expect(result.clientHistory[1]).toEqual({
      role: 'model',
      parts: [{ text: 'Hi there!' }],
    });
  });

  it('should filter out slash commands from client history', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: '/help',
        type: 'user',
      },
      {
        id: 'msg-2',
        timestamp: '2025-01-01T00:02:00Z',
        content: '?quit',
        type: 'user',
      },
      {
        id: 'msg-3',
        timestamp: '2025-01-01T00:03:00Z',
        content: 'Regular message',
        type: 'user',
      },
    ];

    const result = convertSessionToHistoryFormats(messages);

    // All messages should appear in UI history
    expect(result.uiHistory).toHaveLength(3);

    // Only non-slash commands should appear in client history
    expect(result.clientHistory).toHaveLength(1);
    expect(result.clientHistory[0]).toEqual({
      role: 'user',
      parts: [{ text: 'Regular message' }],
    });
  });

  it('should handle tool calls correctly', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: "I'll help you with that.",
        type: 'gemini',
        toolCalls: [
          {
            id: 'tool-1',
            name: 'bash',
            displayName: 'Execute Command',
            description: 'Run bash command',
            args: { command: 'ls -la' },
            status: 'success',
            timestamp: '2025-01-01T00:01:30Z',
            resultDisplay: 'total 4\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 .',
            renderOutputAsMarkdown: false,
          },
          {
            id: 'tool-2',
            name: 'read',
            displayName: 'Read File',
            description: 'Read file contents',
            args: { path: '/etc/hosts' },
            status: 'error',
            timestamp: '2025-01-01T00:01:45Z',
            resultDisplay: 'Permission denied',
          },
        ],
      },
    ];

    const result = convertSessionToHistoryFormats(messages);

    expect(result.uiHistory).toHaveLength(2); // text message + tool group
    expect(result.uiHistory[0]).toEqual({
      type: MessageType.GEMINI,
      text: "I'll help you with that.",
    });

    expect(result.uiHistory[1].type).toBe('tool_group');
    // This if-statement is only necessary because TypeScript can't tell that the toBe() assertion
    // protects the .tools access below.
    if (result.uiHistory[1].type === 'tool_group') {
      expect(result.uiHistory[1].tools).toHaveLength(2);
      expect(result.uiHistory[1].tools[0]).toEqual({
        callId: 'tool-1',
        name: 'Execute Command',
        description: 'Run bash command',
        renderOutputAsMarkdown: false,
        status: ToolCallStatus.Success,
        resultDisplay: 'total 4\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 .',
        confirmationDetails: undefined,
      });
      expect(result.uiHistory[1].tools[1]).toEqual({
        callId: 'tool-2',
        name: 'Read File',
        description: 'Read file contents',
        renderOutputAsMarkdown: true, // default value
        status: ToolCallStatus.Error,
        resultDisplay: 'Permission denied',
        confirmationDetails: undefined,
      });
    }
  });

  it('should skip empty tool calls arrays', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: 'Message with empty tools',
        type: 'gemini',
        toolCalls: [],
      },
    ];

    const result = convertSessionToHistoryFormats(messages);

    expect(result.uiHistory).toHaveLength(1); // Only text message
    expect(result.uiHistory[0]).toEqual({
      type: MessageType.GEMINI,
      text: 'Message with empty tools',
    });
  });

  it('should not add tool calls for user messages', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: 'User message',
        type: 'user',
        // This would be invalid in real usage, but testing robustness
        toolCalls: [
          {
            id: 'tool-1',
            name: 'invalid',
            args: {},
            status: 'success',
            timestamp: '2025-01-01T00:01:30Z',
          },
        ],
      } as MessageRecord,
    ];

    const result = convertSessionToHistoryFormats(messages);

    expect(result.uiHistory).toHaveLength(1); // Only user message, no tool group
    expect(result.uiHistory[0]).toEqual({
      type: MessageType.USER,
      text: 'User message',
    });
  });

  it('should handle missing tool call fields gracefully', () => {
    const messages: MessageRecord[] = [
      {
        id: 'msg-1',
        timestamp: '2025-01-01T00:01:00Z',
        content: 'Message with minimal tool',
        type: 'gemini',
        toolCalls: [
          {
            id: 'tool-1',
            name: 'minimal_tool',
            args: {},
            status: 'success',
            timestamp: '2025-01-01T00:01:30Z',
            // Missing optional fields
          },
        ],
      },
    ];

    const result = convertSessionToHistoryFormats(messages);

    expect(result.uiHistory).toHaveLength(2);
    expect(result.uiHistory[1].type).toBe('tool_group');
    if (result.uiHistory[1].type === 'tool_group') {
      expect(result.uiHistory[1].tools[0]).toEqual({
        callId: 'tool-1',
        name: 'minimal_tool', // Falls back to name when displayName missing
        description: '', // Default empty string
        renderOutputAsMarkdown: true, // Default value
        status: ToolCallStatus.Success,
        resultDisplay: undefined,
        confirmationDetails: undefined,
      });
    } else {
      throw new Error('unreachable');
    }
  });

  describe('tool calls in client history', () => {
    it('should convert tool calls to correct Gemini client history format', () => {
      const messages: MessageRecord[] = [
        {
          id: 'msg-1',
          timestamp: '2025-01-01T00:01:00Z',
          content: 'List files',
          type: 'user',
        },
        {
          id: 'msg-2',
          timestamp: '2025-01-01T00:02:00Z',
          content: "I'll list the files for you.",
          type: 'gemini',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'list_directory',
              args: { path: '/home/user' },
              result: {
                functionResponse: {
                  id: 'list_directory-1753650620141-f3b8b9e73919d',
                  name: 'list_directory',
                  response: {
                    output: 'file1.txt\nfile2.txt',
                  },
                },
              },
              status: 'success',
              timestamp: '2025-01-01T00:02:30Z',
            },
          ],
        },
      ];

      const result = convertSessionToHistoryFormats(messages);

      // Should have: user message, model with function call, user with function response
      expect(result.clientHistory).toHaveLength(3);

      // User message
      expect(result.clientHistory[0]).toEqual({
        role: 'user',
        parts: [{ text: 'List files' }],
      });

      // Model message with function call
      expect(result.clientHistory[1]).toEqual({
        role: 'model',
        parts: [
          { text: "I'll list the files for you." },
          {
            functionCall: {
              name: 'list_directory',
              args: { path: '/home/user' },
              id: 'tool-1',
            },
          },
        ],
      });

      // Function response
      expect(result.clientHistory[2]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'list_directory-1753650620141-f3b8b9e73919d',
              name: 'list_directory',
              response: { output: 'file1.txt\nfile2.txt' },
            },
          },
        ],
      });
    });

    it('should handle tool calls without text content', () => {
      const messages: MessageRecord[] = [
        {
          id: 'msg-1',
          timestamp: '2025-01-01T00:01:00Z',
          content: '',
          type: 'gemini',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'bash',
              args: { command: 'ls' },
              result: 'file1.txt\nfile2.txt',
              status: 'success',
              timestamp: '2025-01-01T00:01:30Z',
            },
          ],
        },
      ];

      const result = convertSessionToHistoryFormats(messages);

      expect(result.clientHistory).toHaveLength(2);

      // Model message with only function call (no text)
      expect(result.clientHistory[0]).toEqual({
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'bash',
              args: { command: 'ls' },
              id: 'tool-1',
            },
          },
        ],
      });

      // Function response
      expect(result.clientHistory[1]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'tool-1',
              name: 'bash',
              response: {
                output: 'file1.txt\nfile2.txt',
              },
            },
          },
        ],
      });
    });

    it('should handle multiple tool calls in one message', () => {
      const messages: MessageRecord[] = [
        {
          id: 'msg-1',
          timestamp: '2025-01-01T00:01:00Z',
          content: 'Running multiple commands',
          type: 'gemini',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'bash',
              args: { command: 'pwd' },
              result: '/home/user',
              status: 'success',
              timestamp: '2025-01-01T00:01:30Z',
            },
            {
              id: 'tool-2',
              name: 'bash',
              args: { command: 'ls' },
              result: [
                {
                  functionResponse: {
                    id: 'tool-2',
                    name: 'bash',
                    response: {
                      output: 'file1.txt',
                    },
                  },
                },
                {
                  functionResponse: {
                    id: 'tool-2',
                    name: 'bash',
                    response: {
                      output: 'file2.txt',
                    },
                  },
                },
              ],
              status: 'success',
              timestamp: '2025-01-01T00:01:35Z',
            },
          ],
        },
      ];

      const result = convertSessionToHistoryFormats(messages);

      // Should have: model with both function calls, then one response
      expect(result.clientHistory).toHaveLength(2);

      // Model message with both function calls
      expect(result.clientHistory[0]).toEqual({
        role: 'model',
        parts: [
          { text: 'Running multiple commands' },
          {
            functionCall: {
              name: 'bash',
              args: { command: 'pwd' },
              id: 'tool-1',
            },
          },
          {
            functionCall: {
              name: 'bash',
              args: { command: 'ls' },
              id: 'tool-2',
            },
          },
        ],
      });

      // First function response
      expect(result.clientHistory[1]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'tool-1',
              name: 'bash',
              response: { output: '/home/user' },
            },
          },
          {
            functionResponse: {
              id: 'tool-2',
              name: 'bash',
              response: { output: 'file1.txt' },
            },
          },
          {
            functionResponse: {
              id: 'tool-2',
              name: 'bash',
              response: { output: 'file2.txt' },
            },
          },
        ],
      });
    });

    it('should handle Part array results from tools', () => {
      const messages: MessageRecord[] = [
        {
          id: 'msg-1',
          timestamp: '2025-01-01T00:01:00Z',
          content: 'Reading file',
          type: 'gemini',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'read_file',
              args: { path: 'test.txt' },
              result: [
                {
                  functionResponse: {
                    id: 'tool-1',
                    name: 'read_file',
                    response: {
                      output: 'Hello',
                    },
                  },
                },
                {
                  functionResponse: {
                    id: 'tool-1',
                    name: 'read_file',
                    response: {
                      output: ' World',
                    },
                  },
                },
              ],
              status: 'success',
              timestamp: '2025-01-01T00:01:30Z',
            },
          ],
        },
      ];

      const result = convertSessionToHistoryFormats(messages);

      expect(result.clientHistory).toHaveLength(2);

      // Function response should extract both function responses
      expect(result.clientHistory[1]).toEqual({
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'tool-1',
              name: 'read_file',
              response: {
                output: 'Hello',
              },
            },
          },
          {
            functionResponse: {
              id: 'tool-1',
              name: 'read_file',
              response: {
                output: ' World',
              },
            },
          },
        ],
      });
    });

    it('should skip tool calls without results', () => {
      const messages: MessageRecord[] = [
        {
          id: 'msg-1',
          timestamp: '2025-01-01T00:01:00Z',
          content: 'Testing tool',
          type: 'gemini',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'test_tool',
              args: { arg: 'value' },
              // No result field
              status: 'error',
              timestamp: '2025-01-01T00:01:30Z',
            },
          ],
        },
      ];

      const result = convertSessionToHistoryFormats(messages);

      // Should only have the model message with function call, no function response
      expect(result.clientHistory).toHaveLength(1);

      expect(result.clientHistory[0]).toEqual({
        role: 'model',
        parts: [
          { text: 'Testing tool' },
          {
            functionCall: {
              name: 'test_tool',
              args: { arg: 'value' },
              id: 'tool-1',
            },
          },
        ],
      });
    });
  });
});
