/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { forkCommand, parseForkArgs } from './forkCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext } from './types.js';
import type { ForkSessionResult } from '@google/gemini-cli-core';

describe('parseForkArgs', () => {
  it('handles empty args', () => {
    expect(parseForkArgs('')).toEqual({ stay: false, name: undefined });
    expect(parseForkArgs('   ')).toEqual({ stay: false, name: undefined });
  });

  it('parses custom fork name', () => {
    expect(parseForkArgs('try-redis')).toEqual({
      stay: false,
      name: 'try-redis',
    });
    expect(parseForkArgs('  experiment with caching  ')).toEqual({
      stay: false,
      name: 'experiment with caching',
    });
  });

  it('parses --stay flag with or without name in any position', () => {
    expect(parseForkArgs('--stay')).toEqual({ stay: true, name: undefined });
    expect(parseForkArgs('--stay try-redis')).toEqual({
      stay: true,
      name: 'try-redis',
    });
    expect(parseForkArgs('try-redis --stay')).toEqual({
      stay: true,
      name: 'try-redis',
    });
    expect(parseForkArgs('try --stay redis cache')).toEqual({
      stay: true,
      name: 'try redis cache',
    });
  });
});

describe('forkCommand', () => {
  let mockContext: CommandContext;
  let mockGetConversationAsync: ReturnType<typeof vi.fn>;
  let mockForkAsync: ReturnType<typeof vi.fn>;
  let mockResumeChat: ReturnType<typeof vi.fn>;
  let mockSetSessionId: ReturnType<typeof vi.fn>;

  const sampleForkResult: ForkSessionResult = {
    sessionId: '22222222-2222-4222-8222-222222222222',
    sourceSessionId: '11111111-1111-4111-8111-111111111111',
    filePath: '/tmp/chats/session-2026-11-24T20-00-22222222.jsonl',
    conversation: {
      sessionId: '22222222-2222-4222-8222-222222222222',
      projectHash: 'abc123',
      startTime: '2026-11-24T20:00:00.000Z',
      lastUpdated: '2026-11-24T20:00:00.000Z',
      summary: 'Hello world (fork)',
      forkedFrom: '11111111-1111-4111-8111-111111111111',
      messages: [
        {
          id: 'msg-1',
          timestamp: '2026-11-24T19:59:00.000Z',
          type: 'user',
          content: 'Hello world',
        },
      ],
    },
  };

  beforeEach(() => {
    mockGetConversationAsync = vi.fn().mockResolvedValue({
      sessionId: '11111111-1111-4111-8111-111111111111',
      messages: [
        {
          id: 'msg-1',
          timestamp: '2026-11-24T19:59:00.000Z',
          type: 'user',
          content: 'Hello world',
        },
      ],
    });
    mockForkAsync = vi.fn().mockResolvedValue(sampleForkResult);
    mockResumeChat = vi.fn().mockResolvedValue(undefined);
    mockSetSessionId = vi.fn();

    mockContext = createMockCommandContext({
      services: {
        agentContext: {
          geminiClient: {
            getChatRecordingService: () => ({
              getConversationAsync: mockGetConversationAsync,
              forkAsync: mockForkAsync,
            }),
            resumeChat: mockResumeChat,
          },
          config: {
            setSessionId: mockSetSessionId,
          },
        },
      },
    }) as unknown as CommandContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has autoExecute set to false and exposes argumentHint and --stay completion', () => {
    expect(forkCommand.name).toBe('fork');
    expect(forkCommand.autoExecute).toBe(false);
    expect(forkCommand.argumentHint).toBe('[name] [--stay]');
    expect(forkCommand.completion!(mockContext, '')).toEqual([]);
    expect(forkCommand.completion!(mockContext, '--s')).toEqual(['--stay']);
    expect(forkCommand.completion!(mockContext, 'my-name')).toEqual([]);
  });

  it('forks and switches to the new session by default', async () => {
    const result = await forkCommand.action!(mockContext, '');

    expect(mockForkAsync).toHaveBeenCalledWith({ summary: undefined });
    expect(mockResumeChat).toHaveBeenCalledWith(expect.any(Array), {
      conversation: sampleForkResult.conversation,
      filePath: sampleForkResult.filePath,
    });
    expect(mockSetSessionId).toHaveBeenCalledWith(sampleForkResult.sessionId);
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining(
        `gemini --resume ${sampleForkResult.sourceSessionId}`,
      ),
    });
    if (result && 'content' in result) {
      expect(result.content).toContain(sampleForkResult.sessionId);
      expect(result.content).toContain('(Hello world (fork))');
    }
  });

  it('passes custom name to forkAsync', async () => {
    const namedResult: ForkSessionResult = {
      ...sampleForkResult,
      conversation: {
        ...sampleForkResult.conversation,
        summary: 'try-redis',
      },
    };
    mockForkAsync.mockResolvedValue(namedResult);

    const result = await forkCommand.action!(mockContext, 'try-redis');

    expect(mockForkAsync).toHaveBeenCalledWith({ summary: 'try-redis' });
    expect(mockResumeChat).toHaveBeenCalled();
    expect(mockSetSessionId).toHaveBeenCalledWith(namedResult.sessionId);
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining('(try-redis)'),
    });
  });

  it('stays on the original session when --stay is provided', async () => {
    const result = await forkCommand.action!(mockContext, '--stay bg-branch');

    expect(mockForkAsync).toHaveBeenCalledWith({ summary: 'bg-branch' });
    expect(mockResumeChat).not.toHaveBeenCalled();
    expect(mockSetSessionId).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: expect.stringContaining(
        `gemini --resume ${sampleForkResult.sessionId}`,
      ),
    });
  });

  it('returns info when there is no resumable conversation to fork', async () => {
    mockGetConversationAsync.mockResolvedValue({
      sessionId: '11111111-1111-4111-8111-111111111111',
      messages: [],
    });

    const result = await forkCommand.action!(mockContext, '');

    expect(mockForkAsync).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No conversation found to fork.',
    });
  });

  it('returns error when forkAsync returns null', async () => {
    mockForkAsync.mockResolvedValue(null);

    const result = await forkCommand.action!(mockContext, '');

    expect(mockResumeChat).not.toHaveBeenCalled();
    expect(mockSetSessionId).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Failed to fork conversation.',
    });
  });

  it('does not update sessionId when resumeChat throws', async () => {
    mockResumeChat.mockRejectedValue(new Error('Resume failed'));

    const result = await forkCommand.action!(mockContext, '');

    expect(mockSetSessionId).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Failed to fork conversation: Resume failed',
    });
  });

  it('returns errors when config, client, or recording service is unavailable', async () => {
    const noConfigCtx = { services: {} } as CommandContext;
    expect(await forkCommand.action!(noConfigCtx, '')).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Config not found.',
    });

    const noClientCtx = createMockCommandContext({
      services: {
        agentContext: {
          geminiClient: undefined,
          config: {},
        },
      },
    }) as unknown as CommandContext;
    expect(await forkCommand.action!(noClientCtx, '')).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Client not initialized.',
    });

    const noRecorderCtx = createMockCommandContext({
      services: {
        agentContext: {
          geminiClient: { getChatRecordingService: () => undefined },
          config: {},
        },
      },
    }) as unknown as CommandContext;
    expect(await forkCommand.action!(noRecorderCtx, '')).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Chat recording service is unavailable.',
    });
  });
});
