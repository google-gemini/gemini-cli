/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createShowMemoryAction } from './useShowMemoryCommand.js';
import type { Message } from '../types.js';
import { MessageType } from '../types.js';
import type { Config } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';

describe('createShowMemoryAction', () => {
  let mockConfig: Config;
  let mockSettings: LoadedSettings;
  let addMessage: ReturnType<typeof vi.fn<[Message], void>>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConfig = {
      getDebugMode: vi.fn().mockReturnValue(false),
      getUserMemory: vi.fn().mockReturnValue(''),
      getGeminiMdFileCount: vi.fn().mockReturnValue(0),
    } as unknown as Config;

    mockSettings = {
      merged: {
        context: {
          fileName: 'GEMINI.md',
        },
      },
    } as LoadedSettings;

    addMessage = vi.fn();
    consoleLogSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('configuration validation', () => {
    it('should show error when config is null', async () => {
      const action = createShowMemoryAction(null, mockSettings, addMessage);

      await action();

      expect(addMessage).toHaveBeenCalledWith({
        type: MessageType.ERROR,
        content: 'Configuration not available. Cannot show memory.',
        timestamp: expect.any(Date),
      });
    });

    it('should not call config methods when config is null', async () => {
      const action = createShowMemoryAction(null, mockSettings, addMessage);

      await action();

      expect(mockConfig.getDebugMode).not.toHaveBeenCalled();
    });
  });

  describe('no memory loaded', () => {
    it('should show message when no memory and no files', async () => {
      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith({
        type: MessageType.INFO,
        content:
          'No hierarchical memory (GEMINI.md or other context files) is currently loaded.',
        timestamp: expect.any(Date),
      });
    });

    it('should call getGeminiMdFileCount', async () => {
      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(mockConfig.getGeminiMdFileCount).toHaveBeenCalled();
    });

    it('should call getUserMemory', async () => {
      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(mockConfig.getUserMemory).toHaveBeenCalled();
    });
  });

  describe('memory content display', () => {
    it('should show memory content when available', async () => {
      vi.mocked(mockConfig.getUserMemory).mockReturnValue(
        '# Test Memory\nContent here',
      );
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(1);

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          content: expect.stringContaining('# Test Memory'),
        }),
      );
    });

    it('should wrap memory content in markdown code block', async () => {
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('Memory content');
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(1);

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('```markdown'),
        }),
      );
    });

    it('should show full memory content', async () => {
      const memoryContent = '# Header\n\nParagraph 1\n\nParagraph 2';
      vi.mocked(mockConfig.getUserMemory).mockReturnValue(memoryContent);
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(1);

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining(memoryContent),
        }),
      );
    });

    it('should not show memory when only whitespace', async () => {
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('   \n\n  ');
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(0);

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content:
            'No hierarchical memory (GEMINI.md or other context files) is currently loaded.',
        }),
      );
    });
  });

  describe('file count display', () => {
    it('should show file count when 1 file loaded', async () => {
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(1);
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('content');

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Loaded memory from 1 GEMINI.md file.',
        }),
      );
    });

    it('should show file count when multiple files loaded', async () => {
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(3);
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('content');

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Loaded memory from 3 GEMINI.md files.',
        }),
      );
    });

    it('should not show file count when zero files', async () => {
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(0);

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      const fileCalls = addMessage.mock.calls.filter((call) =>
        call[0]?.content.includes('Loaded memory from'),
      );
      expect(fileCalls).toHaveLength(0);
    });

    it('should pluralize "file" correctly', async () => {
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(2);
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('content');

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringMatching(/2.*files/),
        }),
      );
    });
  });

  describe('context file names', () => {
    it('should use single file name when available', async () => {
      mockSettings.merged.context!.fileName = 'CUSTOM.md';
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(1);
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('content');

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Loaded memory from 1 CUSTOM.md file.',
        }),
      );
    });

    it('should use "context" when file names differ', async () => {
      mockSettings.merged.context!.fileName = ['FILE1.md', 'FILE2.md'];
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(2);
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('content');

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Loaded memory from 2 context files.',
        }),
      );
    });

    it('should use specific name when all file names are same', async () => {
      mockSettings.merged.context!.fileName = ['SAME.md', 'SAME.md'];
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(2);
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('content');

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Loaded memory from 2 SAME.md files.',
        }),
      );
    });

    it('should handle array with single fileName', async () => {
      mockSettings.merged.context!.fileName = ['SINGLE.md'];
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(1);
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('content');

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Loaded memory from 1 SINGLE.md file.',
        }),
      );
    });
  });

  describe('empty but loaded files', () => {
    it('should show message when files loaded but content empty', async () => {
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(2);
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('');

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content:
            'Hierarchical memory (GEMINI.md or other context files) is loaded but content is empty.',
        }),
      );
    });

    it('should still show file count when content is empty', async () => {
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(3);
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('');

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Loaded memory from 3 GEMINI.md files.',
        }),
      );
    });
  });

  describe('debug mode', () => {
    beforeEach(() => {
      vi.mocked(mockConfig.getDebugMode).mockReturnValue(true);
    });

    it('should log debug messages when enabled', async () => {
      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[DEBUG] Show Memory command invoked.',
      );
    });

    it('should log memory content preview', async () => {
      vi.mocked(mockConfig.getUserMemory).mockReturnValue(
        '# Long content that will be truncated for debug output',
      );

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Content from config.getUserMemory()'),
      );
    });

    it('should log file count in debug', async () => {
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(5);

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[DEBUG] Number of context files loaded: 5',
      );
    });

    it('should truncate long memory content in debug log', async () => {
      const longContent = 'a'.repeat(500);
      vi.mocked(mockConfig.getUserMemory).mockReturnValue(longContent);

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      const debugCall = consoleLogSpy.mock.calls.find((call) =>
        call[0]?.includes('first 200 chars'),
      );
      expect(debugCall).toBeDefined();
      expect(debugCall?.[0]).toHaveLength(
        expect.any(Number).constructor(debugCall[0].length) < 300,
      );
    });

    it('should not log debug messages when disabled', async () => {
      vi.mocked(mockConfig.getDebugMode).mockReturnValue(false);

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('message structure', () => {
    it('should add timestamp to all messages', async () => {
      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
        }),
      );
    });

    it('should use INFO message type for success', async () => {
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('content');

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      const infoMessages = addMessage.mock.calls.filter(
        (call) => call[0]?.type === MessageType.INFO,
      );
      expect(infoMessages.length).toBeGreaterThan(0);
    });

    it('should use ERROR message type for failures', async () => {
      const action = createShowMemoryAction(null, mockSettings, addMessage);

      await action();

      expect(addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
        }),
      );
    });
  });

  describe('return value', () => {
    it('should return a function', () => {
      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      expect(typeof action).toBe('function');
    });

    it('should return async function', () => {
      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      const result = action();
      expect(result).toBeInstanceOf(Promise);
    });

    it('should resolve without value', async () => {
      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      const result = await action();
      expect(result).toBeUndefined();
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical usage with memory', async () => {
      vi.mocked(mockConfig.getUserMemory).mockReturnValue(
        '# Project\n\nDescription',
      );
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(1);

      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      expect(addMessage).toHaveBeenCalledTimes(2);
      expect(addMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          content: 'Loaded memory from 1 GEMINI.md file.',
        }),
      );
      expect(addMessage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          content: expect.stringContaining('# Project'),
        }),
      );
    });

    it('should handle multiple calls', async () => {
      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();
      await action();

      expect(addMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle changing memory state', async () => {
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('initial');
      const action = createShowMemoryAction(
        mockConfig,
        mockSettings,
        addMessage,
      );

      await action();

      vi.mocked(mockConfig.getUserMemory).mockReturnValue('updated');
      await action();

      const calls = addMessage.mock.calls;
      expect(calls.some((call) => call[0]?.content.includes('initial'))).toBe(
        true,
      );
      expect(calls.some((call) => call[0]?.content.includes('updated'))).toBe(
        true,
      );
    });
  });
});
