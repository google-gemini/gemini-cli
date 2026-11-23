/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import { RestoreCommand, ListCheckpointsCommand } from './restore.js';
import type { CommandContext } from './types.js';
import type { Config } from '@google/gemini-cli-core';
import { createMockConfig } from '../utils/testing_utils.js';

beforeEach(() => {
  vi.clearAllMocks();
});

const mockPerformRestore = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockGetCheckpointInfoList = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    performRestore: mockPerformRestore,
    getCheckpointInfoList: mockGetCheckpointInfoList,
  };
});

const mockFs = vi.hoisted(() => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('node:fs/promises', () => mockFs);

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: mockLoggerInfo,
  },
}));

describe('RestoreCommand', () => {
  const mockConfig = {
    config: createMockConfig() as Config,
    git: {},
  } as CommandContext;

  it('should return error if no checkpoint name is provided', async () => {
    const command = new RestoreCommand();
    const result = await command.execute(mockConfig, []);
    expect(result.data).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Please provide a checkpoint name to restore.',
    });
  });

  it('should restore a checkpoint when a valid file is provided', async () => {
    const command = new RestoreCommand();
    const toolCallData = {
      toolCall: {
        name: 'test-tool',
        args: {},
      },
      history: [],
      clientHistory: [],
      commitHash: '123',
    };
    mockFs.readFile.mockResolvedValue(JSON.stringify(toolCallData));
    const restoreContent = {
      type: 'message',
      messageType: 'info',
      content: 'Restored',
    };
    mockPerformRestore.mockReturnValue(
      (async function* () {
        yield restoreContent;
      })(),
    );
    const result = await command.execute(mockConfig, ['checkpoint1.json']);
    expect(result.data).toEqual([restoreContent]);
  });

  it('should show "file not found" error for a non-existent checkpoint', async () => {
    const command = new RestoreCommand();
    const error = new Error('File not found');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    mockFs.readFile.mockRejectedValue(error);
    const result = await command.execute(mockConfig, ['checkpoint2.json']);
    expect(result.data).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'File not found: checkpoint2.json',
    });
  });

  it('should handle invalid JSON in checkpoint file', async () => {
    const command = new RestoreCommand();
    mockFs.readFile.mockResolvedValue('invalid json');
    const result = await command.execute(mockConfig, ['checkpoint1.json']);
    expect((result.data as { content: string }).content).toContain(
      'An unexpected error occurred during restore.',
    );
  });

  describe('checkpoint path validation', () => {
    const checkpointDir =
      mockConfig.config.storage.getProjectTempCheckpointsDir();

    it.each([
      '../outside-dir/file.json',
      '../outside.json',
      // A sibling directory whose name starts with the checkpoint directory's
      // name.
      `../${path.basename(checkpointDir)}-other/checkpoint1.json`,
      'nested/../../outside.json',
      '/outside-dir/file.json',
      path.join(path.dirname(checkpointDir), 'outside.json'),
      'checkpoint1\0.json',
    ])('should reject %j without reading any file', async (checkpointName) => {
      const command = new RestoreCommand();

      const result = await command.execute(mockConfig, [checkpointName]);

      expect(result.data).toEqual({
        type: 'message',
        messageType: 'error',
        content:
          'Invalid checkpoint name: the checkpoint file must be inside the checkpoint directory.',
      });
      expect(mockFs.readFile).not.toHaveBeenCalled();
      expect(mockPerformRestore).not.toHaveBeenCalled();
    });

    it.each([
      ['checkpoint1', 'checkpoint1.json'],
      ['checkpoint1.json', 'checkpoint1.json'],
      ['nested/../checkpoint1.json', 'checkpoint1.json'],
    ])(
      'should read %j from inside the checkpoint directory',
      async (checkpointName, expectedFile) => {
        const command = new RestoreCommand();
        mockFs.readFile.mockResolvedValue('invalid json');

        await command.execute(mockConfig, [checkpointName]);

        expect(mockFs.readFile).toHaveBeenCalledTimes(1);
        expect(mockFs.readFile).toHaveBeenCalledWith(
          path.join(checkpointDir, expectedFile),
          'utf-8',
        );
      },
    );
  });
});

describe('ListCheckpointsCommand', () => {
  const mockConfig = {
    config: createMockConfig() as Config,
  } as CommandContext;

  it('should list all available checkpoints', async () => {
    const command = new ListCheckpointsCommand();
    const checkpointInfo = [{ file: 'checkpoint1.json', description: 'Test' }];
    mockFs.readdir.mockResolvedValue(['checkpoint1.json']);
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({ toolCall: { name: 'Test', args: {} } }),
    );
    mockGetCheckpointInfoList.mockReturnValue(checkpointInfo);
    const result = await command.execute(mockConfig);
    expect((result.data as { content: string }).content).toEqual(
      JSON.stringify(checkpointInfo),
    );
  });

  it('should handle errors when listing checkpoints', async () => {
    const command = new ListCheckpointsCommand();
    mockFs.readdir.mockRejectedValue(new Error('Read error'));
    const result = await command.execute(mockConfig);
    expect((result.data as { content: string }).content).toContain(
      'An unexpected error occurred while listing checkpoints.',
    );
  });
});
