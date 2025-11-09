/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleAtCommand } from './atCommandProcessor.js';
import type { Config } from '@google/gemini-cli-core';
import {
  FileDiscoveryService,
  GlobTool,
  ReadManyFilesTool,
  StandardFileSystemService,
  ToolRegistry,
  COMMON_IGNORE_PATTERNS,
  // DEFAULT_FILE_EXCLUDES,
} from '@google/gemini-cli-core';
import * as os from 'node:os';
import { ToolCallStatus } from '../types.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

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

  function getRelativePath(absolutePath: string): string {
    return path.relative(testRootDir, absolutePath);
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
      getExcludeTools: vi.fn(),
      getFileService: () => new FileDiscoveryService(testRootDir),
      getFileFilteringRespectGitIgnore: () => true,
      getFileFilteringRespectGeminiIgnore: () => true,
      getFileFilteringOptions: () => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
      getFileSystemService: () => new StandardFileSystemService(),
      getEnableRecursiveFileSearch: vi.fn(() => true),
      getWorkspaceContext: () => ({
        isPathWithinWorkspace: () => true,
        getDirectories: () => [testRootDir],
      }),
      getMcpServers: () => ({}),
      getMcpServerCommand: () => undefined,
      getPromptRegistry: () => ({
        getPromptsByServer: () => [],
      }),
      getDebugMode: () => false,
      getFileExclusions: () => ({
        getCoreIgnorePatterns: () => COMMON_IGNORE_PATTERNS,
        getDefaultExcludePatterns: () => [],
        getGlobExcludes: () => [],
        buildExcludePatterns: () => [],
        getReadManyFilesExcludes: () => [],
      }),
      getUsageStatisticsEnabled: () => false,
      getEnableExtensionReloading: () => false,
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
    const relativePath = getRelativePath(filePath);
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
        { text: `@${relativePath}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${relativePath}:\n` },
        { text: fileContent },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
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
    const relativeDirPath = getRelativePath(dirPath);
    const relativeFilePath = getRelativePath(filePath);
    const query = `@${dirPath}`;
    const resolvedGlob = path.join(relativeDirPath, '**');

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
        { text: `\nContent from @${relativeFilePath}:\n` },
        { text: fileContent },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
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
    const relativePath = getRelativePath(filePath);
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
        { text: `${textBefore}@${relativePath}${textAfter}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${relativePath}:\n` },
        { text: fileContent },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
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
        { text: `@${getRelativePath(filePath)}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${getRelativePath(filePath)}:\n` },
        { text: fileContent },
        { text: '\n--- End of content ---' },
      ],
      shouldProceed: true,
    });
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
        {
          text: `@${getRelativePath(file1Path)} @${getRelativePath(file2Path)}`,
        },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${getRelativePath(file1Path)}:\n` },
        { text: content1 },
        { text: `\nContent from @${getRelativePath(file2Path)}:\n` },
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
        {
          text: `${text1}@${getRelativePath(file1Path)}${text2}@${getRelativePath(file2Path)}${text3}`,
        },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${getRelativePath(file1Path)}:\n` },
        { text: content1 },
        { text: `\nContent from @${getRelativePath(file2Path)}:\n` },
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
          text: `Look at @${getRelativePath(file1Path)} then @${invalidFile} and also just @ symbol, then @${getRelativePath(file2Path)}`,
        },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${getRelativePath(file2Path)}:\n` },
        { text: content2 },
        { text: `\nContent from @${getRelativePath(file1Path)}:\n` },
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
          { text: `@${getRelativePath(validFile)}` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${getRelativePath(validFile)}:\n` },
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
          { text: `@${getRelativePath(validFile)} @${gitIgnoredFile}` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${getRelativePath(validFile)}:\n` },
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
        { text: `@${getRelativePath(validFile)}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${getRelativePath(validFile)}:\n` },
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
        { text: `@${getRelativePath(validFile)} @${geminiIgnoredFile}` },
        { text: '\n--- Content from referenced files ---' },
        { text: `\nContent from @${getRelativePath(validFile)}:\n` },
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
    const punctuationTestCases = [
      {
        name: 'comma',
        fileName: 'test.txt',
        fileContent: 'File content here',
        queryTemplate: (filePath: string) =>
          `Look at @${getRelativePath(filePath)}, then explain it.`,
        messageId: 400,
      },
      {
        name: 'period',
        fileName: 'readme.md',
        fileContent: 'File content here',
        queryTemplate: (filePath: string) =>
          `Check @${getRelativePath(filePath)}. What does it say?`,
        messageId: 401,
      },
      {
        name: 'semicolon',
        fileName: 'example.js',
        fileContent: 'Code example',
        queryTemplate: (filePath: string) =>
          `Review @${getRelativePath(filePath)}; check for bugs.`,
        messageId: 402,
      },
      {
        name: 'exclamation mark',
        fileName: 'important.txt',
        fileContent: 'Important content',
        queryTemplate: (filePath: string) =>
          `Look at @${getRelativePath(filePath)}! This is critical.`,
        messageId: 403,
      },
      {
        name: 'question mark',
        fileName: 'config.json',
        fileContent: 'Config settings',
        queryTemplate: (filePath: string) =>
          `What is in @${getRelativePath(filePath)}? Please explain.`,
        messageId: 404,
      },
      {
        name: 'opening parenthesis',
        fileName: 'func.ts',
        fileContent: 'Function definition',
        queryTemplate: (filePath: string) =>
          `Analyze @${getRelativePath(filePath)}(the main function).`,
        messageId: 405,
      },
      {
        name: 'closing parenthesis',
        fileName: 'data.json',
        fileContent: 'Test data',
        queryTemplate: (filePath: string) =>
          `Use data from @${getRelativePath(filePath)}) for testing.`,
        messageId: 406,
      },
      {
        name: 'opening square bracket',
        fileName: 'array.js',
        fileContent: 'Array data',
        queryTemplate: (filePath: string) =>
          `Check @${getRelativePath(filePath)}[0] for the first element.`,
        messageId: 407,
      },
      {
        name: 'closing square bracket',
        fileName: 'list.md',
        fileContent: 'List content',
        queryTemplate: (filePath: string) =>
          `Review item @${getRelativePath(filePath)}] from the list.`,
        messageId: 408,
      },
      {
        name: 'opening curly brace',
        fileName: 'object.ts',
        fileContent: 'Object definition',
        queryTemplate: (filePath: string) =>
          `Parse @${getRelativePath(filePath)}{prop1: value1}.`,
        messageId: 409,
      },
      {
        name: 'closing curly brace',
        fileName: 'config.yaml',
        fileContent: 'Configuration',
        queryTemplate: (filePath: string) =>
          `Use settings from @${getRelativePath(filePath)}} for deployment.`,
        messageId: 410,
      },
    ];

    it.each(punctuationTestCases)(
      'should terminate @path at $name',
      async ({ fileName, fileContent, queryTemplate, messageId }) => {
        const filePath = await createTestFile(
          path.join(testRootDir, fileName),
          fileContent,
        );
        const query = queryTemplate(filePath);

        const result = await handleAtCommand({
          query,
          config: mockConfig,
          addItem: mockAddItem,
          onDebugMessage: mockOnDebugMessage,
          messageId,
          signal: abortController.signal,
        });

        expect(result).toEqual({
          processedQuery: [
            { text: query },
            { text: '\n--- Content from referenced files ---' },
            { text: `\nContent from @${getRelativePath(filePath)}:\n` },
            { text: fileContent },
            { text: '\n--- End of content ---' },
          ],
          shouldProceed: true,
        });
      },
    );

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
          {
            text: `Compare @${getRelativePath(file1Path)}, @${getRelativePath(file2Path)}; what's different?`,
          },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${getRelativePath(file1Path)}:\n` },
          { text: content1 },
          { text: `\nContent from @${getRelativePath(file2Path)}:\n` },
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
          { text: `Check @${getRelativePath(filePath)}, it has spaces.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${getRelativePath(filePath)}:\n` },
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
      const query = `Analyze @${getRelativePath(filePath)} for type definitions.`;

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
          {
            text: `Analyze @${getRelativePath(filePath)} for type definitions.`,
          },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${getRelativePath(filePath)}:\n` },
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
      const query = `Check @${getRelativePath(filePath)}. This file contains settings.`;

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
          {
            text: `Check @${getRelativePath(filePath)}. This file contains settings.`,
          },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${getRelativePath(filePath)}:\n` },
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
      const query = `Review @${getRelativePath(filePath)}, then check dependencies.`;

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
          {
            text: `Review @${getRelativePath(filePath)}, then check dependencies.`,
          },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${getRelativePath(filePath)}:\n` },
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
      const query = `Check @${getRelativePath(filePath)} contains version information.`;

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
          {
            text: `Check @${getRelativePath(filePath)} contains version information.`,
          },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${getRelativePath(filePath)}:\n` },
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
      const query = `Show me @${getRelativePath(filePath)}.`;

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
          { text: `Show me @${getRelativePath(filePath)}.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${getRelativePath(filePath)}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should handle files with special characters in names', async () => {
      const fileContent = 'File with special chars content';
      const filePath = await createTestFile(
        path.join(testRootDir, 'file$with&special#chars.txt'),
        fileContent,
      );
      const query = `Check @${getRelativePath(filePath)} for content.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 418,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Check @${getRelativePath(filePath)} for content.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${getRelativePath(filePath)}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });

    it('should handle basic file names without special characters', async () => {
      const fileContent = 'Basic file content';
      const filePath = await createTestFile(
        path.join(testRootDir, 'basicfile.txt'),
        fileContent,
      );
      const query = `Check @${getRelativePath(filePath)} please.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 421,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Check @${getRelativePath(filePath)} please.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${getRelativePath(filePath)}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });
    });
  });

  describe('absolute path handling', () => {
    it('should handle absolute file paths correctly', async () => {
      const fileContent = 'console.log("This is an absolute path test");';
      const relativePath = path.join('src', 'absolute-test.ts');
      const absolutePath = await createTestFile(
        path.join(testRootDir, relativePath),
        fileContent,
      );
      const query = `Check @${absolutePath} please.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 500,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [
          { text: `Check @${relativePath} please.` },
          { text: '\n--- Content from referenced files ---' },
          { text: `\nContent from @${relativePath}:\n` },
          { text: fileContent },
          { text: '\n--- End of content ---' },
        ],
        shouldProceed: true,
      });

      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        expect.stringContaining(`using relative path: ${relativePath}`),
      );
    });

    it('should handle absolute directory paths correctly', async () => {
      const fileContent =
        'export default function test() { return "absolute dir test"; }';
      const subDirPath = path.join('src', 'utils');
      const fileName = 'helper.ts';
      await createTestFile(
        path.join(testRootDir, subDirPath, fileName),
        fileContent,
      );
      const absoluteDirPath = path.join(testRootDir, subDirPath);
      const query = `Check @${absoluteDirPath} please.`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 501,
        signal: abortController.signal,
      });

      expect(result.shouldProceed).toBe(true);
      expect(result.processedQuery).toEqual(
        expect.arrayContaining([
          { text: `Check @${path.join(subDirPath, '**')} please.` },
          expect.objectContaining({
            text: '\n--- Content from referenced files ---',
          }),
        ]),
      );

      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        expect.stringContaining(`using glob: ${path.join(subDirPath, '**')}`),
      );
    });

    it('should skip absolute paths outside workspace', async () => {
      const outsidePath = '/tmp/outside-workspace.txt';
      const query = `Check @${outsidePath} please.`;

      const mockWorkspaceContext = {
        isPathWithinWorkspace: vi.fn((path: string) =>
          path.startsWith(testRootDir),
        ),
        getDirectories: () => [testRootDir],
        addDirectory: vi.fn(),
        getInitialDirectories: () => [testRootDir],
        setDirectories: vi.fn(),
        onDirectoriesChanged: vi.fn(() => () => {}),
      } as unknown as ReturnType<typeof mockConfig.getWorkspaceContext>;
      mockConfig.getWorkspaceContext = () => mockWorkspaceContext;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 502,
        signal: abortController.signal,
      });

      expect(result).toEqual({
        processedQuery: [{ text: `Check @${outsidePath} please.` }],
        shouldProceed: true,
      });

      expect(mockOnDebugMessage).toHaveBeenCalledWith(
        `Path ${outsidePath} is not in the workspace and will be skipped.`,
      );
    });
  });

  it("should not add the user's turn to history, as that is the caller's responsibility", async () => {
    // Arrange
    const fileContent = 'This is the file content.';
    const filePath = await createTestFile(
      path.join(testRootDir, 'path', 'to', 'another-file.txt'),
      fileContent,
    );
    const query = `A query with @${getRelativePath(filePath)}`;

    // Act
    await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 999,
      signal: abortController.signal,
    });

    // Assert
    // It SHOULD be called for the tool_group
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool_group' }),
      999,
    );

    // It should NOT have been called for the user turn
    const userTurnCalls = mockAddItem.mock.calls.filter(
      (call) => call[0].type === 'user',
    );
    expect(userTurnCalls).toHaveLength(0);
  });
});
