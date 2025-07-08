/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, Mock, Mocked } from 'vitest';
import { getEnvironmentContext } from './environmentContext.js';
import { Config } from '../config/config.js';
import { getFolderStructure } from './getFolderStructure.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

vi.mock('./getFolderStructure');
vi.mock('../tools/read-many-files');
vi.mock('../tools/tool-registry');
vi.mock('../services/fileDiscoveryService');

describe('getEnvironmentContext', () => {
  let mockConfig: Mocked<Config>;
  let mockToolRegistry: Mocked<ToolRegistry>;
  let mockReadManyFilesTool: Mocked<ReadManyFilesTool>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReadManyFilesTool = {
      execute: vi.fn(),
    } as unknown as Mocked<ReadManyFilesTool>;

    mockToolRegistry = {
      getTool: vi.fn().mockReturnValue(null), // Default to tool not found
    } as unknown as Mocked<ToolRegistry>;

    mockConfig = {
      getWorkingDir: vi.fn().mockReturnValue('/test/cwd'),
      getFileService: vi.fn().mockReturnValue({} as FileDiscoveryService),
      getToolRegistry: vi.fn().mockResolvedValue(mockToolRegistry),
      getFullContext: vi.fn().mockReturnValue(false),
    } as unknown as Mocked<Config>;

    vi.mocked(getFolderStructure).mockResolvedValue('Mocked Folder Structure');

    const OriginalDate = global.Date;
    const mockDate = new OriginalDate('2025-07-15T12:00:00.000Z');
    vi.spyOn(global, 'Date').mockImplementation(() => mockDate);

    Object.defineProperty(process, 'platform', {
      value: 'test-os',
      configurable: true,
    });
  });

  it('should return basic environment context when fullContext is false', async () => {
    const parts = await getEnvironmentContext(mockConfig);

    expect(parts.length).toBe(1);
    const contextText = parts[0].text;

    expect(contextText).toContain(
      'This is the Gemini CLI. We are setting up the context for our chat.',
    );
    expect(contextText).toContain("Today's date is Tuesday, July 15, 2025");
    expect(contextText).toContain('My operating system is: test-os');
    expect(contextText).toContain(
      "I'm currently working in the directory: /test/cwd",
    );
    expect(contextText).toContain('Mocked Folder Structure');
    expect(contextText).not.toContain('--- Full File Context ---');
    expect(mockConfig.getToolRegistry).toHaveBeenCalled();
    expect(mockToolRegistry.getTool).not.toHaveBeenCalled();
  });

  it('should include full file context when getFullContext is true and tool returns content', async () => {
    vi.mocked(mockConfig.getFullContext).mockReturnValue(true);
    (mockToolRegistry.getTool as Mock).mockReturnValue(mockReadManyFilesTool);
    vi.mocked(mockReadManyFilesTool.execute).mockResolvedValue({
      llmContent: 'All file content here.',
      returnDisplay: '',
    });

    const parts = await getEnvironmentContext(mockConfig);

    expect(parts.length).toBe(2);
    expect(parts[1].text).toBe(
      '\n--- Full File Context ---\nAll file content here.',
    );
    expect(mockToolRegistry.getTool).toHaveBeenCalledWith('read_many_files');
    expect(mockReadManyFilesTool.execute).toHaveBeenCalledWith(
      {
        paths: ['**/*'],
        useDefaultExcludes: true,
      },
      expect.any(AbortSignal),
    );
  });

  it('should handle full context when read_many_files tool is not found', async () => {
    vi.mocked(mockConfig.getFullContext).mockReturnValue(true);

    const parts = await getEnvironmentContext(mockConfig);

    expect(parts.length).toBe(1); // Only the initial context part
    expect(parts[0].text).not.toContain('--- Full File Context ---');
    expect(mockToolRegistry.getTool).toHaveBeenCalledWith('read_many_files');
  });

  it('should handle full context when read_many_files tool returns no content', async () => {
    vi.mocked(mockConfig.getFullContext).mockReturnValue(true);
    (mockToolRegistry.getTool as Mock).mockReturnValue(mockReadManyFilesTool);
    vi.mocked(mockReadManyFilesTool.execute).mockResolvedValue({
      llmContent: '',
      returnDisplay: 'No files found.',
    });

    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const parts = await getEnvironmentContext(mockConfig);

    expect(parts.length).toBe(1);
    expect(parts[0].text).not.toContain('--- Full File Context ---');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Full context requested, but read_many_files returned no content.',
    );

    consoleWarnSpy.mockRestore();
  });

  it('should handle errors during full context reading', async () => {
    const testError = new Error('Failed to read files');
    vi.mocked(mockConfig.getFullContext).mockReturnValue(true);
    (mockToolRegistry.getTool as Mock).mockReturnValue(mockReadManyFilesTool);
    vi.mocked(mockReadManyFilesTool.execute).mockRejectedValue(testError);

    const parts = await getEnvironmentContext(mockConfig);

    expect(parts.length).toBe(2);
    expect(parts[1].text).toBe('\n--- Error reading full file context ---');
  });
});
