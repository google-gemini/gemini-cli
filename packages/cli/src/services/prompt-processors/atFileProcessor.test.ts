/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { type CommandContext } from '../../ui/commands/types.js';
import { AtFileProcessor } from './atFileProcessor.js';
import { MessageType } from '../../ui/types.js';
import type { Config } from '@google/gemini-cli-core';
import type { PartUnion } from '@google/genai';

// Mock readDirectFileContent method from FileDiscoveryService
const mockReadDirectFileContent = vi.fn();

describe('AtFileProcessor', () => {
  let context: CommandContext;
  let mockConfig: Config;
  let mockFileService: {
    readDirectFileContent: typeof mockReadDirectFileContent;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock file service with the direct access method
    mockFileService = {
      readDirectFileContent: mockReadDirectFileContent,
    };

    mockConfig = {
      getFileService: () => mockFileService,
    } as unknown as Config;

    context = createMockCommandContext({
      services: {
        config: mockConfig,
      },
    });

    // Default mock success behavior: return file content as string
    mockReadDirectFileContent.mockImplementation(
      async (path: string): Promise<string> => `content of ${path}`,
    );
  });

  it('should not change the prompt if no @{ trigger is present', async () => {
    const processor = new AtFileProcessor();
    const prompt: PartUnion[] = [{ text: 'This is a simple prompt.' }];
    const result = await processor.process(prompt, context);
    expect(result).toEqual(prompt);
    expect(mockReadDirectFileContent).not.toHaveBeenCalled();
  });

  it('should not change the prompt if config service is missing', async () => {
    const processor = new AtFileProcessor();
    const prompt: PartUnion[] = [{ text: 'Analyze @{file.txt}' }];
    const contextWithoutConfig = createMockCommandContext({
      services: {
        config: null,
      },
    });
    const result = await processor.process(prompt, contextWithoutConfig);
    expect(result).toEqual(prompt);
    expect(mockReadDirectFileContent).not.toHaveBeenCalled();
  });

  describe('Parsing Logic', () => {
    it('should replace a single valid @{path/to/file.txt} placeholder', async () => {
      const processor = new AtFileProcessor();
      const prompt: PartUnion[] = [
        { text: 'Analyze this file: @{path/to/file.txt}' },
      ];
      const result = await processor.process(prompt, context);
      expect(mockReadDirectFileContent).toHaveBeenCalledWith(
        'path/to/file.txt',
      );
      expect(result).toEqual([
        { text: 'Analyze this file: ' },
        { text: 'content of path/to/file.txt' },
      ]);
    });

    it('should replace multiple different @{...} placeholders', async () => {
      const processor = new AtFileProcessor();
      const prompt: PartUnion[] = [
        { text: 'Compare @{file1.js} with @{file2.js}' },
      ];
      const result = await processor.process(prompt, context);
      expect(mockReadDirectFileContent).toHaveBeenCalledTimes(2);
      expect(mockReadDirectFileContent).toHaveBeenCalledWith('file1.js');
      expect(mockReadDirectFileContent).toHaveBeenCalledWith('file2.js');
      expect(result).toEqual([
        { text: 'Compare ' },
        { text: 'content of file1.js' },
        { text: ' with ' },
        { text: 'content of file2.js' },
      ]);
    });

    it('should handle placeholders at the beginning, middle, and end', async () => {
      const processor = new AtFileProcessor();
      const prompt: PartUnion[] = [
        { text: '@{start.txt} in the @{middle.txt} and @{end.txt}' },
      ];
      const result = await processor.process(prompt, context);
      expect(result).toEqual([
        { text: 'content of start.txt' },
        { text: ' in the ' },
        { text: 'content of middle.txt' },
        { text: ' and ' },
        { text: 'content of end.txt' },
      ]);
    });

    it('should correctly parse paths that contain balanced braces', async () => {
      const processor = new AtFileProcessor();
      const prompt: PartUnion[] = [
        { text: 'Analyze @{path/with/{braces}/file.txt}' },
      ];
      const result = await processor.process(prompt, context);
      expect(mockReadDirectFileContent).toHaveBeenCalledWith(
        'path/with/{braces}/file.txt',
      );
      expect(result).toEqual([
        { text: 'Analyze ' },
        { text: 'content of path/with/{braces}/file.txt' },
      ]);
    });

    it('should throw an error if the prompt contains an unclosed trigger', async () => {
      const processor = new AtFileProcessor();
      const prompt: PartUnion[] = [{ text: 'Hello @{world' }];
      // The new parser throws an error for unclosed injections.
      await expect(processor.process(prompt, context)).rejects.toThrow(
        /Unclosed injection/,
      );
    });
  });

  describe('Integration and Error Handling', () => {
    it('should leave the placeholder unmodified if readDirectFileContent throws', async () => {
      const processor = new AtFileProcessor();
      const prompt: PartUnion[] = [
        { text: 'Analyze @{not-found.txt} and @{good-file.txt}' },
      ];
      mockReadDirectFileContent.mockImplementation(async (path: string) => {
        if (path === 'not-found.txt') {
          throw new Error('File not found');
        }
        return `content of ${path}`;
      });

      const result = await processor.process(prompt, context);
      expect(result).toEqual([
        { text: 'Analyze ' },
        { text: '@{not-found.txt}' }, // Placeholder is preserved as a text part
        { text: ' and ' },
        { text: 'content of good-file.txt' },
      ]);
    });
  });

  describe('UI Feedback', () => {
    it('should call ui.addItem with an ERROR on failure', async () => {
      const processor = new AtFileProcessor();
      const prompt: PartUnion[] = [{ text: 'Analyze @{bad-file.txt}' }];
      mockReadDirectFileContent.mockRejectedValue(new Error('Access denied'));

      await processor.process(prompt, context);

      expect(context.ui.addItem).toHaveBeenCalledTimes(1);
      expect(context.ui.addItem).toHaveBeenCalledWith(
        {
          type: MessageType.ERROR,
          text: "Failed to inject content for '@{bad-file.txt}': Access denied",
        },
        expect.any(Number),
      );
    });

    it('should NOT show ignored warning for explicit file references (new behavior)', async () => {
      // With the new direct access method, files are NEVER ignored when explicitly referenced
      // This test verifies that the old "ignored" warning path is no longer triggered
      const processor = new AtFileProcessor();
      const prompt: PartUnion[] = [{ text: 'Analyze @{ignored.txt}' }];
      mockReadDirectFileContent.mockResolvedValue('content of ignored.txt');

      const result = await processor.process(prompt, context);

      // The file content should be included regardless of ignore rules
      expect(result).toEqual([
        { text: 'Analyze ' },
        { text: 'content of ignored.txt' },
      ]);

      // NO ui.addItem should be called for ignored files anymore
      expect(context.ui.addItem).not.toHaveBeenCalled();
    });

    it('should NOT call ui.addItem on success', async () => {
      const processor = new AtFileProcessor();
      const prompt: PartUnion[] = [{ text: 'Analyze @{good-file.txt}' }];
      await processor.process(prompt, context);
      expect(context.ui.addItem).not.toHaveBeenCalled();
    });
  });
});
