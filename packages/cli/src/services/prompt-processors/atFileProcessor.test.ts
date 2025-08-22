/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { CommandContext } from '../../ui/commands/types.js';
import { AtFileProcessor } from './atFileProcessor.js';
import { MessageType } from '../../ui/types.js';
import { Config, WorkspaceContext } from '@google/gemini-cli-core';

// Mock the core dependency
const mockReadPathFromWorkspace = vi.hoisted(() => vi.fn());
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original = await importOriginal<object>();
  return {
    ...original,
    readPathFromWorkspace: mockReadPathFromWorkspace,
  };
});

describe('AtFileProcessor', () => {
  let context: CommandContext;
  let mockConfig: Partial<Config>;
  let mockWorkspaceContext: WorkspaceContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the workspace context that the config will return
    mockWorkspaceContext = {} as WorkspaceContext; // It's opaque to the processor

    mockConfig = {
      getWorkspaceContext: vi.fn().mockReturnValue(mockWorkspaceContext),
    };

    context = createMockCommandContext({
      services: {
        config: mockConfig as Config,
      },
    });

    // Default mock success behavior
    mockReadPathFromWorkspace.mockImplementation(
      async (path: string) => `content of ${path}`,
    );
  });

  it('should not change the prompt if no @{ trigger is present', async () => {
    const processor = new AtFileProcessor();
    const prompt = 'This is a simple prompt.';
    const result = await processor.process(prompt, context);
    expect(result).toBe(prompt);
    expect(mockReadPathFromWorkspace).not.toHaveBeenCalled();
  });

  it('should not change the prompt if config service is missing', async () => {
    const processor = new AtFileProcessor();
    const prompt = 'Analyze @{file.txt}';
    const contextWithoutConfig = createMockCommandContext({
      services: {
        config: null,
      },
    });
    const result = await processor.process(prompt, contextWithoutConfig);
    expect(result).toBe(prompt);
    expect(mockReadPathFromWorkspace).not.toHaveBeenCalled();
  });

  describe('Parsing Logic', () => {
    it('should replace a single valid @{path/to/file.txt} placeholder', async () => {
      const processor = new AtFileProcessor();
      const prompt = 'Analyze this file: @{path/to/file.txt}';
      const result = await processor.process(prompt, context);
      expect(mockReadPathFromWorkspace).toHaveBeenCalledWith(
        'path/to/file.txt',
        mockWorkspaceContext,
      );
      expect(result).toBe('Analyze this file: content of path/to/file.txt');
    });

    it('should replace multiple different @{...} placeholders', async () => {
      const processor = new AtFileProcessor();
      const prompt = 'Compare @{file1.js} with @{file2.js}';
      const result = await processor.process(prompt, context);
      expect(mockReadPathFromWorkspace).toHaveBeenCalledTimes(2);
      expect(mockReadPathFromWorkspace).toHaveBeenCalledWith(
        'file1.js',
        mockWorkspaceContext,
      );
      expect(mockReadPathFromWorkspace).toHaveBeenCalledWith(
        'file2.js',
        mockWorkspaceContext,
      );
      expect(result).toBe(
        'Compare content of file1.js with content of file2.js',
      );
    });

    it('should handle placeholders at the beginning, middle, and end', async () => {
      const processor = new AtFileProcessor();
      const prompt = '@{start.txt} in the @{middle.txt} and @{end.txt}';
      const result = await processor.process(prompt, context);
      expect(result).toBe(
        'content of start.txt in the content of middle.txt and content of end.txt',
      );
    });

    it('should correctly parse paths that contain balanced braces', async () => {
      const processor = new AtFileProcessor();
      const prompt = 'Analyze @{path/with/{braces}/file.txt}';
      const result = await processor.process(prompt, context);
      expect(mockReadPathFromWorkspace).toHaveBeenCalledWith(
        'path/with/{braces}/file.txt',
        mockWorkspaceContext,
      );
      expect(result).toBe('Analyze content of path/with/{braces}/file.txt');
    });

    it('should leave the prompt unmodified if it contains an unclosed trigger', async () => {
      const processor = new AtFileProcessor();
      const prompt = 'Hello @{world';
      const result = await processor.process(prompt, context);
      expect(result).toBe(prompt);
      expect(mockReadPathFromWorkspace).not.toHaveBeenCalled();
    });
  });

  describe('Integration and Error Handling', () => {
    it('should leave the placeholder unmodified if readPathFromWorkspace throws', async () => {
      const processor = new AtFileProcessor();
      const prompt = 'Analyze @{not-found.txt} and @{good-file.txt}';
      mockReadPathFromWorkspace.mockImplementation(async (path: string) => {
        if (path === 'not-found.txt') {
          throw new Error('File not found');
        }
        return `content of ${path}`;
      });

      const result = await processor.process(prompt, context);
      expect(result).toBe(
        'Analyze @{not-found.txt} and content of good-file.txt',
      );
    });
  });

  describe('UI Feedback', () => {
    it('should call ui.addItem with an ERROR on failure', async () => {
      const processor = new AtFileProcessor();
      const prompt = 'Analyze @{bad-file.txt}';
      mockReadPathFromWorkspace.mockRejectedValue(new Error('Access denied'));

      await processor.process(prompt, context);

      expect(context.ui.addItem).toHaveBeenCalledTimes(1);
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: "Failed to inject file content for '@{bad-file.txt}': Access denied",
        }),
        expect.any(Number),
      );
    });

    it('should NOT call ui.addItem on success', async () => {
      const processor = new AtFileProcessor();
      const prompt = 'Analyze @{good-file.txt}';
      await processor.process(prompt, context);
      expect(context.ui.addItem).not.toHaveBeenCalled();
    });
  });
});
