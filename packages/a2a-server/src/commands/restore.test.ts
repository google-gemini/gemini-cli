/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { RestoreCommand, ListCheckpointsCommand } from './restore.js';
import type { CommandContext } from './types.js';
import type { Config } from '@google/gemini-cli-core';

const mockListCheckpointFiles = vi.hoisted(() => vi.fn());
const mockReadCheckpointData = vi.hoisted(() => vi.fn());
const mockGetCheckpointInfoList = vi.hoisted(() => vi.fn());
const mockGetFormattedCheckpointList = vi.hoisted(() => vi.fn());
const mockPerformRestore = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    performRestore: mockPerformRestore,
  };
});

vi.mock('../utils/checkpoint_utils.js', () => ({
  listCheckpointFiles: mockListCheckpointFiles,
  readCheckpointData: mockReadCheckpointData,
  getCheckpointInfoList: mockGetCheckpointInfoList,
  getFormattedCheckpointList: mockGetFormattedCheckpointList,
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: mockLoggerInfo,
  },
}));

describe('RestoreCommand', () => {
  const mockConfig = {
    config: {} as Config,
  } as CommandContext;

  it('should show "no checkpoints" message when none are found', async () => {
    const command = new RestoreCommand();
    mockListCheckpointFiles.mockResolvedValue([]);
    const result = await command.execute(mockConfig, []);
    const data = result.data as AsyncGenerator;
    const yieldedValue = (await data.next()).value;
    expect(yieldedValue.content).toEqual('No restorable checkpoints found.');
  });

  it('should list available checkpoints when no arguments are provided', async () => {
    const command = new RestoreCommand();
    mockListCheckpointFiles.mockResolvedValue(['checkpoint1.json']);
    mockGetFormattedCheckpointList.mockResolvedValue('checkpoint1');
    const result = await command.execute(mockConfig, []);
    const data = result.data as AsyncGenerator;
    const yieldedValue = (await data.next()).value;
    expect(yieldedValue.content).toContain('Available checkpoints to restore:');
    expect(yieldedValue.content).toContain('checkpoint1');
  });

  it('should restore a checkpoint when a valid file is provided', async () => {
    const command = new RestoreCommand();
    mockListCheckpointFiles.mockResolvedValue(['checkpoint1.json']);
    mockReadCheckpointData.mockResolvedValue({});
    mockPerformRestore.mockResolvedValue('Restored');
    const result = await command.execute(mockConfig, ['checkpoint1.json']);
    expect(result.data).toEqual('Restored');
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      '[Command] Restored to checkpoint checkpoint1.json.',
    );
  });

  it('should show "file not found" error for a non-existent checkpoint', async () => {
    const command = new RestoreCommand();
    mockListCheckpointFiles.mockResolvedValue(['checkpoint1.json']);
    const result = await command.execute(mockConfig, ['checkpoint2.json']);
    const data = result.data as AsyncGenerator;
    const yieldedValue = (await data.next()).value;
    expect(yieldedValue.content).toEqual('File not found: checkpoint2.json');
  });

  it('should handle errors when listing checkpoints', async () => {
    const command = new RestoreCommand();
    mockListCheckpointFiles.mockRejectedValue(new Error('Read error'));
    const result = await command.execute(mockConfig, []);
    const data = result.data as AsyncGenerator;
    const yieldedValue = (await data.next()).value;
    expect(yieldedValue.content).toContain(
      'Could not read restorable checkpoints.',
    );
  });
});

describe('ListCheckpointsCommand', () => {
  const mockConfig = {
    config: {} as Config,
  } as CommandContext;

  it('should list all available checkpoints', async () => {
    const command = new ListCheckpointsCommand();
    const checkpointInfo = [{ file: 'checkpoint1.json', description: 'Test' }];
    mockGetCheckpointInfoList.mockResolvedValue(checkpointInfo);
    const result = await command.execute(mockConfig);
    const data = result.data as AsyncGenerator;
    const yieldedValue = (await data.next()).value;
    expect(yieldedValue.content).toEqual(JSON.stringify(checkpointInfo));
  });

  it('should handle errors when listing checkpoints', async () => {
    const command = new ListCheckpointsCommand();
    mockGetCheckpointInfoList.mockRejectedValue(new Error('Read error'));
    const result = await command.execute(mockConfig);
    const data = result.data as AsyncGenerator;
    const yieldedValue = (await data.next()).value;
    expect(yieldedValue.content).toContain('Could not read checkpoints.');
  });
});
