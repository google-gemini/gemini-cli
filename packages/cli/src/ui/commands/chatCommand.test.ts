/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mocked } from 'vitest';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import type {
  MessageActionReturn,
  SlashCommand,
  type CommandContext,
} from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { Content } from '@google/genai';
import type { GeminiClient } from '@google/gemini-cli-core';

import * as fsPromises from 'node:fs/promises';
import { chatCommand, serializeHistoryToMarkdown } from './chatCommand.js';
import type { Stats } from 'node:fs';
import type { HistoryItemWithoutId } from '../types.js';
import path from 'node:path';

vi.mock('fs/promises', () => ({
  stat: vi.fn(),
  readdir: vi.fn().mockResolvedValue(['file1.txt', 'file2.txt'] as string[]),
  writeFile: vi.fn(),
}));

describe('chatCommand', () => {
  const mockFs = fsPromises as Mocked<typeof fsPromises>;

  let mockContext: CommandContext;
  let mockGetChat: ReturnType<typeof vi.fn>;
  let mockSaveCheckpoint: ReturnType<typeof vi.fn>;
  let mockLoadCheckpoint: ReturnType<typeof vi.fn>;
  let mockDeleteCheckpoint: ReturnType<typeof vi.fn>;
  let mockGetHistory: ReturnType<typeof vi.fn>;

  const getSubCommand = (
    name: 'list' | 'save' | 'resume' | 'delete' | 'share',
  ): SlashCommand => {
    const subCommand = chatCommand.subCommands?.find(
      (cmd) => cmd.name === name,
    );
    if (!subCommand) {
      throw new Error(`/chat ${name} command not found.`);
    }
    return subCommand;
  };

  beforeEach(() => {
    mockGetHistory = vi.fn().mockReturnValue([]);
    mockGetChat = vi.fn().mockResolvedValue({
      getHistory: mockGetHistory,
    });
    mockSaveCheckpoint = vi.fn().mockResolvedValue(undefined);
    mockLoadCheckpoint = vi.fn().mockResolvedValue([]);
    mockDeleteCheckpoint = vi.fn().mockResolvedValue(true);

    mockContext = createMockCommandContext({
      services: {
        config: {
          getProjectRoot: () => '/project/root',
          getGeminiClient: () =>
            ({
              getChat: mockGetChat,
            }) as unknown as GeminiClient,
          storage: {
            getProjectTempDir: () => '/project/root/.gemini/tmp/mockhash',
          },
        },
        logger: {
          saveCheckpoint: mockSaveCheckpoint,
          loadCheckpoint: mockLoadCheckpoint,
          deleteCheckpoint: mockDeleteCheckpoint,
          initialize: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have the correct main command definition', () => {
    expect(chatCommand.name).toBe('chat');
    expect(chatCommand.description).toBe('Manage conversation history.');
    expect(chatCommand.subCommands).toHaveLength(5);
  });

  describe('list subcommand', () => {
    let listCommand: SlashCommand;

    beforeEach(() => {
      listCommand = getSubCommand('list');
    });

    it('should inform when no checkpoints are found', async () => {
      mockFs.readdir.mockImplementation(
        (async (_: string): Promise<string[]> =>
          [] as string[]) as unknown as typeof fsPromises.readdir,
      );
      const result = await listCommand?.action?.(mockContext, '');
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No saved conversation checkpoints found.',
      });
    });

    it('should list found checkpoints', async () => {
      const fakeFiles = ['checkpoint-test1.json', 'checkpoint-test2.json'];
      const date = new Date();

      mockFs.readdir.mockImplementation(
        (async (_: string): Promise<string[]> =>
          fakeFiles as string[]) as unknown as typeof fsPromises.readdir,
      );
      mockFs.stat.mockImplementation((async (path: string): Promise<Stats> => {
        if (path.endsWith('test1.json')) {
          return { mtime: date } as Stats;
        }
        return { mtime: new Date(date.getTime() + 1000) } as Stats;
      }) as unknown as typeof fsPromises.stat);

      const result = (await listCommand?.action?.(
        mockContext,
        '',
      )) as MessageActionReturn;

      const content = result?.content ?? '';
      expect(result?.type).toBe('message');
      expect(content).toContain('List of saved conversations:');
      const isoDate = date
        .toISOString()
        .match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
      const formattedDate = isoDate ? `${isoDate[1]} ${isoDate[2]}` : '';
      expect(content).toContain(formattedDate);
      const index1 = content.indexOf('- \u001b[36mtest1\u001b[0m');
      const index2 = content.indexOf('- \u001b[36mtest2\u001b[0m');
      expect(index1).toBeGreaterThanOrEqual(0);
      expect(index2).toBeGreaterThan(index1);
    });

    it('should handle invalid date formats gracefully', async () => {
      const fakeFiles = ['checkpoint-baddate.json'];
      const badDate = {
        toISOString: () => 'an-invalid-date-string',
      } as Date;

      mockFs.readdir.mockResolvedValue(fakeFiles);
      mockFs.stat.mockResolvedValue({ mtime: badDate } as Stats);

      const result = (await listCommand?.action?.(
        mockContext,
        '',
      )) as MessageActionReturn;

      const content = result?.content ?? '';
      expect(content).toContain('(saved on Invalid Date)');
    });
  });
  describe('save subcommand', () => {
    let saveCommand: SlashCommand;
    const tag = 'my-tag';
    let mockCheckpointExists: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      saveCommand = getSubCommand('save');
      mockCheckpointExists = vi.fn().mockResolvedValue(false);
      mockContext.services.logger.checkpointExists = mockCheckpointExists;
    });

    it('should return an error if tag is missing', async () => {
      const result = await saveCommand?.action?.(mockContext, '  ');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Missing tag. Usage: /chat save <tag>',
      });
    });

    it('should inform if conversation history is empty or only contains system context', async () => {
      mockGetHistory.mockReturnValue([]);
      let result = await saveCommand?.action?.(mockContext, tag);
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No conversation found to save.',
      });

      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: 'context for our chat' }] },
        { role: 'model', parts: [{ text: 'Got it. Thanks for the context!' }] },
      ]);
      result = await saveCommand?.action?.(mockContext, tag);
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No conversation found to save.',
      });

      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: 'context for our chat' }] },
        { role: 'model', parts: [{ text: 'Got it. Thanks for the context!' }] },
        { role: 'user', parts: [{ text: 'Hello, how are you?' }] },
      ]);
      result = await saveCommand?.action?.(mockContext, tag);
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `Conversation checkpoint saved with tag: ${tag}.`,
      });
    });

    it('should return confirm_action if checkpoint already exists', async () => {
      mockCheckpointExists.mockResolvedValue(true);
      mockContext.invocation = {
        raw: `/chat save ${tag}`,
        name: 'save',
        args: tag,
      };

      const result = await saveCommand?.action?.(mockContext, tag);

      expect(mockCheckpointExists).toHaveBeenCalledWith(tag);
      expect(mockSaveCheckpoint).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        type: 'confirm_action',
        originalInvocation: { raw: `/chat save ${tag}` },
      });
      // Check that prompt is a React element
      expect(result).toHaveProperty('prompt');
    });

    it('should save the conversation if overwrite is confirmed', async () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'context for our chat' }] },
        { role: 'model', parts: [{ text: 'Got it. Thanks for the context!' }] },
        { role: 'user', parts: [{ text: 'hello' }] },
        { role: 'model', parts: [{ text: 'Hi there!' }] },
      ];
      mockGetHistory.mockReturnValue(history);
      mockContext.overwriteConfirmed = true;

      const result = await saveCommand?.action?.(mockContext, tag);

      expect(mockCheckpointExists).not.toHaveBeenCalled(); // Should skip existence check
      expect(mockSaveCheckpoint).toHaveBeenCalledWith(history, tag);
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `Conversation checkpoint saved with tag: ${tag}.`,
      });
    });
  });

  describe('resume subcommand', () => {
    const goodTag = 'good-tag';
    const badTag = 'bad-tag';

    let resumeCommand: SlashCommand;
    beforeEach(() => {
      resumeCommand = getSubCommand('resume');
    });

    it('should return an error if tag is missing', async () => {
      const result = await resumeCommand?.action?.(mockContext, '');

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Missing tag. Usage: /chat resume <tag>',
      });
    });

    it('should inform if checkpoint is not found', async () => {
      mockLoadCheckpoint.mockResolvedValue([]);

      const result = await resumeCommand?.action?.(mockContext, badTag);

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `No saved checkpoint found with tag: ${badTag}.`,
      });
    });

    it('should resume a conversation', async () => {
      const conversation: Content[] = [
        { role: 'user', parts: [{ text: 'hello gemini' }] },
        { role: 'model', parts: [{ text: 'hello world' }] },
      ];
      mockLoadCheckpoint.mockResolvedValue(conversation);

      const result = await resumeCommand?.action?.(mockContext, goodTag);

      expect(result).toEqual({
        type: 'load_history',
        history: [
          { type: 'user', text: 'hello gemini' },
          { type: 'gemini', text: 'hello world' },
        ] as HistoryItemWithoutId[],
        clientHistory: conversation,
      });
    });

    describe('completion', () => {
      it('should provide completion suggestions', async () => {
        const fakeFiles = ['checkpoint-alpha.json', 'checkpoint-beta.json'];
        mockFs.readdir.mockImplementation(
          (async (_: string): Promise<string[]> =>
            fakeFiles as string[]) as unknown as typeof fsPromises.readdir,
        );

        mockFs.stat.mockImplementation(
          (async (_: string): Promise<Stats> =>
            ({
              mtime: new Date(),
            }) as Stats) as unknown as typeof fsPromises.stat,
        );

        const result = await resumeCommand?.completion?.(mockContext, 'a');

        expect(result).toEqual(['alpha']);
      });

      it('should suggest filenames sorted by modified time (newest first)', async () => {
        const fakeFiles = ['checkpoint-test1.json', 'checkpoint-test2.json'];
        const date = new Date();
        mockFs.readdir.mockImplementation(
          (async (_: string): Promise<string[]> =>
            fakeFiles as string[]) as unknown as typeof fsPromises.readdir,
        );
        mockFs.stat.mockImplementation((async (
          path: string,
        ): Promise<Stats> => {
          if (path.endsWith('test1.json')) {
            return { mtime: date } as Stats;
          }
          return { mtime: new Date(date.getTime() + 1000) } as Stats;
        }) as unknown as typeof fsPromises.stat);

        const result = await resumeCommand?.completion?.(mockContext, '');
        // Sort items by last modified time (newest first)
        expect(result).toEqual(['test2', 'test1']);
      });
    });
  });

  describe('delete subcommand', () => {
    let deleteCommand: SlashCommand;
    const tag = 'my-tag';
    beforeEach(() => {
      deleteCommand = getSubCommand('delete');
    });

    it('should return an error if tag is missing', async () => {
      const result = await deleteCommand?.action?.(mockContext, '  ');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Missing tag. Usage: /chat delete <tag>',
      });
    });

    it('should return an error if checkpoint is not found', async () => {
      mockDeleteCheckpoint.mockResolvedValue(false);
      const result = await deleteCommand?.action?.(mockContext, tag);
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `Error: No checkpoint found with tag '${tag}'.`,
      });
    });

    it('should delete the conversation', async () => {
      const result = await deleteCommand?.action?.(mockContext, tag);

      expect(mockDeleteCheckpoint).toHaveBeenCalledWith(tag);
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `Conversation checkpoint '${tag}' has been deleted.`,
      });
    });

    describe('completion', () => {
      it('should provide completion suggestions', async () => {
        const fakeFiles = ['checkpoint-alpha.json', 'checkpoint-beta.json'];
        mockFs.readdir.mockImplementation(
          (async (_: string): Promise<string[]> =>
            fakeFiles as string[]) as unknown as typeof fsPromises.readdir,
        );

        mockFs.stat.mockImplementation(
          (async (_: string): Promise<Stats> =>
            ({
              mtime: new Date(),
            }) as Stats) as unknown as typeof fsPromises.stat,
        );

        const result = await deleteCommand?.completion?.(mockContext, 'a');

        expect(result).toEqual(['alpha']);
      });
    });
  });

  describe('share subcommand', () => {
    let shareCommand: SlashCommand;
    const mockHistory = [
      { role: 'user', parts: [{ text: 'context' }] },
      { role: 'model', parts: [{ text: 'context response' }] },
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there!' }] },
    ];

    beforeEach(() => {
      shareCommand = getSubCommand('share');
      vi.spyOn(process, 'cwd').mockReturnValue(
        path.resolve('/usr/local/google/home/myuser/gemini-cli'),
      );
      vi.spyOn(Date, 'now').mockReturnValue(1234567890);
      mockGetHistory.mockReturnValue(mockHistory);
      mockFs.writeFile.mockClear();
    });

    it('should default to a json file if no path is provided', async () => {
      const result = await shareCommand?.action?.(mockContext, '');
      const expectedPath = path.join(
        process.cwd(),
        'gemini-conversation-1234567890.json',
      );
      const [actualPath, actualContent] = mockFs.writeFile.mock.calls[0];
      expect(actualPath).toEqual(expectedPath);
      expect(actualContent).toEqual(JSON.stringify(mockHistory, null, 2));
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `Conversation shared to ${expectedPath}`,
      });
    });

    it('should share the conversation to a JSON file', async () => {
      const filePath = 'my-chat.json';
      const result = await shareCommand?.action?.(mockContext, filePath);
      const expectedPath = path.join(process.cwd(), 'my-chat.json');
      const [actualPath, actualContent] = mockFs.writeFile.mock.calls[0];
      expect(actualPath).toEqual(expectedPath);
      expect(actualContent).toEqual(JSON.stringify(mockHistory, null, 2));
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `Conversation shared to ${expectedPath}`,
      });
    });

    it('should share the conversation to a Markdown file', async () => {
      const filePath = 'my-chat.md';
      const result = await shareCommand?.action?.(mockContext, filePath);
      const expectedPath = path.join(process.cwd(), 'my-chat.md');
      const [actualPath, actualContent] = mockFs.writeFile.mock.calls[0];
      expect(actualPath).toEqual(expectedPath);
      const expectedContent =
        '**user**:\n\ncontext\n\n---\n\n' +
        '**model**:\n\ncontext response\n\n---\n\n' +
        '**user**:\n\nHello\n\n---\n\n' +
        '**model**:\n\nHi there!';
      expect(actualContent).toEqual(expectedContent);
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: `Conversation shared to ${expectedPath}`,
      });
    });

    it('should return an error for unsupported file extensions', async () => {
      const filePath = 'my-chat.txt';
      const result = await shareCommand?.action?.(mockContext, filePath);
      expect(mockFs.writeFile).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Invalid file format. Only .md and .json are supported.',
      });
    });

    it('should inform if there is no conversation to share', async () => {
      mockGetHistory.mockReturnValue([
        { role: 'user', parts: [{ text: 'context' }] },
        { role: 'model', parts: [{ text: 'context response' }] },
      ]);
      const result = await shareCommand?.action?.(mockContext, 'my-chat.json');
      expect(mockFs.writeFile).not.toHaveBeenCalled();
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No conversation found to share.',
      });
    });

    it('should handle errors during file writing', async () => {
      const error = new Error('Permission denied');
      mockFs.writeFile.mockRejectedValue(error);
      const result = await shareCommand?.action?.(mockContext, 'my-chat.json');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `Error sharing conversation: ${error.message}`,
      });
    });

    it('should output valid JSON schema', async () => {
      const filePath = 'my-chat.json';
      await shareCommand?.action?.(mockContext, filePath);
      const expectedPath = path.join(process.cwd(), 'my-chat.json');
      const [actualPath, actualContent] = mockFs.writeFile.mock.calls[0];
      expect(actualPath).toEqual(expectedPath);
      const parsedContent = JSON.parse(actualContent);
      expect(Array.isArray(parsedContent)).toBe(true);
      parsedContent.forEach((item: Content) => {
        expect(item).toHaveProperty('role');
        expect(item).toHaveProperty('parts');
        expect(Array.isArray(item.parts)).toBe(true);
      });
    });

    it('should output correct markdown format', async () => {
      const filePath = 'my-chat.md';
      await shareCommand?.action?.(mockContext, filePath);
      const expectedPath = path.join(process.cwd(), 'my-chat.md');
      const [actualPath, actualContent] = mockFs.writeFile.mock.calls[0];
      expect(actualPath).toEqual(expectedPath);
      const entries = actualContent.split('\n\n---\n\n');
      expect(entries.length).toBe(mockHistory.length);
      entries.forEach((entry, index) => {
        const { role, parts } = mockHistory[index];
        const text = parts.map((p) => p.text).join('');
        expect(entry).toBe(`**${role}**:\n\n${text}`);
      });
    });
  });

  describe('serializeHistoryToMarkdown', () => {
    it('should correctly serialize chat history to Markdown', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there!' }] },
        { role: 'user', parts: [{ text: 'How are you?' }] },
      ];

      const expectedMarkdown =
        '**user**:\n\nHello\n\n---\n\n' +
        '**model**:\n\nHi there!\n\n---\n\n' +
        '**user**:\n\nHow are you?';

      const result = serializeHistoryToMarkdown(history);
      expect(result).toBe(expectedMarkdown);
    });

    it('should handle empty history', () => {
      const history: Content[] = [];
      const result = serializeHistoryToMarkdown(history);
      expect(result).toBe('');
    });

    it('should handle items with no text parts', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [] },
        { role: 'user', parts: [{ text: 'How are you?' }] },
      ];

      const expectedMarkdown =
        '**user**:\n\nHello\n\n---\n\n' +
        '**model**:\n\n\n\n---\n\n' +
        '**user**:\n\nHow are you?';

      const result = serializeHistoryToMarkdown(history);
      expect(result).toBe(expectedMarkdown);
    });
  });
});
