/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CommandContext } from './types.js';
import type { GeminiClient } from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { forkCommand } from './forkCommand.js';

describe('forkCommand', () => {
  let mockContext: CommandContext;
  let mockGetChatRecordingService: ReturnType<typeof vi.fn>;
  let mockGetConversation: ReturnType<typeof vi.fn>;
  let mockFork: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetConversation = vi.fn();
    mockFork = vi.fn();
    mockGetChatRecordingService = vi.fn().mockReturnValue({
      getConversation: mockGetConversation,
      fork: mockFork,
    });
    mockContext = createMockCommandContext({
      services: {
        agentContext: {
          geminiClient: {
            getChatRecordingService: mockGetChatRecordingService,
          } as unknown as GeminiClient,
        },
      },
    });
  });

  it('has the correct command definition', () => {
    expect(forkCommand.name).toBe('fork');
    expect(forkCommand.kind).toBe('built-in');
    expect(forkCommand.description).toMatch(/copy of the current session/);
  });

  it('returns an error when the client is not initialized', async () => {
    mockContext = createMockCommandContext({
      services: {
        agentContext: null,
      },
    });
    const result = await forkCommand.action!(mockContext, '');
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Client not initialized.',
    });
  });

  it('returns info when there is no active conversation', async () => {
    mockGetConversation.mockReturnValue(null);
    const result = await forkCommand.action!(mockContext, '');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No conversation to fork.',
    });
    expect(mockFork).not.toHaveBeenCalled();
  });

  it('returns info when the conversation has no messages yet', async () => {
    mockGetConversation.mockReturnValue({ sessionId: 'fresh', messages: [] });
    const result = await forkCommand.action!(mockContext, '');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No messages yet to fork. Send a message first.',
    });
    expect(mockFork).not.toHaveBeenCalled();
  });

  it('returns the shortId and a resume hint on success', async () => {
    mockGetConversation.mockReturnValue({
      sessionId: 'old',
      messages: [{ id: 'm1', type: 'user', content: 'hi' }],
    });
    mockFork.mockReturnValue({
      sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      shortId: 'a1b2c3d4',
      filePath: '/tmp/session-fake.jsonl',
    });
    const result = await forkCommand.action!(mockContext, '');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content:
        'Fork saved (a1b2c3d4).\n' +
        'Resume in another terminal: gemini --resume a1b2c3d4',
    });
    expect(mockFork).toHaveBeenCalledTimes(1);
  });

  it('reports an error when fork() throws', async () => {
    mockGetConversation.mockReturnValue({
      sessionId: 'old',
      messages: [{ id: 'm1', type: 'user', content: 'hi' }],
    });
    mockFork.mockImplementation(() => {
      throw new Error('No space left on device.');
    });
    const result = await forkCommand.action!(mockContext, '');
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Failed to fork session: No space left on device.',
    });
  });
});
