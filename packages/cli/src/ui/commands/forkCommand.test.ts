/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as fsPromises from 'node:fs/promises';
import { forkCommand } from './forkCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { GeminiClient, ConversationRecord } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

const mockFs = vi.mocked(fsPromises);

const baseConversation: ConversationRecord = {
  sessionId: 'original-session',
  projectHash: 'abc123',
  startTime: '2026-01-01T00:00:00.000Z',
  lastUpdated: '2026-01-01T00:00:00.000Z',
  messages: [
    {
      id: 'msg1',
      type: 'user',
      timestamp: '2026-01-01T00:00:00.000Z',
      content: 'hello',
    },
  ],
};

function makeContext(conversation: ConversationRecord | null) {
  const mockGetConversation = vi.fn().mockReturnValue(conversation);
  return createMockCommandContext({
    services: {
      config: {
        getGeminiClient: () =>
          ({
            getChatRecordingService: () => ({
              getConversation: mockGetConversation,
            }),
          }) as unknown as GeminiClient,
        storage: {
          getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini-test'),
        },
      },
    },
  });
}

describe('forkCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('has the correct name', () => {
      expect(forkCommand.name).toBe('fork');
    });

    it('is marked autoExecute', () => {
      expect(forkCommand.autoExecute).toBe(true);
    });
  });

  it('returns an error when config is not available', async () => {
    const context = createMockCommandContext({ services: { config: null } });
    const result = await forkCommand.action!(context, '');
    expect(result).toMatchObject({
      type: 'message',
      messageType: MessageType.ERROR,
    });
  });

  it('returns an info message when conversation is empty', async () => {
    const emptyConversation: ConversationRecord = {
      ...baseConversation,
      messages: [],
    };
    const context = makeContext(emptyConversation);
    const result = await forkCommand.action!(context, '');
    expect(result).toMatchObject({
      type: 'message',
      messageType: MessageType.INFO,
    });
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it('returns an info message when conversation is null', async () => {
    const context = makeContext(null);
    const result = await forkCommand.action!(context, '');
    expect(result).toMatchObject({
      type: 'message',
      messageType: MessageType.INFO,
    });
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it('creates the chats directory and writes a new session file', async () => {
    const context = makeContext(baseConversation);
    await forkCommand.action!(context, '');

    expect(mockFs.mkdir).toHaveBeenCalledWith('/tmp/gemini-test/chats', {
      recursive: true,
    });
    expect(mockFs.writeFile).toHaveBeenCalledOnce();
  });

  it('writes a forked ConversationRecord with a new sessionId', async () => {
    const context = makeContext(baseConversation);
    await forkCommand.action!(context, '');

    const [filePath, content] = mockFs.writeFile.mock.calls[0] as [
      string,
      string,
      string,
    ];
    const written: ConversationRecord = JSON.parse(content);

    expect(written.sessionId).not.toBe('original-session');
    expect(written.messages).toEqual(baseConversation.messages);
    expect(written.projectHash).toBe(baseConversation.projectHash);
    expect(filePath).toMatch(/\/tmp\/gemini-test\/chats\/session-.*\.json$/);
  });

  it('returns a success info message containing the short ID', async () => {
    const context = makeContext(baseConversation);
    const result = await forkCommand.action!(context, '');

    expect(result).toMatchObject({
      type: 'message',
      messageType: MessageType.INFO,
    });
    // The short ID should appear in the content
    const [filePath] = mockFs.writeFile.mock.calls[0] as [
      string,
      string,
      string,
    ];
    const shortId = (filePath.match(/([0-9a-f]{8})\.json$/) ?? [])[1];
    expect((result as { content: string }).content).toContain(shortId);
  });
});
