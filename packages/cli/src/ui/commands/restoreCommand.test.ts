/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mocked, Mock } from 'vitest';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { restoreCommand } from './restoreCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { Config, GitService } from '@google/gemini-cli-core';

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  mkdir: vi.fn(),
}));

describe('restoreCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: Config;
  let mockGitService: GitService;
  const mockFsPromises = fs as Mocked<typeof fs>;
  let mockSetHistory: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSetHistory = vi.fn().mockResolvedValue(undefined);
    mockGitService = {
      restoreProjectFromSnapshot: vi.fn().mockResolvedValue(undefined),
    } as unknown as GitService;

    mockConfig = {
      getCheckpointingEnabled: vi.fn().mockReturnValue(true),
      getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini'),
      getGeminiClient: vi.fn().mockReturnValue({
        setHistory: mockSetHistory,
      }),
    } as unknown as Config;

    mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
        git: mockGitService,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null if checkpointing is not enabled', () => {
    (mockConfig.getCheckpointingEnabled as Mock).mockReturnValue(false);
    const command = restoreCommand(mockConfig);
    expect(command).toBeNull();
  });

  it('should return the command if checkpointing is enabled', () => {
    const command = restoreCommand(mockConfig);
    expect(command).not.toBeNull();
    expect(command?.name).toBe('restore');
    expect(command?.description).toBeDefined();
    expect(command?.action).toBeDefined();
    expect(command?.completion).toBeDefined();
  });

  describe('action', () => {
    it('should return an error if temp dir is not found', async () => {
      (mockConfig.getProjectTempDir as Mock).mockReturnValue(undefined);
      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, '');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Could not determine the .gemini directory path.',
      });
    });

    it('should inform when no checkpoints are found if no args are passed', async () => {
      mockFsPromises.readdir.mockResolvedValue([]);
      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, '');
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No restorable tool calls found.',
      });
      expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
        '/tmp/gemini/checkpoints',
        {
          recursive: true,
        },
      );
    });

    it('should list available checkpoints if no args are passed', async () => {
      mockFsPromises.readdir.mockResolvedValue([
        'test1.json',
        'test2.json',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any);
      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, '');
      expect(result).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Available tool calls to restore:\n\ntest1\ntest2',
      });
    });

    it('should return an error if the specified file is not found', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFsPromises.readdir.mockResolvedValue(['test1.json'] as any);
      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, 'test2');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'File not found: test2.json',
      });
    });

    it('should handle file read errors gracefully', async () => {
      const readError = new Error('Read failed');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFsPromises.readdir.mockResolvedValue(['test1.json'] as any);
      mockFsPromises.readFile.mockRejectedValue(readError);
      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, 'test1');
      expect(result).toEqual({
        type: 'message',
        messageType: 'error',
        content: `Could not read restorable tool calls. This is the error: ${readError}`,
      });
    });

    it('should restore a tool call and project state', async () => {
      const toolCallData = {
        history: [{ type: 'user', text: 'do a thing' }],
        clientHistory: [{ role: 'user', parts: [{ text: 'do a thing' }] }],
        commitHash: 'abcdef123',
        toolCall: { name: 'run_shell_command', args: 'ls' },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFsPromises.readdir.mockResolvedValue(['my-checkpoint.json'] as any);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(toolCallData));

      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, 'my-checkpoint');

      // Check history restoration
      expect(mockContext.ui.loadHistory).toHaveBeenCalledWith(
        toolCallData.history,
      );
      expect(mockSetHistory).toHaveBeenCalledWith(toolCallData.clientHistory);

      // Check git restoration
      expect(mockGitService.restoreProjectFromSnapshot).toHaveBeenCalledWith(
        toolCallData.commitHash,
      );
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        {
          type: 'info',
          text: 'Restored project to the state before the tool call.',
        },
        expect.any(Number),
      );

      // Check returned action
      expect(result).toEqual({
        type: 'tool',
        toolName: 'run_shell_command',
        toolArgs: 'ls',
      });
    });

    it('should restore even if only toolCall is present', async () => {
      const toolCallData = {
        toolCall: { name: 'run_shell_command', args: 'ls' },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFsPromises.readdir.mockResolvedValue(['my-checkpoint.json'] as any);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(toolCallData));

      const command = restoreCommand(mockConfig);
      const result = await command?.action?.(mockContext, 'my-checkpoint');

      expect(mockContext.ui.loadHistory).not.toHaveBeenCalled();
      expect(mockSetHistory).not.toHaveBeenCalled();
      expect(mockGitService.restoreProjectFromSnapshot).not.toHaveBeenCalled();

      expect(result).toEqual({
        type: 'tool',
        toolName: 'run_shell_command',
        toolArgs: 'ls',
      });
    });
  });

  describe('completion', () => {
    it('should return an empty array if temp dir is not found', async () => {
      (mockConfig.getProjectTempDir as Mock).mockReturnValue(undefined);
      const command = restoreCommand(mockConfig);
      const result = await command?.completion?.(mockContext, '');
      expect(result).toEqual([]);
    });

    it('should return an empty array on readdir error', async () => {
      mockFsPromises.readdir.mockRejectedValue(new Error('ENOENT'));
      const command = restoreCommand(mockConfig);
      const result = await command?.completion?.(mockContext, '');
      expect(result).toEqual([]);
    });

    it('should return a list of checkpoint names', async () => {
      mockFsPromises.readdir.mockResolvedValue([
        'test1.json',
        'test2.json',
        'not-a-checkpoint.txt',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any);
      const command = restoreCommand(mockConfig);
      const result = await command?.completion?.(mockContext, '');
      expect(result).toEqual(['test1', 'test2']);
    });
  });
});
