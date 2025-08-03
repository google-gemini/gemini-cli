/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { exportConversationCommand } from './exportConversationCommand.js';
import { CommandContext } from './types.js';
import * as fs from 'fs';
import { Content } from '@google/genai';

// Mock fs.writeFileSync at the top level
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
}));

describe('exportConversationCommand', () => {
  let mockContext: CommandContext;
  let mockChat: { getHistory: vi.Mock };
  let history: Content[];
  let stdoutSpy: vi.SpyInstance;

  beforeEach(() => {
    // Spy on process.stdout.write before each test
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    // Setup common mocks
    mockChat = {
      getHistory: vi.fn(),
    };

    mockContext = {
      services: {
        config: {
          getGeminiClient: () => ({
            getChat: () => mockChat,
          }),
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext;

    history = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there!' }] },
    ];

    // Mock getHistory to return our sample history
    mockChat.getHistory.mockReturnValue(history);
  });

  afterEach(() => {
    // Restore all mocks after each test
    vi.restoreAllMocks();
  });

  describe('jsonl', () => {
    it('should export to console in jsonl format', async () => {
      const result = await exportConversationCommand.subCommands![0].action!(
        mockContext,
        '',
      );

      const expectedOutput =
        '{"role":"user","content":"Hello"}\n{"role":"model","content":"Hi there!"}';
      expect(stdoutSpy).toHaveBeenCalledWith(expectedOutput);
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Conversation printed to console.',
      });
    });

    it('should export to file in jsonl format', async () => {
      const result = await exportConversationCommand.subCommands![0].action!(
        mockContext,
        '--output test.jsonl',
      );

      const expectedOutput =
        '{"role":"user","content":"Hello"}\n{"role":"model","content":"Hi there!"}';
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'test.jsonl',
        expectedOutput,
      );
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Conversation exported to test.jsonl',
      });
    });
  });

  describe('markdown', () => {
    it('should export to console in markdown format', async () => {
      const result = await exportConversationCommand.subCommands![1].action!(
        mockContext,
        '',
      );

      const expectedOutput = '## user\n\nHello\n\n## model\n\nHi there!\n\n';
      expect(stdoutSpy).toHaveBeenCalledWith(expectedOutput);
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Conversation printed to console.',
      });
    });

    it('should export to file in markdown format', async () => {
      const result = await exportConversationCommand.subCommands![1].action!(
        mockContext,
        '--output test.md',
      );

      const expectedOutput = '## user\n\nHello\n\n## model\n\nHi there!\n\n';
      expect(fs.writeFileSync).toHaveBeenCalledWith('test.md', expectedOutput);
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Conversation exported to test.md',
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should return an error if no chat client is available', async () => {
      const contextWithoutChat = {
        services: {
          config: {
            getGeminiClient: () => undefined,
          },
        },
      } as unknown as CommandContext;

      const result = await exportConversationCommand.subCommands![0].action!(
        contextWithoutChat,
        '',
      );

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'No chat client available to export conversation.',
      });
    });

    it('should return an info message if the history is empty', async () => {
      mockChat.getHistory.mockReturnValue([]);
      const result = await exportConversationCommand.subCommands![0].action!(
        mockContext,
        '',
      );

      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No conversation found to export.',
      });
    });

    it('should return an error if writing to a file fails', async () => {
      const writeError = new Error('Permission denied');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw writeError;
      });

      const result = await exportConversationCommand.subCommands![0].action!(
        mockContext,
        '--output /root/test.jsonl',
      );

      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `Error writing to file: ${writeError.message}`,
      });
    });
  });
});
