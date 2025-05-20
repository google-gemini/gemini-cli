/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { handleAtCommand } from './atCommandProcessor.js';
import { Config, ToolResult } from '@gemini-code/server';
import { ToolCallStatus } from '../types.js'; // Adjusted import
import { /* PartListUnion, */ Part } from '@google/genai'; // Removed PartListUnion
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import * as fsPromises from 'fs/promises'; // Import for mocking stat
import type { Stats } from 'fs'; // Import Stats type for mocking

// Mock Config and ToolRegistry
const mockGetToolRegistry = vi.fn();
const mockGetTargetDir = vi.fn();
const mockConfig = {
  getToolRegistry: mockGetToolRegistry,
  getTargetDir: mockGetTargetDir,
} as unknown as Config;

// Mock read_many_files tool
const mockReadManyFilesExecute = vi.fn();
const mockReadManyFilesTool = {
  name: 'read_many_files',
  displayName: 'Read Many Files',
  description: 'Reads multiple files.',
  execute: mockReadManyFilesExecute,
  getDescription: vi.fn((params) => `Read files: ${params.paths.join(', ')}`),
};

// Mock addItem from useHistoryManager
const mockAddItem: Mock<UseHistoryManagerReturn['addItem']> = vi.fn();
const mockOnDebugMessage: Mock<(message: string) => void> = vi.fn();

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    stat: vi.fn(), // Mock stat here
  };
});

describe('handleAtCommand', () => {
  let abortController: AbortController;

  beforeEach(() => {
    vi.resetAllMocks();
    abortController = new AbortController();
    mockGetTargetDir.mockReturnValue('/test/dir');
    mockGetToolRegistry.mockReturnValue({
      getTool: vi.fn((toolName: string) => {
        if (toolName === 'read_many_files') {
          return mockReadManyFilesTool;
        }
        return undefined;
      }),
    });
    // Default mock for fs.stat if not overridden by a specific test
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => false,
    } as unknown as Stats);
  });

  afterEach(() => {
    abortController.abort(); // Ensure any pending operations are cancelled
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

  it('should pass through query if only a lone @ symbol is present', async () => {
    const queryWithSpaces = '  @  ';
    // const trimmedQuery = queryWithSpaces.trim(); // Not needed for addItem expectation here
    const result = await handleAtCommand({
      query: queryWithSpaces, // Pass the version with spaces to the function
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 124,
      signal: abortController.signal,
    });

    // For a lone '@', addItem is called with the *original untrimmed* query
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: queryWithSpaces },
      124,
    );
    // processedQuery should also be the original untrimmed version for lone @
    expect(result.processedQuery).toEqual([{ text: queryWithSpaces }]);
    expect(result.shouldProceed).toBe(true);
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      'Lone @ detected, passing directly to LLM.',
    );
  });

  it('should process a valid text file path', async () => {
    const filePath = 'path/to/file.txt';
    const query = `@${filePath}`;
    const fileContent = 'This is the file content.';
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: fileContent,
      returnDisplay: 'Read 1 file.',
    } as ToolResult);
    // fs.stat will use the default mock (isDirectory: false)

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 125,
      signal: abortController.signal,
    });

    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      125,
    );
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [filePath] },
      abortController.signal,
    );
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_group',
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: 'Read Many Files',
            status: ToolCallStatus.Success,
            resultDisplay: 'Read 1 file.',
          }),
        ]),
      }),
      125,
    );
    expect(result.processedQuery).toEqual([
      '\n--- Content from: ${contentLabel} ---\n',
      fileContent,
      '\n--- End of content ---\n',
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should process a valid directory path and convert to glob', async () => {
    const dirPath = 'path/to/dir';
    const query = `@${dirPath}`;
    const dirContent = [
      'Content of file 1.',
      'Content of file 2.',
      'Content of file 3.',
    ];
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);

    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: dirContent,
      returnDisplay: 'Read directory contents.',
    } as ToolResult);

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 126,
      signal: abortController.signal,
    });

    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      126,
    );
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [`${dirPath}/**`] }, // Expect glob pattern
      abortController.signal,
    );
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      `Path resolved to directory, using glob: ${dirPath}/**`,
    );
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool_group' }),
      126,
    );
    expect(result.processedQuery).toEqual([
      '\n--- Content from: ${contentLabel} ---\n',
      ...dirContent,
      '\n--- End of content ---\n',
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should process a valid image file path', async () => {
    const imagePath = 'path/to/image.png';
    const query = `@${imagePath}`;
    const imageData: Part = {
      inlineData: { mimeType: 'image/png', data: 'base64imagedata' },
    };
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [imageData],
      returnDisplay: 'Read 1 image.',
    } as ToolResult);
    // fs.stat will use the default mock (isDirectory: false)

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 127,
      signal: abortController.signal,
    });

    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      127,
    );
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [imagePath] },
      abortController.signal,
    );
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_group',
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: 'Read Many Files',
            status: ToolCallStatus.Success,
            resultDisplay: 'Read 1 image.',
          }),
        ]),
      }),
      127,
    );
    expect(result.processedQuery).toEqual([
      '\n--- Content from: ${contentLabel} ---\n',
      imageData,
      '\n--- End of content ---\n',
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should handle query with text before and after @command', async () => {
    const textBefore = 'Explain this:';
    const filePath = 'doc.md';
    const textAfter = 'in detail.';
    const query = `${textBefore} @${filePath} ${textAfter}`;
    const fileContent = 'Markdown content.';
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: fileContent,
      returnDisplay: 'Read 1 doc.',
    } as ToolResult);
    // fs.stat will use the default mock (isDirectory: false)

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 128,
      signal: abortController.signal,
    });

    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query }, // Expect original query for addItem
      128,
    );
    expect(result.processedQuery).toEqual([
      { text: textBefore },
      '\n--- Content from: ${contentLabel} ---\n',
      fileContent,
      '\n--- End of content ---\n',
      { text: textAfter },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should correctly unescape paths with escaped spaces', async () => {
    const rawPath = 'path/to/my\\ file.txt';
    const unescapedPath = 'path/to/my file.txt';
    const query = `@${rawPath}`;
    const fileContent = 'Content of file with space.';
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: fileContent,
      returnDisplay: 'Read 1 file.',
    } as ToolResult);
    // fs.stat will use the default mock (isDirectory: false)

    await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 129,
      signal: abortController.signal,
    });

    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [unescapedPath] }, // Expect unescaped path
      abortController.signal,
    );
  });
});
