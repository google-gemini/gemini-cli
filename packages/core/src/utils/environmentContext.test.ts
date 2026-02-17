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
import type { Config } from '../config/config.js';
import type { Storage } from '../config/storage.js';
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
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project-temp'),
      } as unknown as Storage,
    };
    vi.mocked(getFolderStructure).mockResolvedValue('Mock Folder Structure');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return context string for a single directory', async () => {
    const contextString = await getDirectoryContextString(mockConfig as Config);
    expect(contextString).toContain('- **Workspace Directories:**');
    expect(contextString).toContain('  - /test/dir');
    expect(contextString).toContain(
      '- **Directory Structure:**\n\nMock Folder Structure',
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
    expect(contextString).toContain('- **Workspace Directories:**');
    expect(contextString).toContain('  - /test/dir1');
    expect(contextString).toContain('  - /test/dir2');
    expect(contextString).toContain(
      '- **Directory Structure:**\n\nStructure 1\nStructure 2',
    );
  });
});

describe('getEnvironmentContext', () => {
  let mockConfig: Partial<Config>;
  let mockToolRegistry: { getTool: Mock };

  beforeEach(() => {
    mockToolRegistry = {
      getTool: vi.fn(),
    };

    mockConfig = {
      getWorkspaceContext: vi.fn().mockReturnValue({
        getDirectories: vi.fn().mockReturnValue(['/test/dir']),
      }),
      getFileService: vi.fn(),
      getIncludeDirectoryTree: vi.fn().mockReturnValue(true),
      getEnvironmentMemory: vi.fn().mockReturnValue('Mock Environment Memory'),

      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project-temp'),
      } as unknown as Storage,
    };

    vi.mocked(getFolderStructure).mockResolvedValue('Mock Folder Structure');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return basic environment context for a single directory', async () => {
    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(1);
    const context = parts[0].text;

    expect(context).toContain('<session_context>');
    expect(context).toContain('- **Workspace Directories:**');
    expect(context).toContain('  - /test/dir');
    expect(context).toContain(
      '- **Directory Structure:**\n\nMock Folder Structure',
    );
    expect(context).toContain('Mock Environment Memory');
    expect(context).toContain('</session_context>');
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

    expect(context).toContain('<session_context>');
    expect(context).toContain('- **Workspace Directories:**');
    expect(context).toContain('  - /test/dir1');
    expect(context).toContain('  - /test/dir2');
    expect(context).toContain(
      '- **Directory Structure:**\n\nStructure 1\nStructure 2',
    );
    expect(context).toContain('</session_context>');
    expect(getFolderStructure).toHaveBeenCalledTimes(2);
  });

  it('should omit directory structure when getIncludeDirectoryTree is false', async () => {
    (vi.mocked(mockConfig.getIncludeDirectoryTree!) as Mock).mockReturnValue(
      false,
    );

    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(1);
    const context = parts[0].text;

    expect(context).toContain('<session_context>');
    expect(context).not.toContain('Directory Structure:');
    expect(context).not.toContain('Mock Folder Structure');
    expect(context).toContain('Mock Environment Memory');
    expect(context).toContain('</session_context>');
    expect(getFolderStructure).not.toHaveBeenCalled();
  });

  it('should handle read_many_files returning no content', async () => {
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
    mockToolRegistry.getTool.mockReturnValue(null);

    const parts = await getEnvironmentContext(mockConfig as Config);

    expect(parts.length).toBe(1); // No extra part added
  });
});
