/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { handleAtCommand } from './atCommandProcessor.js';
import { Config } from '@google/gemini-cli-core';
import { ToolCallStatus } from '../types.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';

const mockGetToolRegistry = vi.fn();
const mockConfig = {
  getToolRegistry: mockGetToolRegistry,
} as unknown as Config;

const mockReadManyFilesExecute = vi.fn();
const mockReadManyFilesTool = {
  name: 'read_many_files',
  displayName: 'Read Many Files',
  description: 'Reads multiple files.',
  execute: mockReadManyFilesExecute,
  getDescription: vi.fn((params) => `Read files: ${params.paths.join(', ')}`),
};

const mockAddItem: Mock<UseHistoryManagerReturn['addItem']> = vi.fn();
const mockOnDebugMessage: Mock<(message: string) => void> = vi.fn();

describe('handleAtCommand', () => {
  let abortController: AbortController;

  beforeEach(() => {
    vi.resetAllMocks();
    abortController = new AbortController();
    mockGetToolRegistry.mockReturnValue({
      getTool: vi.fn((toolName: string) => {
        if (toolName === 'read_many_files') return mockReadManyFilesTool;
        return undefined;
      }),
    });
  });

  afterEach(() => {
    abortController.abort();
  });

  it('should pass through query if no @ command is present', async () => {
    const query = 'regular user query';
    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 123,
      signal: abortController.signal,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      123,
    );
    expect(result.processedQuery).toEqual([{ text: query }]);
    expect(result.shouldProceed).toBe(true);
    expect(mockReadManyFilesExecute).not.toHaveBeenCalled();
  });

  it('should process a single @file command', async () => {
    const filePath = 'src/index.ts';
    const query = `@${filePath}`;
    const fileContent = 'console.log("hello world")';
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [`--- ${filePath} ---\n\n${fileContent}\n\n`],
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 124,
      signal: abortController.signal,
    });

    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [filePath] },
      abortController.signal,
    );
    expect(result.processedQuery).toEqual([
      { text: query },
      { text: '\n--- Content from referenced files ---' },
      { text: `\nContent from @${filePath}:\n` },
      { text: fileContent },
      { text: '\n--- End of content ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should process multiple @file commands', async () => {
    const file1 = 'src/index.ts';
    const file2 = 'src/app.ts';
    const query = `@${file1} @${file2}`;
    const content1 = 'console.log("hello world")';
    const content2 = 'console.log("hello app")';
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [
        `--- ${file1} ---\n\n${content1}\n\n`,
        `--- ${file2} ---\n\n${content2}\n\n`,
      ],
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 125,
      signal: abortController.signal,
    });

    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [file1, file2] },
      abortController.signal,
    );
    expect(result.processedQuery).toEqual([
      { text: query },
      { text: '\n--- Content from referenced files ---' },
      { text: `\nContent from @${file1}:\n` },
      { text: content1 },
      { text: `\nContent from @${file2}:\n` },
      { text: content2 },
      { text: '\n--- End of content ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should handle interleaved text', async () => {
    const file1 = 'src/index.ts';
    const file2 = 'src/app.ts';
    const query = `hello @${file1} world @${file2} !`;
    const content1 = 'console.log("hello world")';
    const content2 = 'console.log("hello app")';
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [
        `--- ${file1} ---\n\n${content1}\n\n`,
        `--- ${file2} ---\n\n${content2}\n\n`,
      ],
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 126,
      signal: abortController.signal,
    });

    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [file1, file2] },
      abortController.signal,
    );
    expect(result.processedQuery).toEqual([
      { text: query },
      { text: '\n--- Content from referenced files ---' },
      { text: `\nContent from @${file1}:\n` },
      { text: content1 },
      { text: `\nContent from @${file2}:\n` },
      { text: content2 },
      { text: '\n--- End of content ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should handle error from read_many_files tool', async () => {
    const filePath = 'src/index.ts';
    const query = `@${filePath}`;
    const error = new Error('File not found');
    mockReadManyFilesExecute.mockRejectedValue(error);

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 127,
      signal: abortController.signal,
    });

    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [filePath] },
      abortController.signal,
    );
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_group',
        tools: [
          expect.objectContaining({
            status: ToolCallStatus.Error,
            resultDisplay: `Error reading files (@${filePath}): ${error.message}`,
          }),
        ],
      }),
      127,
    );
    expect(result.processedQuery).toBeNull();
    expect(result.shouldProceed).toBe(false);
  });

  it('should handle case where read_many_files tool is not found', async () => {
    const filePath = 'src/index.ts';
    const query = `@${filePath}`;
    mockGetToolRegistry.mockReturnValue({
      getTool: vi.fn(() => undefined),
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 128,
      signal: abortController.signal,
    });

    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'error', text: 'Error: read_many_files tool not found.' },
      128,
    );
    expect(result.processedQuery).toBeNull();
    expect(result.shouldProceed).toBe(false);
  });
});
