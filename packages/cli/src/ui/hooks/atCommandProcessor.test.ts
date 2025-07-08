/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import type { Mocked } from 'vitest';
import { handleAtCommand } from './atCommandProcessor.js';
import { Config, FileDiscoveryService } from '@google/gemini-cli-core';
import { ToolCallStatus } from '../types.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import * as fsPromises from 'fs/promises';
import type { Stats } from 'fs';

const mockGetToolRegistry = vi.fn();
const mockGetTargetDir = vi.fn();
const mockConfig = {
  getToolRegistry: mockGetToolRegistry,
  getTargetDir: mockGetTargetDir,
  isSandboxed: vi.fn(() => false),
  getFileService: vi.fn(),
  getFileFilteringRespectGitIgnore: vi.fn(() => true),
  getEnableRecursiveFileSearch: vi.fn(() => true),
} as unknown as Config;

const mockReadManyFilesExecute = vi.fn();
const mockReadManyFilesTool = {
  name: 'read_many_files',
  displayName: 'Read Many Files',
  description: 'Reads multiple files.',
  execute: mockReadManyFilesExecute,
  getDescription: vi.fn((params) => `Read files: ${params.paths.join(', ')}`),
};

const mockGlobExecute = vi.fn();
const mockGlobTool = {
  name: 'glob',
  displayName: 'Glob Tool',
  execute: mockGlobExecute,
  getDescription: vi.fn(() => 'Glob tool description'),
};

const mockAddItem: Mock<UseHistoryManagerReturn['addItem']> = vi.fn();
const mockOnDebugMessage: Mock<(message: string) => void> = vi.fn();

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    stat: vi.fn(),
  };
});

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    FileDiscoveryService: vi.fn(),
  };
});

describe('handleAtCommand', () => {
  let abortController: AbortController;
  let mockFileDiscoveryService: Mocked<FileDiscoveryService>;

  beforeEach(() => {
    vi.resetAllMocks();
    abortController = new AbortController();
    mockGetTargetDir.mockReturnValue('/test/dir');
    mockGetToolRegistry.mockReturnValue({
      getTool: vi.fn((toolName: string) => {
        if (toolName === 'read_many_files') return mockReadManyFilesTool;
        if (toolName === 'glob') return mockGlobTool;
        return undefined;
      }),
    });
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => false,
    } as Stats);
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: '',
      returnDisplay: '',
    });
    mockGlobExecute.mockResolvedValue({
      llmContent: 'No files found',
      returnDisplay: '',
    });

    // Mock FileDiscoveryService
    mockFileDiscoveryService = {
      initialize: vi.fn(),
      shouldIgnoreFile: vi.fn(() => false),
      filterFiles: vi.fn((files) => files),
      getIgnoreInfo: vi.fn(() => ({ gitIgnored: [] })),
      isGitRepository: vi.fn(() => true),
    };
    vi.mocked(FileDiscoveryService).mockImplementation(
      () => mockFileDiscoveryService,
    );

    // Mock getFileService to return the mocked FileDiscoveryService
    mockConfig.getFileService = vi
      .fn()
      .mockReturnValue(mockFileDiscoveryService);
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

  it('should pass through original query if only a lone @ symbol is present', async () => {
    const queryWithSpaces = '  @  ';
    const result = await handleAtCommand({
      query: queryWithSpaces,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 124,
      signal: abortController.signal,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: queryWithSpaces },
      124,
    );
    expect(result.processedQuery).toEqual([{ text: queryWithSpaces }]);
    expect(result.shouldProceed).toBe(true);
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      'Lone @ detected, will be treated as text in the modified query.',
    );
  });

  it('should process a valid text file path', async () => {
    const filePath = 'path/to/file.txt';
    const query = `@${filePath}`;
    const fileContent = 'This is the file content.';
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [`--- ${filePath} ---\n\n${fileContent}\n\n`],
      returnDisplay: 'Read 1 file.',
    });

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
      { paths: [filePath], respect_git_ignore: true },
      abortController.signal,
    );
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_group',
        tools: [expect.objectContaining({ status: ToolCallStatus.Success })],
      }),
      125,
    );
    expect(result.processedQuery).toEqual([
      { text: `@${filePath}` },
      { text: '\n--- Content from referenced files ---' },
      { text: `\nContent from @${filePath}:\n` },
      { text: fileContent },
      { text: '\n--- End of content ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should process a valid directory path and convert to glob', async () => {
    const dirPath = 'path/to/dir';
    const query = `@${dirPath}`;
    const resolvedGlob = `${dirPath}/**`;
    const fileContent = 'Directory content.';
    vi.mocked(fsPromises.stat).mockResolvedValue({
      isDirectory: () => true,
    } as Stats);
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [`--- ${resolvedGlob} ---\n\n${fileContent}\n\n`],
      returnDisplay: 'Read directory contents.',
    });

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
      { paths: [resolvedGlob], respect_git_ignore: true },
      abortController.signal,
    );
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      `Path ${dirPath} resolved to directory, using glob: ${resolvedGlob}`,
    );
    expect(result.processedQuery).toEqual([
      { text: `@${resolvedGlob}` },
      { text: '\n--- Content from referenced files ---' },
      { text: `\nContent from @${resolvedGlob}:\n` },
      { text: fileContent },
      { text: '\n--- End of content ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should process a valid image file path (as text content for now)', async () => {
    const imagePath = 'path/to/image.png';
    const query = `@${imagePath}`;
    // For @-commands, read_many_files is expected to return text or structured text.
    // If it were to return actual image Part, the test and handling would be different.
    // Current implementation of read_many_files for images returns base64 in text.
    const imageFileTextContent = '[base64 image data for path/to/image.png]';
    const imagePart = {
      mimeType: 'image/png',
      inlineData: imageFileTextContent,
    };
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [imagePart],
      returnDisplay: 'Read 1 image.',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 127,
      signal: abortController.signal,
    });
    expect(result.processedQuery).toEqual([
      { text: `@${imagePath}` },
      { text: '\n--- Content from referenced files ---' },
      imagePart,
      { text: '\n--- End of content ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should handle query with text before and after @command', async () => {
    const textBefore = 'Explain this: ';
    const filePath = 'doc.md';
    const textAfter = ' in detail.';
    const query = `${textBefore}@${filePath}${textAfter}`;
    const fileContent = 'Markdown content.';
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [`--- ${filePath} ---\n\n${fileContent}\n\n`],
      returnDisplay: 'Read 1 doc.',
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
      { type: 'user', text: query },
      128,
    );
    expect(result.processedQuery).toEqual([
      { text: `${textBefore}@${filePath}${textAfter}` },
      { text: '\n--- Content from referenced files ---' },
      { text: `\nContent from @${filePath}:\n` },
      { text: fileContent },
      { text: '\n--- End of content ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should correctly unescape paths with escaped spaces', async () => {
    const rawPath = 'path/to/my\\ file.txt';
    const unescapedPath = 'path/to/my file.txt';
    const query = `@${rawPath}`;
    const fileContent = 'Content of file with space.';
    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [`--- ${unescapedPath} ---\n\n${fileContent}\n\n`],
      returnDisplay: 'Read 1 file.',
    });

    await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 129,
      signal: abortController.signal,
    });
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [unescapedPath], respect_git_ignore: true },
      abortController.signal,
    );
  });

  it('should handle multiple @file references', async () => {
    const file1 = 'file1.txt';
    const content1 = 'Content file1';
    const file2 = 'file2.md';
    const content2 = 'Content file2';
    const query = `@${file1} @${file2}`;

    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [
        `--- ${file1} ---\n\n${content1}\n\n`,
        `--- ${file2} ---\n\n${content2}\n\n`,
      ],
      returnDisplay: 'Read 2 files.',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 130,
      signal: abortController.signal,
    });
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [file1, file2], respect_git_ignore: true },
      abortController.signal,
    );
    expect(result.processedQuery).toEqual([
      { text: `@${file1} @${file2}` },
      { text: '\n--- Content from referenced files ---' },
      { text: `\nContent from @${file1}:\n` },
      { text: content1 },
      { text: `\nContent from @${file2}:\n` },
      { text: content2 },
      { text: '\n--- End of content ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should handle multiple @file references with interleaved text', async () => {
    const text1 = 'Check ';
    const file1 = 'f1.txt';
    const content1 = 'C1';
    const text2 = ' and ';
    const file2 = 'f2.md';
    const content2 = 'C2';
    const text3 = ' please.';
    const query = `${text1}@${file1}${text2}@${file2}${text3}`;

    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [
        `--- ${file1} ---\n\n${content1}\n\n`,
        `--- ${file2} ---\n\n${content2}\n\n`,
      ],
      returnDisplay: 'Read 2 files.',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 131,
      signal: abortController.signal,
    });
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [file1, file2], respect_git_ignore: true },
      abortController.signal,
    );
    expect(result.processedQuery).toEqual([
      { text: `${text1}@${file1}${text2}@${file2}${text3}` },
      { text: '\n--- Content from referenced files ---' },
      { text: `\nContent from @${file1}:\n` },
      { text: content1 },
      { text: `\nContent from @${file2}:\n` },
      { text: content2 },
      { text: '\n--- End of content ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  it('should handle a mix of valid, invalid, and lone @ references', async () => {
    const file1 = 'valid1.txt';
    const content1 = 'Valid content 1';
    const invalidFile = 'nonexistent.txt';
    const query = `Look at @${file1} then @${invalidFile} and also just @ symbol, then @valid2.glob`;
    const file2Glob = 'valid2.glob';
    const resolvedFile2 = 'resolved/valid2.actual';
    const content2 = 'Globbed content';

    // Mock fs.stat for file1 (valid)
    vi.mocked(fsPromises.stat).mockImplementation(async (p) => {
      if (p.toString().endsWith(file1))
        return { isDirectory: () => false } as Stats;
      if (p.toString().endsWith(invalidFile))
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      // For valid2.glob, stat will fail, triggering glob
      if (p.toString().endsWith(file2Glob))
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return { isDirectory: () => false } as Stats; // Default
    });

    // Mock glob to find resolvedFile2 for valid2.glob
    mockGlobExecute.mockImplementation(async (params) => {
      if (params.pattern.includes('valid2.glob')) {
        return {
          llmContent: `Found files:\n${mockGetTargetDir()}/${resolvedFile2}`,
          returnDisplay: 'Found 1 file',
        };
      }
      return { llmContent: 'No files found', returnDisplay: '' };
    });

    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [
        `--- ${file1} ---\n\n${content1}\n\n`,
        `--- ${resolvedFile2} ---\n\n${content2}\n\n`,
      ],
      returnDisplay: 'Read 2 files.',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 132,
      signal: abortController.signal,
    });

    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      { paths: [file1, resolvedFile2], respect_git_ignore: true },
      abortController.signal,
    );
    expect(result.processedQuery).toEqual([
      // Original query has @nonexistent.txt and @, but resolved has @resolved/valid2.actual
      {
        text: `Look at @${file1} then @${invalidFile} and also just @ symbol, then @${resolvedFile2}`,
      },
      { text: '\n--- Content from referenced files ---' },
      { text: `\nContent from @${file1}:\n` },
      { text: content1 },
      { text: `\nContent from @${resolvedFile2}:\n` },
      { text: content2 },
      { text: '\n--- End of content ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      `Path ${invalidFile} not found directly, attempting glob search.`,
    );
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      `Glob search for '**/*${invalidFile}*' found no files or an error. Path ${invalidFile} will be skipped.`,
    );
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      'Lone @ detected, will be treated as text in the modified query.',
    );
  });

  it('should return original query if all @paths are invalid or lone @', async () => {
    const query = 'Check @nonexistent.txt and @ also';
    vi.mocked(fsPromises.stat).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );
    mockGlobExecute.mockResolvedValue({
      llmContent: 'No files found',
      returnDisplay: '',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 133,
      signal: abortController.signal,
    });
    expect(mockReadManyFilesExecute).not.toHaveBeenCalled();
    // The modified query string will be "Check @nonexistent.txt and @ also" because no paths were resolved for reading.
    expect(result.processedQuery).toEqual([
      { text: 'Check @nonexistent.txt and @ also' },
    ]);

    expect(result.shouldProceed).toBe(true);
  });

  it('should process a file path case-insensitively', async () => {
    // const actualFilePath = 'path/to/MyFile.txt'; // Unused, path in llmContent should match queryPath
    const queryPath = 'path/to/myfile.txt'; // Different case
    const query = `@${queryPath}`;
    const fileContent = 'This is the case-insensitive file content.';

    // Mock fs.stat to "find" MyFile.txt when looking for myfile.txt
    // This simulates a case-insensitive file system or resolution
    vi.mocked(fsPromises.stat).mockImplementation(async (p) => {
      if (p.toString().toLowerCase().endsWith('myfile.txt')) {
        return {
          isDirectory: () => false,
          // You might need to add other Stats properties if your code uses them
        } as Stats;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    mockReadManyFilesExecute.mockResolvedValue({
      llmContent: [`--- ${queryPath} ---\n\n${fileContent}\n\n`],
      returnDisplay: 'Read 1 file.',
    });

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 134, // New messageId
      signal: abortController.signal,
    });

    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      134,
    );
    // The atCommandProcessor resolves the path before calling read_many_files.
    // We expect it to be called with the path that fs.stat "found".
    // In a real case-insensitive FS, stat(myfile.txt) might return info for MyFile.txt.
    // The key is that *a* valid path that points to the content is used.
    expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
      // Depending on how path resolution and fs.stat mock interact,
      // this could be queryPath or actualFilePath.
      // For this test, we'll assume the processor uses the path that stat "succeeded" with.
      // If the underlying fs/stat is truly case-insensitive, it might resolve to actualFilePath.
      // If the mock is simpler, it might use queryPath if stat(queryPath) succeeds.
      // The most important part is that *some* version of the path that leads to the content is used.
      // Let's assume it uses the path from the query if stat confirms it exists (even if different case on disk)
      { paths: [queryPath], respect_git_ignore: true },
      abortController.signal,
    );
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_group',
        tools: [expect.objectContaining({ status: ToolCallStatus.Success })],
      }),
      134,
    );
    expect(result.processedQuery).toEqual([
      { text: `@${queryPath}` }, // Query uses the input path
      { text: '\n--- Content from referenced files ---' },
      { text: `\nContent from @${queryPath}:\n` }, // Content display also uses input path
      { text: fileContent },
      { text: '\n--- End of content ---' },
    ]);
    expect(result.shouldProceed).toBe(true);
  });

  describe('git-aware filtering', () => {
    it('should skip git-ignored files in @ commands', async () => {
      const gitIgnoredFile = 'node_modules/package.json';
      const query = `@${gitIgnoredFile}`;

      // Mock the file discovery service to report this file as git-ignored
      mockFileDiscoveryService.shouldIgnoreFile.mockImplementation(
        (path: string, options?: { respectGitIgnore?: boolean }) =>
          path === gitIgnoredFile && options?.respectGitIgnore !== false,
      );

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 200,
        signal: abortController.signal,
      });

      expect(mockFileDiscoveryService.shouldIgnoreFile).toHaveBeenCalledWith(
        gitIgnoredFile,
        { respectGitIgnore: true },
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Path ${gitIgnoredFile} is git-ignored and will be skipped.`,
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        'Ignored 1 git-ignored files: node_modules/package.json',
      );
      expect(mockReadManyFilesExecute).not.toHaveBeenCalled();
      expect(result.processedQuery).toEqual([{ text: query }]);
      expect(result.shouldProceed).toBe(true);
    });

    it('should process non-git-ignored files normally', async () => {
      const validFile = 'src/index.ts';
      const query = `@${validFile}`;
      const fileContent = 'console.log("Hello world");';

      mockFileDiscoveryService.shouldIgnoreFile.mockReturnValue(false);
      mockReadManyFilesExecute.mockResolvedValue({
        llmContent: [`--- ${validFile} ---\n\n${fileContent}\n\n`],
        returnDisplay: 'Read 1 file.',
      });

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 201,
        signal: abortController.signal,
      });

      expect(mockFileDiscoveryService.shouldIgnoreFile).toHaveBeenCalledWith(
        validFile,
        { respectGitIgnore: true },
      );
      expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
        { paths: [validFile], respect_git_ignore: true },
        abortController.signal,
      );
      expect(result.processedQuery).toEqual([
        { text: `@${validFile}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${validFile}:\n` },
        { text: fileContent },
        { text: '\n--- End of content ---' },
      ]);
      expect(result.shouldProceed).toBe(true);
    });

    it('should handle mixed git-ignored and valid files', async () => {
      const validFile = 'README.md';
      const gitIgnoredFile = '.env';
      const query = `@${validFile} @${gitIgnoredFile}`;
      const fileContent = '# Project README';

      mockFileDiscoveryService.shouldIgnoreFile.mockImplementation(
        (path: string, options?: { respectGitIgnore?: boolean }) =>
          path === gitIgnoredFile && options?.respectGitIgnore !== false,
      );
      mockReadManyFilesExecute.mockResolvedValue({
        llmContent: [`--- ${validFile} ---\n\n${fileContent}\n\n`],
        returnDisplay: 'Read 1 file.',
      });

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 202,
        signal: abortController.signal,
      });

      expect(mockFileDiscoveryService.shouldIgnoreFile).toHaveBeenCalledWith(
        validFile,
        { respectGitIgnore: true },
      );
      expect(mockFileDiscoveryService.shouldIgnoreFile).toHaveBeenCalledWith(
        gitIgnoredFile,
        { respectGitIgnore: true },
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Path ${gitIgnoredFile} is git-ignored and will be skipped.`,
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        'Ignored 1 git-ignored files: .env',
      );
      expect(mockReadManyFilesExecute).toHaveBeenCalledWith(
        { paths: [validFile], respect_git_ignore: true },
        abortController.signal,
      );
      expect(result.processedQuery).toEqual([
        { text: `@${validFile} @${gitIgnoredFile}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${validFile}:\n` },
        { text: fileContent },
        { text: '\n--- End of content ---' },
      ]);
      expect(result.shouldProceed).toBe(true);
    });

    it('should always ignore .git directory files', async () => {
      const gitFile = '.git/config';
      const query = `@${gitFile}`;

      mockFileDiscoveryService.shouldIgnoreFile.mockReturnValue(true);

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 203,
        signal: abortController.signal,
      });

      expect(mockFileDiscoveryService.shouldIgnoreFile).toHaveBeenCalledWith(
        gitFile,
        { respectGitIgnore: true },
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Path ${gitFile} is git-ignored and will be skipped.`,
      );
      expect(mockReadManyFilesExecute).not.toHaveBeenCalled();
      expect(result.processedQuery).toEqual([{ text: query }]);
      expect(result.shouldProceed).toBe(true);
    });
  });

  describe('when recursive file search is disabled', () => {
    beforeEach(() => {
      vi.mocked(mockConfig.getEnableRecursiveFileSearch).mockReturnValue(false);
    });

    it('should not use glob search for a nonexistent file', async () => {
      const invalidFile = 'nonexistent.txt';
      const query = `@${invalidFile}`;

      vi.mocked(fsPromises.stat).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 300,
        signal: abortController.signal,
      });

      expect(mockGlobExecute).not.toHaveBeenCalled();
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Glob tool not found. Path ${invalidFile} will be skipped.`,
      );
      expect(result.processedQuery).toEqual([{ text: query }]);
      expect(result.shouldProceed).toBe(true);
    });
  });
});
