/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { handleAtCommand } from './atCommandProcessor.js';
import {
  Config,
  FileDiscoveryService,
  GlobTool,
  ReadManyFilesTool,
  ToolRegistry,
} from '@google/gemini-cli-core';
import * as os from 'os';
import { ToolCallStatus } from '../types.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

describe('handleAtCommand', () => {
  let testRootDir: string;
  let mockConfig: Config;

  const mockAddItem: Mock<UseHistoryManagerReturn['addItem']> = vi.fn();
  const mockOnDebugMessage: Mock<(message: string) => void> = vi.fn();

  let abortController: AbortController;

  async function createTestFile(fullPath: string, fileContents: string) {
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, fileContents);
    return path.resolve(testRootDir, fullPath);
  }

  beforeEach(async () => {
    vi.resetAllMocks();

    testRootDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'folder-structure-test-'),
    );

    abortController = new AbortController();

    const getToolRegistry = vi.fn();

    mockConfig = {
      getToolRegistry,
      getTargetDir: () => testRootDir,
      isSandboxed: () => false,
      getFileService: () => new FileDiscoveryService(testRootDir),
      getFileFilteringRespectGitIgnore: () => true,
      getFileFilteringRespectGeminiIgnore: () => true,
      getFileFilteringOptions: () => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
      getEnableRecursiveFileSearch: vi.fn(() => true),
      getWorkspaceContext: () => ({
        isPathWithinWorkspace: () => true,
        getDirectories: () => [testRootDir],
      }),
    } as unknown as Config;

    const registry = new ToolRegistry(mockConfig);
    registry.registerTool(new ReadManyFilesTool(mockConfig));
    registry.registerTool(new GlobTool(mockConfig));
    getToolRegistry.mockReturnValue(registry);
  });

  afterEach(async () => {
    abortController.abort();
    await fsPromises.rm(testRootDir, { recursive: true, force: true });
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

    expect(result).toEqual({
      processedQuery: [{ text: query }],
      shouldProceed: true,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      123,
    );
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

    expect(result).toEqual({
      processedQuery: [{ text: queryWithSpaces }],
      shouldProceed: true,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: queryWithSpaces },
      124,
    );
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      'Lone @ detected, will be treated as text in the modified query.',
    );
  });

  it('should process a valid text file path', async () => {
    const fileContent = 'This is the file content.';
    const filePath = await createTestFile(
      path.join(testRootDir, 'path', 'to', 'file.txt'),
      fileContent,
    );
    const query = `@${filePath}`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 125,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [
        { text: `@${filePath}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${filePath}:\n` },
        { text: fileContent },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      125,
    );
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_group',
        tools: [expect.objectContaining({ status: ToolCallStatus.Success })],
      }),
      125,
    );
  });

  it('should process a valid directory path and convert to glob', async () => {
    const fileContent = 'This is the file content.';
    const filePath = await createTestFile(
      path.join(testRootDir, 'path', 'to', 'file.txt'),
      fileContent,
    );
    const dirPath = path.dirname(filePath);
    const query = `@${dirPath}`;
    const resolvedGlob = `${dirPath}/**`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 126,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [
        { text: `@${resolvedGlob}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${filePath}:\n` },
        { text: fileContent },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      126,
    );
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      `Path ${dirPath} resolved to directory, using glob: ${resolvedGlob}`,
    );
  });

  it('should handle query with text before and after @command', async () => {
    const fileContent = 'Markdown content.';
    const filePath = await createTestFile(
      path.join(testRootDir, 'doc.md'),
      fileContent,
    );
    const textBefore = 'Explain this: ';
    const textAfter = ' in detail.';
    const query = `${textBefore}@${filePath}${textAfter}`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 128,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [
        { text: `${textBefore}@${filePath}${textAfter}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${filePath}:\n` },
        { text: fileContent },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      128,
    );
  });

  it('should correctly unescape paths with escaped spaces', async () => {
    const fileContent = 'This is the file content.';
    const filePath = await createTestFile(
      path.join(testRootDir, 'path', 'to', 'my file.txt'),
      fileContent,
    );
    const escapedpath = path.join(testRootDir, 'path', 'to', 'my\\ file.txt');
    const query = `@${escapedpath}`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 125,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [
        { text: `@${filePath}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${filePath}:\n` },
        { text: fileContent },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      125,
    );
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_group',
        tools: [expect.objectContaining({ status: ToolCallStatus.Success })],
      }),
      125,
    );
  });

  it('should handle multiple @file references', async () => {
    const content1 = 'Content file1';
    const file1Path = await createTestFile(
      path.join(testRootDir, 'file1.txt'),
      content1,
    );
    const content2 = 'Content file2';
    const file2Path = await createTestFile(
      path.join(testRootDir, 'file2.md'),
      content2,
    );
    const query = `@${file1Path} @${file2Path}`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 130,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [
        { text: query },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${file1Path}:\n` },
        { text: content1 },
        { text: `\nContent from @${file2Path}:\n` },
        { text: content2 },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
  });

  it('should handle multiple @file references with interleaved text', async () => {
    const text1 = 'Check ';
    const content1 = 'C1';
    const file1Path = await createTestFile(
      path.join(testRootDir, 'f1.txt'),
      content1,
    );
    const text2 = ' and ';
    const content2 = 'C2';
    const file2Path = await createTestFile(
      path.join(testRootDir, 'f2.md'),
      content2,
    );
    const text3 = ' please.';
    const query = `${text1}@${file1Path}${text2}@${file2Path}${text3}`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 131,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [
        { text: query },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${file1Path}:\n` },
        { text: content1 },
        { text: `\nContent from @${file2Path}:\n` },
        { text: content2 },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
  });

  it('should handle a mix of valid, invalid, and lone @ references', async () => {
    const content1 = 'Valid content 1';
    const file1Path = await createTestFile(
      path.join(testRootDir, 'valid1.txt'),
      content1,
    );
    const invalidFile = 'nonexistent.txt';
    const content2 = 'Globbed content';
    const file2Path = await createTestFile(
      path.join(testRootDir, 'resolved', 'valid2.actual'),
      content2,
    );
    const query = `Look at @${file1Path} then @${invalidFile} and also just @ symbol, then @${file2Path}`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 132,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [
        {
          text: `Look at @${file1Path} then @${invalidFile} and also just @ symbol, then @${file2Path}`,
        },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${file2Path}:\n` },
        { text: content2 },
        { text: `\nContent from @${file1Path}:\n` },
        { text: content1 },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
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

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 133,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [{ text: 'Check @nonexistent.txt and @ also' }],
      shouldProceed: true,
    });
  });

  describe('git-aware filtering', () => {
    beforeEach(async () => {
      await fsPromises.mkdir(path.join(testRootDir, '.git'), {
        recursive: true,
      });
    });

    it('should skip git-ignored files in @ commands', async () => {
      await createTestFile(
        path.join(testRootDir, '.gitignore'),
        'node_modules/package.json',
      );
      const gitIgnoredFile = await createTestFile(
        path.join(testRootDir, 'node_modules', 'package.json'),
        'the file contents',
      );

      const query = `@${gitIgnoredFile}`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 200,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [{ text: query }],
        shouldProceed: true,
      });
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Path ${gitIgnoredFile} is git-ignored and will be skipped.`,
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Ignored 1 files:\nGit-ignored: ${gitIgnoredFile}`,
      );
    });

    it('should process non-git-ignored files normally', async () => {
      await createTestFile(
        path.join(testRootDir, '.gitignore'),
        'node_modules/package.json',
      );

      const validFile = await createTestFile(
        path.join(testRootDir, 'src', 'index.ts'),
        'console.log("Hello world");',
      );
      const query = `@${validFile}`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 201,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `@${validFile}` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${validFile}:\n` },
          { text: 'console.log("Hello world");' },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should handle mixed git-ignored and valid files', async () => {
      await createTestFile(path.join(testRootDir, '.gitignore'), '.env');
      const validFile = await createTestFile(
        path.join(testRootDir, 'README.md'),
        '# Project README',
      );
      const gitIgnoredFile = await createTestFile(
        path.join(testRootDir, '.env'),
        'SECRET=123',
      );
      const query = `@${validFile} @${gitIgnoredFile}`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 202,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `@${validFile} @${gitIgnoredFile}` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${validFile}:\n` },
          { text: '# Project README' },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Path ${gitIgnoredFile} is git-ignored and will be skipped.`,
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Ignored 1 files:\nGit-ignored: ${gitIgnoredFile}`,
      );
    });

    it('should always ignore .git directory files', async () => {
      const gitFile = await createTestFile(
        path.join(testRootDir, '.git', 'config'),
        '[core]\n\trepositoryformatversion = 0\n',
      );
      const query = `@${gitFile}`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 203,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [{ text: query }],
        shouldProceed: true,
      });
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Path ${gitFile} is git-ignored and will be skipped.`,
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Ignored 1 files:\nGit-ignored: ${gitFile}`,
      );
    });
  });

  describe('when recursive file search is disabled', () => {
    beforeEach(() => {
      vi.mocked(mockConfig.getEnableRecursiveFileSearch).mockReturnValue(false);
    });

    it('should not use glob search for a nonexistent file', async () => {
      const invalidFile = 'nonexistent.txt';
      const query = `@${invalidFile}`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 300,
        signal: abortController.signal,
      });

      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Glob tool not found. Path ${invalidFile} will be skipped.`,
      );
      expect(result.processedQuery).toEqual([{ text: query }]);
      expect(result.shouldProceed).toBe(true);
    });
  });

  describe('gemini-ignore filtering', () => {
    it('should skip gemini-ignored files in @ commands', async () => {
      await createTestFile(
        path.join(testRootDir, '.geminiignore'),
        'build/output.js',
      );
      const geminiIgnoredFile = await createTestFile(
        path.join(testRootDir, 'build', 'output.js'),
        'console.log("Hello");',
      );
      const query = `@${geminiIgnoredFile}`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 204,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [{ text: query }],
        shouldProceed: true,
      });
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Path ${geminiIgnoredFile} is gemini-ignored and will be skipped.`,
      );
      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Ignored 1 files:\nGemini-ignored: ${geminiIgnoredFile}`,
      );
    });
  });
  it('should process non-ignored files when .geminiignore is present', async () => {
    await createTestFile(
      path.join(testRootDir, '.geminiignore'),
      'build/output.js',
    );
    const validFile = await createTestFile(
      path.join(testRootDir, 'src', 'index.ts'),
      'console.log("Hello world");',
    );
    const query = `@${validFile}`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 205,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [
        { text: `@${validFile}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${validFile}:\n` },
        { text: 'console.log("Hello world");' },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
  });

  it('should handle mixed gemini-ignored and valid files', async () => {
    await createTestFile(
      path.join(testRootDir, '.geminiignore'),
      'dist/bundle.js',
    );
    const validFile = await createTestFile(
      path.join(testRootDir, 'src', 'main.ts'),
      '// Main application entry',
    );
    const geminiIgnoredFile = await createTestFile(
      path.join(testRootDir, 'dist', 'bundle.js'),
      'console.log("bundle");',
    );
    const query = `@${validFile} @${geminiIgnoredFile}`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 206,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [
        { text: `@${validFile} @${geminiIgnoredFile}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${validFile}:\n` },
        { text: '// Main application entry' },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      `Path ${geminiIgnoredFile} is gemini-ignored and will be skipped.`,
    );
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      `Ignored 1 files:\nGemini-ignored: ${geminiIgnoredFile}`,
    );
  });
  
  describe('punctuation termination in @ commands', () => {
    it('should terminate @path at comma', async () => {
      const fileContent = 'File content here';
      const filePath = await createTestFile(
        path.join(testRootDir, 'test.txt'),
        fileContent,
      );
      const query = `Look at @${filePath}, then explain it.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 400,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Look at @${filePath}, then explain it.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should terminate @path at period', async () => {
      const fileContent = 'File content here';
      const filePath = await createTestFile(
        path.join(testRootDir, 'readme.md'),
        fileContent,
      );
      const query = `Check @${filePath}. What does it say?`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 401,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Check @${filePath}. What does it say?` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should terminate @path at semicolon', async () => {
      const fileContent = 'Code example';
      const filePath = await createTestFile(
        path.join(testRootDir, 'example.js'),
        fileContent,
      );
      const query = `Review @${filePath}; check for bugs.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 402,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Review @${filePath}; check for bugs.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should terminate @path at exclamation mark', async () => {
      const fileContent = 'Important content';
      const filePath = await createTestFile(
        path.join(testRootDir, 'important.txt'),
        fileContent,
      );
      const query = `Look at @${filePath}! This is critical.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 403,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Look at @${filePath}! This is critical.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should terminate @path at question mark', async () => {
      const fileContent = 'Config settings';
      const filePath = await createTestFile(
        path.join(testRootDir, 'config.json'),
        fileContent,
      );
      const query = `What is in @${filePath}? Please explain.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 404,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `What is in @${filePath}? Please explain.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should terminate @path at opening parenthesis', async () => {
      const fileContent = 'Function definition';
      const filePath = await createTestFile(
        path.join(testRootDir, 'func.ts'),
        fileContent,
      );
      const query = `Analyze @${filePath}(the main function).`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 405,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Analyze @${filePath}(the main function).` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should terminate @path at closing parenthesis', async () => {
      const fileContent = 'Test data';
      const filePath = await createTestFile(
        path.join(testRootDir, 'data.json'),
        fileContent,
      );
      const query = `Use data from @${filePath}) for testing.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 406,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Use data from @${filePath}) for testing.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should terminate @path at opening square bracket', async () => {
      const fileContent = 'Array data';
      const filePath = await createTestFile(
        path.join(testRootDir, 'array.js'),
        fileContent,
      );
      const query = `Check @${filePath}[0] for the first element.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 407,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Check @${filePath}[0] for the first element.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should terminate @path at closing square bracket', async () => {
      const fileContent = 'List content';
      const filePath = await createTestFile(
        path.join(testRootDir, 'list.md'),
        fileContent,
      );
      const query = `Review item @${filePath}] from the list.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 408,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Review item @${filePath}] from the list.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should terminate @path at opening curly brace', async () => {
      const fileContent = 'Object definition';
      const filePath = await createTestFile(
        path.join(testRootDir, 'object.ts'),
        fileContent,
      );
      const query = `Parse @${filePath}{prop1: value1}.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 409,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Parse @${filePath}{prop1: value1}.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should terminate @path at closing curly brace', async () => {
      const fileContent = 'Configuration';
      const filePath = await createTestFile(
        path.join(testRootDir, 'config.yaml'),
        fileContent,
      );
      const query = `Use settings from @${filePath}} for deployment.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 410,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Use settings from @${filePath}} for deployment.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should handle multiple @paths terminated by different punctuation', async () => {
      const content1 = 'First file';
      const file1Path = await createTestFile(
        path.join(testRootDir, 'first.txt'),
        content1,
      );
      const content2 = 'Second file';
      const file2Path = await createTestFile(
        path.join(testRootDir, 'second.txt'),
        content2,
      );
      const query = `Compare @${file1Path}, @${file2Path}; what's different?`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 411,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Compare @${file1Path}, @${file2Path}; what's different?` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${file1Path}:\n` },
          { text: content1 },
          { text: `\nContent from @${file2Path}:\n` },
          { text: content2 },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should still handle escaped spaces in paths before punctuation', async () => {
      const fileContent = 'Spaced file content';
      const filePath = await createTestFile(
        path.join(testRootDir, 'spaced file.txt'),
        fileContent,
      );
      const escapedPath = path.join(testRootDir, 'spaced\\ file.txt');
      const query = `Check @${escapedPath}, it has spaces.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 412,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Check @${filePath}, it has spaces.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should not break file paths with periods in extensions', async () => {
      const fileContent = 'TypeScript content';
      const filePath = await createTestFile(
        path.join(testRootDir, 'example.d.ts'),
        fileContent,
      );
      const query = `Analyze @${filePath} for type definitions.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 413,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Analyze @${filePath} for type definitions.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should handle file paths ending with period followed by space', async () => {
      const fileContent = 'Config content';
      const filePath = await createTestFile(
        path.join(testRootDir, 'config.json'),
        fileContent,
      );
      const query = `Check @${filePath}. This file contains settings.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 414,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Check @${filePath}. This file contains settings.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should handle comma termination with complex file paths', async () => {
      const fileContent = 'Package info';
      const filePath = await createTestFile(
        path.join(testRootDir, 'package.json'),
        fileContent,
      );
      const query = `Review @${filePath}, then check dependencies.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 415,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Review @${filePath}, then check dependencies.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should not terminate at period within file name', async () => {
      const fileContent = 'Version info';
      const filePath = await createTestFile(
        path.join(testRootDir, 'version.1.2.3.txt'),
        fileContent,
      );
      const query = `Check @${filePath} contains version information.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 416,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Check @${filePath} contains version information.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should handle end of string termination for period and comma', async () => {
      const fileContent = 'End file content';
      const filePath = await createTestFile(
        path.join(testRootDir, 'end.txt'),
        fileContent,
      );
      const query = `Show me @${filePath}.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 417,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Show me @${filePath}.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${filePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });
  });
});
