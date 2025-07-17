/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  Mocked,
} from 'vitest';

import {
  type CommandContext,
  MessageActionReturn,
  SlashCommand,
} from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

import * as fsPromises from 'fs/promises';
import { chatCommand } from './chatCommand.js';

vi.mock('fs/promises', () => ({
  stat: vi.fn(),
  readdir: vi.fn().mockResolvedValue(['file1.txt', 'file2.txt'] as string[]),
  readFile: vi.fn(),
}));

describe('chatCommand', () => {
  const mockFs = fsPromises as Mocked<typeof fsPromises>;

  let mockContext: CommandContext;

  const getSubCommand = (name: 'list' | 'resume' | 'search'): SlashCommand => {
    const subCommand = chatCommand.subCommands?.find(
      (cmd) => cmd.name === name,
    );
    if (!subCommand) {
      throw new Error(`/chat ${name} command not found.`);
    }
    return subCommand;
  };

  beforeEach(() => {
    mockContext = createMockCommandContext({
      services: {
        config: {
          getProjectTempDir: () => '/tmp/gemini',
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have the correct main command definition', () => {
    expect(chatCommand.name).toBe('chat');
    expect(chatCommand.description).toBe(
      'Browse auto-saved conversations. Usage: /chat <list|resume|search>',
    );
    expect(chatCommand.subCommands).toHaveLength(3);
  });

  describe('list subcommand', () => {
    let listCommand: SlashCommand;

    beforeEach(() => {
      listCommand = getSubCommand('list');
    });

    it('should inform when no conversations are found', async () => {
      mockFs.readdir.mockImplementation(
        (async (_: string): Promise<string[]> =>
          [] as string[]) as unknown as typeof fsPromises.readdir,
      );
      const result = await listCommand?.action?.(mockContext, '');
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No auto-saved conversations found.',
      });
    });

    it('should list found conversations', async () => {
      const fakeFiles = ['session1.json', 'session2.json'];
      const mockConversationData = {
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          { type: 'user', content: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
          {
            type: 'model',
            content: 'Hi there',
            timestamp: '2025-01-01T00:01:00Z',
          },
        ],
      };

      mockFs.readdir.mockImplementation(
        (async (_: string): Promise<string[]> =>
          fakeFiles as string[]) as unknown as typeof fsPromises.readdir,
      );

      mockFs.readFile.mockImplementation(
        (async (_: string): Promise<string> =>
          JSON.stringify(
            mockConversationData,
          )) as unknown as typeof fsPromises.readFile,
      );

      const result = (await listCommand?.action?.(
        mockContext,
        '',
      )) as MessageActionReturn;

      const content = result?.content ?? '';
      expect(result?.type).toBe('message');
      expect(content).toContain('Auto-saved conversations:');
      expect(content).toContain('session1 (2 messages');
      expect(content).toContain('session2 (2 messages');
    });
  });

  describe('resume subcommand', () => {
    let resumeCommand: SlashCommand;

    beforeEach(() => {
      resumeCommand = getSubCommand('resume');
    });

    it('should return an error if session ID is missing', async () => {
      const result = await resumeCommand?.action?.(mockContext, '');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Missing session ID. Usage: /chat resume <session-id>',
      });
    });

    it('should inform if conversation is not found', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const result = await resumeCommand?.action?.(mockContext, 'nonexistent');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Error resuming conversation: File not found',
      });
    });

    it('should resume a conversation', async () => {
      const mockConversationData = {
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          {
            type: 'user',
            content: 'Hello Gemini',
            timestamp: '2025-01-01T00:00:00Z',
          },
          {
            type: 'model',
            content: 'Hello world',
            timestamp: '2025-01-01T00:01:00Z',
          },
        ],
      };

      mockFs.readFile.mockImplementation(
        (async (_: string): Promise<string> =>
          JSON.stringify(
            mockConversationData,
          )) as unknown as typeof fsPromises.readFile,
      );

      const result = await resumeCommand?.action?.(mockContext, 'test-session');

      expect(result).toEqual({
        type: 'load_history',
        history: [
          { type: MessageType.USER, text: 'Hello Gemini' },
          { type: MessageType.GEMINI, text: 'Hello world' },
        ],
        clientHistory: [
          { role: 'user', parts: [{ text: 'Hello Gemini' }] },
          { role: 'model', parts: [{ text: 'Hello world' }] },
        ],
      });
    });

    describe('completion', () => {
      it('should provide completion suggestions', async () => {
        const fakeFiles = [
          'session-2025-07-17T16-33-deb82d22.json',
          'session-2025-07-17T16-35-abc123ef.json',
        ];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockFs.readdir.mockResolvedValue(fakeFiles as any);

        const result = await resumeCommand?.completion?.(
          mockContext,
          'session-2025-07-17T16-33',
        );

        expect(mockFs.readdir).toHaveBeenCalledWith('\\tmp\\gemini\\chats');
        expect(result).toEqual(['session-2025-07-17T16-33-deb82d22']);
      });

      it('should handle empty directory', async () => {
        mockFs.readdir.mockImplementation(
          (async (_: string): Promise<string[]> =>
            [] as string[]) as unknown as typeof fsPromises.readdir,
        );

        const result = await resumeCommand?.completion?.(mockContext, '');

        expect(result).toEqual([]);
      });
    });
  });

  describe('search subcommand', () => {
    let searchCommand: SlashCommand;

    beforeEach(() => {
      searchCommand = getSubCommand('search');
    });

    it('should return an error if search query is missing', async () => {
      const result = await searchCommand?.action?.(mockContext, '');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Missing search query. Usage: /chat search <text>',
      });
    });

    it('should inform when no matches are found', async () => {
      const fakeFiles = ['session1.json'];
      const mockConversationData = {
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          { type: 'user', content: 'Hello', timestamp: '2025-01-01T00:00:00Z' },
        ],
      };

      mockFs.readdir.mockImplementation(
        (async (_: string): Promise<string[]> =>
          fakeFiles as string[]) as unknown as typeof fsPromises.readdir,
      );

      mockFs.readFile.mockImplementation(
        (async (_: string): Promise<string> =>
          JSON.stringify(
            mockConversationData,
          )) as unknown as typeof fsPromises.readFile,
      );

      const result = await searchCommand?.action?.(mockContext, 'goodbye');

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No conversations found containing "goodbye".',
      });
    });

    it('should find and display matching conversations', async () => {
      const fakeFiles = ['session1.json', 'session2.json'];
      const mockConversationData = {
        startTime: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T01:00:00Z',
        messages: [
          {
            type: 'user',
            content: 'Hello world',
            timestamp: '2025-01-01T00:00:00Z',
          },
          {
            type: 'model',
            content: 'Hi there',
            timestamp: '2025-01-01T00:01:00Z',
          },
        ],
      };

      mockFs.readdir.mockImplementation(
        (async (_: string): Promise<string[]> =>
          fakeFiles as string[]) as unknown as typeof fsPromises.readdir,
      );

      mockFs.readFile.mockImplementation(
        (async (_: string): Promise<string> =>
          JSON.stringify(
            mockConversationData,
          )) as unknown as typeof fsPromises.readFile,
      );

      const result = await searchCommand?.action?.(mockContext, 'hello');

      const content = (result as MessageActionReturn)?.content ?? '';
      expect(result?.type).toBe('message');
      expect(content).toContain('Found "hello" in:');
      expect(content).toContain('session1: 1 matches');
      expect(content).toContain('session2: 1 matches');
    });
  });
});
