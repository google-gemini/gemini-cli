/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { restoreCommand } from './restoreCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { Config, GitService } from '@google/gemini-cli-core';

describe('restoreCommand', () => {
  let mockContext: CommandContext;
  let mockConfig: Config;
  let mockGitService: GitService;
  let mockSetHistory: ReturnType<typeof vi.fn>;
  let testRootDir: string;
  let geminiTempDir: string;
  let checkpointsDir: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'restore-command-test-'),
    );
    geminiTempDir = path.join(testRootDir, '.gemini');
    checkpointsDir = path.join(geminiTempDir, 'checkpoints');
    // The command itself creates this, but for tests it's easier to have it ready.
    // Some tests might remove it to test error paths.
    await fs.mkdir(checkpointsDir, { recursive: true });

    mockSetHistory = vi.fn().mockResolvedValue(undefined);
    mockGitService = {
      restoreProjectFromSnapshot: vi.fn().mockResolvedValue(undefined),
    } as unknown as GitService;

    mockConfig = {
      getCheckpointingEnabled: vi.fn().mockReturnValue(true),
      storage: {
        getProjectTempCheckpointsDir: vi.fn().mockReturnValue(checkpointsDir),
        getProjectTempDir: vi.fn().mockReturnValue(geminiTempDir),
      },
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

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  it('should return null if checkpointing is not enabled', () => {
    vi.mocked(mockConfig.getCheckpointingEnabled).mockReturnValue(false);

    expect(restoreCommand(mockConfig)).toBeNull();
  });

  it('should return the command if checkpointing is enabled', () => {
    expect(restoreCommand(mockConfig)).toEqual(
      expect.objectContaining({
        name: 'restore',
        description: expect.any(String),
        action: expect.any(Function),
        completion: expect.any(Function),
      }),
    );
  });

  describe('action', () => {
    it('should return an error if temp dir is not found', async () => {
      vi.mocked(
        mockConfig.storage.getProjectTempCheckpointsDir,
      ).mockReturnValue('');

      expect(
        await restoreCommand(mockConfig)?.action?.(mockContext, ''),
      ).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'Could not determine the .gemini directory path.',
      });
    });

    it('should inform when no checkpoints are found if no args are passed', async () => {
      // Remove the directory to ensure the command creates it.
      await fs.rm(checkpointsDir, { recursive: true, force: true });
      const command = restoreCommand(mockConfig);

      expect(await command?.action?.(mockContext, '')).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'No restorable tool calls found.',
      });
      // Verify the directory was created by the command.
      await expect(fs.stat(checkpointsDir)).resolves.toBeDefined();
    });

    it('should list available checkpoints if no args are passed', async () => {
      await fs.writeFile(path.join(checkpointsDir, 'test1.json'), '{}');
      await fs.writeFile(path.join(checkpointsDir, 'test2.json'), '{}');
      const command = restoreCommand(mockConfig);

      expect(await command?.action?.(mockContext, '')).toEqual({
        type: 'message',
        messageType: 'info',
        content: 'Available tool calls to restore:\n\ntest1\ntest2',
      });
    });

    it('should return an error if the specified file is not found', async () => {
      await fs.writeFile(path.join(checkpointsDir, 'test1.json'), '{}');
      const command = restoreCommand(mockConfig);

      expect(await command?.action?.(mockContext, 'test2')).toEqual({
        type: 'message',
        messageType: 'error',
        content: 'File not found: test2.json',
      });
    });

    it('should handle file read errors gracefully', async () => {
      const checkpointName = 'test1';
      const checkpointPath = path.join(
        checkpointsDir,
        `${checkpointName}.json`,
      );
      // Create a directory instead of a file to cause a read error.
      await fs.mkdir(checkpointPath);
      const command = restoreCommand(mockConfig);

      expect(await command?.action?.(mockContext, checkpointName)).toEqual({
        type: 'message',
        messageType: 'error',
        content: expect.stringContaining(
          'Could not read restorable tool calls.',
        ),
      });
    });

    it('should restore a tool call and project state', async () => {
      const toolCallData = {
        history: [{ type: 'user', text: 'do a thing' }],
        clientHistory: [{ role: 'user', parts: [{ text: 'do a thing' }] }],
        commitHash: 'abcdef123',
        toolCall: { name: 'run_shell_command', args: 'ls' },
      };
      await fs.writeFile(
        path.join(checkpointsDir, 'my-checkpoint.json'),
        JSON.stringify(toolCallData),
      );
      const command = restoreCommand(mockConfig);

      expect(await command?.action?.(mockContext, 'my-checkpoint')).toEqual({
        type: 'tool',
        toolName: 'run_shell_command',
        toolArgs: 'ls',
      });
      expect(mockContext.ui.loadHistory).toHaveBeenCalledWith(
        toolCallData.history,
      );
      expect(mockSetHistory).toHaveBeenCalledWith(toolCallData.clientHistory);
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
    });

    it('should restore even if only toolCall is present', async () => {
      const toolCallData = {
        toolCall: { name: 'run_shell_command', args: 'ls' },
      };
      await fs.writeFile(
        path.join(checkpointsDir, 'my-checkpoint.json'),
        JSON.stringify(toolCallData),
      );

      const command = restoreCommand(mockConfig);

      expect(await command?.action?.(mockContext, 'my-checkpoint')).toEqual({
        type: 'tool',
        toolName: 'run_shell_command',
        toolArgs: 'ls',
      });

      expect(mockContext.ui.loadHistory).not.toHaveBeenCalled();
      expect(mockSetHistory).not.toHaveBeenCalled();
      expect(mockGitService.restoreProjectFromSnapshot).not.toHaveBeenCalled();
    });
  });

  it('should return an error for a checkpoint file missing the toolCall property', async () => {
    const checkpointName = 'missing-toolcall';
    await fs.writeFile(
      path.join(checkpointsDir, `${checkpointName}.json`),
      JSON.stringify({ history: [] }), // An object that is valid JSON but missing the 'toolCall' property
    );
    const command = restoreCommand(mockConfig);

    expect(await command?.action?.(mockContext, checkpointName)).toEqual({
      type: 'message',
      messageType: 'error',
      // A more specific error message would be ideal, but for now, we can assert the current behavior.
      content: expect.stringContaining('Could not read restorable tool calls.'),
    });
  });

  describe('completion', () => {
    it('should return an empty array if temp dir is not found', async () => {
      vi.mocked(mockConfig.storage.getProjectTempDir).mockReturnValue('');
      const command = restoreCommand(mockConfig);

      expect(await command?.completion?.(mockContext, '')).toEqual([]);
    });

    it('should return an empty array on readdir error', async () => {
      await fs.rm(checkpointsDir, { recursive: true, force: true });
      const command = restoreCommand(mockConfig);

      expect(await command?.completion?.(mockContext, '')).toEqual([]);
    });

    it('should return a list of checkpoint names', async () => {
      await fs.writeFile(path.join(checkpointsDir, 'test1.json'), '{}');
      await fs.writeFile(path.join(checkpointsDir, 'test2.json'), '{}');
      await fs.writeFile(
        path.join(checkpointsDir, 'not-a-checkpoint.txt'),
        '{}',
      );
      const command = restoreCommand(mockConfig);

      expect(await command?.completion?.(mockContext, '')).toEqual([
        'test1',
        'test2',
      ]);
    });
  });
});
