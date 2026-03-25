/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { CoreToolCallStatus } from '../scheduler/types.js';
import { AgentTerminateMode } from '../agents/types.js';
import { conversationRecordSchema } from './conversationRecordSchema.js';
import type { ZodIssue } from 'zod';

describe('conversationRecordSchema', () => {
  it('parses a fully valid conversation record', () => {
    const validConversation = {
      sessionId: 'session-123',
      projectHash: 'project-hash-abc',
      startTime: '2026-03-25T10:00:00.000Z',
      lastUpdated: '2026-03-25T10:05:00.000Z',
      summary: 'Session summary',
      directories: ['C:/repo', 'C:/repo/packages/core'],
      kind: 'main' as const,
      messages: [
        {
          id: 'user-msg-1',
          timestamp: '2026-03-25T10:00:01.000Z',
          type: 'user' as const,
          content: [{ text: 'Please inspect this file.' }],
        },
        {
          id: 'assistant-msg-1',
          timestamp: '2026-03-25T10:00:10.000Z',
          type: 'gemini' as const,
          model: 'gemini-2.5-pro',
          content: [
            {
              text: 'Running the tool now.',
              thought: true,
              thoughtSignature: 'sig-1',
            },
            {
              functionCall: {
                name: 'read_file',
                id: 'call-1',
                args: { filePath: 'README.md' },
              },
            },
          ],
          displayContent: 'Running read_file... ',
          toolCalls: [
            {
              id: 'call-1',
              name: 'read_file',
              args: { filePath: 'README.md' },
              status: CoreToolCallStatus.Success,
              timestamp: '2026-03-25T10:00:09.000Z',
              result: [
                {
                  functionResponse: {
                    name: 'read_file',
                    id: 'call-1',
                    response: { output: 'File content...' },
                  },
                },
              ],
              displayName: 'Read File',
              description: 'Read README.md',
              resultDisplay: {
                isSubagentProgress: true,
                agentName: 'Explore',
                recentActivity: [
                  {
                    id: 'activity-1',
                    type: 'thought',
                    content: 'Searching files',
                    status: 'running',
                  },
                ],
                state: 'completed',
                result: 'Done',
                terminateReason: AgentTerminateMode.GOAL,
              },
              renderOutputAsMarkdown: false,
            },
          ],
          thoughts: [
            {
              subject: 'Search',
              description: 'Looking for target files',
              timestamp: '2026-03-25T10:00:08.000Z',
            },
          ],
          tokens: {
            input: 20,
            output: 15,
            cached: 0,
            thoughts: 4,
            tool: 8,
            total: 43,
          },
        },
      ],
    };

    const parsed = conversationRecordSchema.parse(validConversation);
    expect(parsed.sessionId).toBe('session-123');
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[1].type).toBe('gemini');
  });

  it('rejects a missing required top-level field', () => {
    const invalidConversation = {
      projectHash: 'project-hash-abc',
      startTime: '2026-03-25T10:00:00.000Z',
      lastUpdated: '2026-03-25T10:05:00.000Z',
      messages: [],
    };

    const result = conversationRecordSchema.safeParse(invalidConversation);
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['sessionId']);
      expect(result.error.issues[0]?.code).toBe('invalid_type');
    }
  });

  it('rejects incorrect nested scalar types', () => {
    const invalidConversation = {
      sessionId: 'session-123',
      projectHash: 'project-hash-abc',
      startTime: '2026-03-25T10:00:00.000Z',
      lastUpdated: '2026-03-25T10:05:00.000Z',
      messages: [
        {
          id: 'assistant-msg-1',
          timestamp: '2026-03-25T10:00:10.000Z',
          type: 'gemini',
          content: [{ text: 'ok' }],
          tokens: {
            input: 10,
            output: 5,
            cached: 0,
            total: '15',
          },
        },
      ],
    };

    const result = conversationRecordSchema.safeParse(invalidConversation);
    expect(result.success).toBe(false);

    if (!result.success) {
      const totalIssue = result.error.issues.find(
        (issue: ZodIssue) =>
          issue.path.join('.') === 'messages.0.tokens.total',
      );
      expect(totalIssue).toBeDefined();
      expect(totalIssue?.code).toBe('invalid_type');
    }
  });

  it('rejects invalid message and tool status discriminator values', () => {
    const invalidConversation = {
      sessionId: 'session-123',
      projectHash: 'project-hash-abc',
      startTime: '2026-03-25T10:00:00.000Z',
      lastUpdated: '2026-03-25T10:05:00.000Z',
      messages: [
        {
          id: 'bad-msg-1',
          timestamp: '2026-03-25T10:00:10.000Z',
          type: 'assistant',
          content: [{ text: 'hello' }],
          toolCalls: [
            {
              id: 'call-1',
              name: 'read_file',
              args: {},
              status: 'done',
              timestamp: '2026-03-25T10:00:09.000Z',
            },
          ],
        },
      ],
    };

    const result = conversationRecordSchema.safeParse(invalidConversation);
    expect(result.success).toBe(false);
  });

  it('rejects malformed tool call payloads and resultDisplay shapes', () => {
    const invalidConversation = {
      sessionId: 'session-123',
      projectHash: 'project-hash-abc',
      startTime: '2026-03-25T10:00:00.000Z',
      lastUpdated: '2026-03-25T10:05:00.000Z',
      messages: [
        {
          id: 'assistant-msg-1',
          timestamp: '2026-03-25T10:00:10.000Z',
          type: 'gemini',
          content: [{ text: 'ok' }],
          toolCalls: [
            {
              id: 'call-1',
              name: 'read_file',
              args: 'not-an-object',
              status: CoreToolCallStatus.Success,
              timestamp: '2026-03-25T10:00:09.000Z',
              resultDisplay: {
                todos: [
                  {
                    description: 'Do thing',
                    status: 'UNKNOWN',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = conversationRecordSchema.safeParse(invalidConversation);
    expect(result.success).toBe(false);

    if (!result.success) {
      const argsIssue = result.error.issues.find(
        (issue: ZodIssue) =>
          issue.path.join('.') === 'messages.0.toolCalls.0.args',
      );
      expect(argsIssue).toBeDefined();
    }
  });

  it('rejects malformed PartListUnion variants', () => {
    const invalidConversation = {
      sessionId: 'session-123',
      projectHash: 'project-hash-abc',
      startTime: '2026-03-25T10:00:00.000Z',
      lastUpdated: '2026-03-25T10:05:00.000Z',
      messages: [
        {
          id: 'assistant-msg-1',
          timestamp: '2026-03-25T10:00:10.000Z',
          type: 'gemini',
          content: [
            {
              functionResponse: {
                name: 'read_file',
                id: 'call-1',
                response: { output: 'ok' },
                parts: [{ bad: 'shape' }],
              },
            },
          ],
        },
      ],
    };

    const result = conversationRecordSchema.safeParse(invalidConversation);
    expect(result.success).toBe(false);
  });

  it('allows nullable fields where explicitly nullable', () => {
    const validConversation = {
      sessionId: 'session-123',
      projectHash: 'project-hash-abc',
      startTime: '2026-03-25T10:00:00.000Z',
      lastUpdated: '2026-03-25T10:05:00.000Z',
      messages: [
        {
          id: 'assistant-msg-1',
          timestamp: '2026-03-25T10:00:10.000Z',
          type: 'gemini',
          content: [{ text: 'ok' }],
          tokens: null,
          toolCalls: [
            {
              id: 'call-1',
              name: 'read_file',
              args: {},
              status: CoreToolCallStatus.Success,
              timestamp: '2026-03-25T10:00:09.000Z',
              result: null,
            },
          ],
        },
      ],
    };

    const result = conversationRecordSchema.safeParse(validConversation);
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields on strict objects', () => {
    const invalidConversation = {
      sessionId: 'session-123',
      projectHash: 'project-hash-abc',
      startTime: '2026-03-25T10:00:00.000Z',
      lastUpdated: '2026-03-25T10:05:00.000Z',
      messages: [],
      extraTopLevelField: true,
    };

    const result = conversationRecordSchema.safeParse(invalidConversation);
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
    }
  });
});
