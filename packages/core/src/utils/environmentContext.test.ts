/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import {
  getEnvironmentContext,
  getDirectoryContextString,
} from './environmentContext.js';
import { Config } from '../config/config.js';
import { getFolderStructure } from './getFolderStructure.js';

vi.mock('../config/config.js');
vi.mock('./getFolderStructure.js', () => ({
  getFolderStructure: vi.fn(),
}));
vi.mock('../tools/read-many-files.js');

describe('getDirectoryContextString', () => {
  let mockConfig: Partial<Config>;

  beforeEach(() => {
    mockConfig = {
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/test/dir']),
      }),
      getFileService: vi.fn(),
    };
    vi.mocked(getFolderStructure).mockResolvedValue('Mock Folder Structure');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return context string for a single directory', async () => {
    const contextString = await getDirectoryContextString(mockConfig as Config);
    expect(contextString).toContain(
      "I'm currently working in the directory: /test/dir",
    );
    expect(contextString).toContain(
      'Here is the folder structure of the current working directories:\n\nMock Folder Structure',
    );
  });

  it('should return context string for multiple directories', async () => {
    (
      vi.mocked(mockConfig.getWorkspaceContext!)().getDirectories as Mock
    ).mockReturnValue(['/test/dir1', '/test/dir2']);
    vi.mocked(getFolderStructure)
      .mockResolvedValueOnce('Structure 1')
      .mockResolvedValueOnce('Structure 2');

    const contextString = await getDirectoryContextString(mockConfig as Config);
    expect(contextString).toContain(
      "I'm currently working in the following directories:\n  - /test/dir1\n  - /test/dir2",
    );
    expect(contextString).toContain(
      'Here is the folder structure of the current working directories:\n\nStructure 1\nStructure 2',
    );
  });
});

describe('getEnvironmentContext', () => {
  let mockConfig: Partial<Config>;
  let mockToolRegistry: { getTool: Mock };

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
    (
      vi.mocked(mockConfig.getWorkspaceContext!)().getDirectories as Mock
    ).mockReturnValue(['/test/dir1', '/test/dir2']);
    vi.mocked(getFolderStructure)
      .mockResolvedValueOnce('Structure 1')
      .mockResolvedValueOnce('Structure 2');

    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(1);
    const context = parts[0].text;

    expect(context).toContain(
      "I'm currently working in the following directories:\n  - /test/dir1\n  - /test/dir2",
    );
    expect(context).toContain(
      'Here is the folder structure of the current working directories:\n\nStructure 1\nStructure 2',
    );
    expect(getFolderStructure).toHaveBeenCalledTimes(2);
  });

  it('should include full file context when getFullContext is true', async () => {
    mockConfig.getFullContext = vi.fn().mockReturnValue(true);
    const mockReadManyFilesTool = {
      build: vi.fn().mockReturnValue({
        execute: vi
          .fn()
          .mockResolvedValue({ llmContent: 'Full file content here' }),
      }),
    };
    mockToolRegistry.getTool.mockReturnValue(mockReadManyFilesTool);

    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(2);
    expect(parts[1].text).toBe(
      '\n--- Full File Context ---\nFull file content here',
    );
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

    expect(parts.length).toBe(1); // No extra part added
  });

  it('should handle read_many_files tool not being found', async () => {
    mockConfig.getFullContext = vi.fn().mockReturnValue(true);
    mockToolRegistry.getTool.mockReturnValue(null);

    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(1); // No extra part added
  });

  it('should handle errors when reading full file context', async () => {
    mockConfig.getFullContext = vi.fn().mockReturnValue(true);
    const mockReadManyFilesTool = {
      build: vi.fn().mockReturnValue({
        execute: vi.fn().mockRejectedValue(new Error('Read error')),
      }),
    };
    mockToolRegistry.getTool.mockReturnValue(mockReadManyFilesTool);

    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(2);
    expect(parts[1].text).toBe('\n--- Error reading full file context ---');
  });
});
