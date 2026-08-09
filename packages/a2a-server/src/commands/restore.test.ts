/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
