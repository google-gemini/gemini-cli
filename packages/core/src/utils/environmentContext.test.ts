/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Config } from '../config/config.js';
import { getDirectoryContextString, getEnvironmentContext, getCodebaseIndexStatus } from './environmentContext.js';
import { getFolderStructure } from './getFolderStructure.js';

vi.mock('./getFolderStructure.js');
vi.mock('../services/codebaseIndexer/codebaseIndexer.js');

describe('getDirectoryContextString', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-08-05T12:00:00Z'));

    mockConfig = {
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/test/dir']),
      }),
      getFileService: vi.fn(),
    };

    vi.mocked(getFolderStructure).mockResolvedValue('Mock Folder Structure');
  });

  it('should return context string for a single directory', async () => {
    const result = await getDirectoryContextString(mockConfig as Config);

    expect(result).toContain("I'm currently working in the directory: /test/dir");
    expect(result).toContain('Here is the folder structure of the current working directories:');
    expect(result).toContain('Mock Folder Structure');
  });

  it('should return context string for multiple directories', async () => {
    mockConfig.getWorkspaceContext = vi.fn().mockReturnValue({
      getDirectories: vi.fn().mockReturnValue(['/test/dir1', '/test/dir2']),
    });

    const result = await getDirectoryContextString(mockConfig as Config);

    expect(result).toContain('I\'m currently working in the following directories:');
    expect(result).toContain('  - /test/dir1');
    expect(result).toContain('  - /test/dir2');
  });
});

describe('getCodebaseIndexStatus', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-08-05T12:00:00Z'));

    mockConfig = {
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/test/dir']),
      }),
    };
  });

  it('should return empty string when no workspace directories', async () => {
    mockConfig.getWorkspaceContext = vi.fn().mockReturnValue({
      getDirectories: vi.fn().mockReturnValue([]),
    });

    const result = await getCodebaseIndexStatus(mockConfig as Config);
    expect(result).toBe('');
  });

  it('should return index not found message when index does not exist', async () => {
    const mockIndexer = {
      getIndexStatus: vi.fn().mockResolvedValue({ exists: false }),
    };

    const { CodebaseIndexer } = await import('../services/codebaseIndexer/codebaseIndexer.js');
    vi.mocked(CodebaseIndexer.fromConfig).mockReturnValue(mockIndexer as any);

    const result = await getCodebaseIndexStatus(mockConfig as Config);
    expect(result).toContain('Codebase Index: No semantic search index found');
    expect(result).toContain("Use '/codebase index' to create one");
  });

  it('should return index available message when index exists', async () => {
    const mockIndexer = {
      getIndexStatus: vi.fn().mockResolvedValue({
        exists: true,
        fileCount: 10,
        vectorCount: 100,
        sizeBytes: 1024 * 1024,
        lastUpdated: new Date('2025-08-05T10:00:00Z'),
      }),
    };

    const { CodebaseIndexer } = await import('../services/codebaseIndexer/codebaseIndexer.js');
    vi.mocked(CodebaseIndexer.fromConfig).mockReturnValue(mockIndexer as any);

    const result = await getCodebaseIndexStatus(mockConfig as Config);
    expect(result).toContain('Codebase Index: Available');
    expect(result).toContain('10 files');
    expect(result).toContain('100 vectors');
    expect(result).toContain('1.0 MB');
  });
});

describe('getEnvironmentContext', () => {
  let mockConfig: Partial<Config>;
  let mockToolRegistry: { getTool: any };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-08-05T12:00:00Z'));

    mockToolRegistry = {
      getTool: vi.fn(),
    };

    mockConfig = {
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/test/dir']),
      }),
      getFileService: vi.fn(),
      getFullContext: vi.fn().mockReturnValue(false),
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
    };

    vi.mocked(getFolderStructure).mockResolvedValue('Mock Folder Structure');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('should return basic environment context for a single directory', async () => {
    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(1);
    const context = parts[0].text;

    expect(context).toContain("Today's date is");
    expect(context).toContain("(formatted according to the user's locale)");
    expect(context).toContain(`My operating system is: ${process.platform}`);
    expect(context).toContain(
      "I'm currently working in the directory: /test/dir",
    );
    expect(context).toContain(
      'Here is the folder structure of the current working directories:\n\nMock Folder Structure',
    );
    expect(getFolderStructure).toHaveBeenCalledWith('/test/dir', {
      fileService: undefined,
    });
  });

  it('should return basic environment context for multiple directories', async () => {
    mockConfig.getWorkspaceContext = vi.fn().mockReturnValue({
      getDirectories: vi.fn().mockReturnValue(['/test/dir1', '/test/dir2']),
    });

    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(1);
    const context = parts[0].text;

    expect(context).toContain('I\'m currently working in the following directories:');
    expect(context).toContain('  - /test/dir1');
    expect(context).toContain('  - /test/dir2');
  });

  it('should include full file context when getFullContext is true', async () => {
    mockConfig.getFullContext = vi.fn().mockReturnValue(true);

    const mockReadManyFilesTool = {
      build: vi.fn().mockReturnValue({
        toolName: 'read_many_files',
        toolArgs: { paths: ['**/*'], useDefaultExcludes: true },
      }),
    };

    mockToolRegistry.getTool.mockReturnValue(mockReadManyFilesTool);

    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(2);
    expect(mockToolRegistry.getTool).toHaveBeenCalledWith('read_many_files');
    expect(mockReadManyFilesTool.build).toHaveBeenCalledWith({
      paths: ['**/*'],
      useDefaultExcludes: true,
    });
  });

  it('should handle read_many_files returning no content', async () => {
    mockConfig.getFullContext = vi.fn().mockReturnValue(true);

    const mockReadManyFilesTool = {
      build: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue({ llmContent: '' }),
      }),
    };

    mockToolRegistry.getTool.mockReturnValue(mockReadManyFilesTool);

    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(1);
  });

  it('should handle read_many_files tool not being found', async () => {
    mockConfig.getFullContext = vi.fn().mockReturnValue(true);
    mockToolRegistry.getTool.mockReturnValue(undefined);

    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(1);
  });

  it('should handle errors when reading full file context', async () => {
    mockConfig.getFullContext = vi.fn().mockReturnValue(true);

    const mockReadManyFilesTool = {
      build: vi.fn().mockReturnValue({
        execute: vi.fn().mockRejectedValue(new Error('Tool error')),
      }),
    };

    mockToolRegistry.getTool.mockReturnValue(mockReadManyFilesTool);

    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(2);
    expect(parts[1].text).toBe('\n--- Error reading full file context ---');
  });
});
