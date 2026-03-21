/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentLoopContext, Config } from '@google/gemini-cli-core';
import type { CommandContext } from './types.js';
import { ListCheckpointsCommand, RestoreCommand } from './restore.js';

const mockGetCheckpointInfoList = vi.hoisted(() => vi.fn());
const mockGetToolCallDataSchema = vi.hoisted(() => vi.fn());
const mockIsNodeError = vi.hoisted(() => vi.fn());
const mockPerformRestore = vi.hoisted(() => vi.fn());

const mockReadFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());
const mockReaddir = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getCheckpointInfoList: mockGetCheckpointInfoList,
    getToolCallDataSchema: mockGetToolCallDataSchema,
    isNodeError: mockIsNodeError,
    performRestore: mockPerformRestore,
  };
});

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
  mkdir: mockMkdir,
  readdir: mockReaddir,
}));

function createContext(
  checkpointingEnabled = true,
  checkpointDir = '/tmp/checkpoints',
): CommandContext {
  const config = {
    getCheckpointingEnabled: vi.fn().mockReturnValue(checkpointingEnabled),
    storage: {
      getProjectTempCheckpointsDir: vi.fn().mockReturnValue(checkpointDir),
    },
  } as unknown as Config;

  return {
    agentContext: {
      config,
    } as unknown as AgentLoopContext,
    git: { restoreToCommit: vi.fn() } as unknown as CommandContext['git'],
    settings: {} as CommandContext['settings'],
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function createAsyncGenerator(values: unknown[]) {
  return (async function* () {
    for (const value of values) {
      yield value;
    }
  })();
}

describe('RestoreCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockIsNodeError.mockImplementation(
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code?: string }).code === 'string',
    );
  });

  it('delegates to list when no args are provided', async () => {
    const command = new RestoreCommand();
    const context = createContext();
    mockReaddir.mockResolvedValue([]);

    const result = await command.execute(context, []);

    expect(result).toEqual({
      name: 'restore list',
      data: 'No checkpoints found.',
    });
  });

  it('returns disabled message when checkpointing is off', async () => {
    const command = new RestoreCommand();
    const context = createContext(false);

    const result = await command.execute(context, ['checkpoint-1']);

    expect(result).toEqual({
      name: 'restore',
      data: 'Checkpointing is not enabled. Please enable it in your settings (`general.checkpointing.enabled: true`) to use /restore.',
    });
  });

  it('returns file not found for missing checkpoint', async () => {
    const command = new RestoreCommand();
    const context = createContext();
    const enoent = Object.assign(new Error('missing'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValue(enoent);

    const result = await command.execute(context, ['missing-checkpoint']);

    expect(result).toEqual({
      name: 'restore',
      data: 'File not found: missing-checkpoint.json',
    });
  });

  it('returns invalid checkpoint message when schema validation fails', async () => {
    const command = new RestoreCommand();
    const context = createContext();
    const safeParse = vi.fn().mockReturnValue({ success: false });
    mockReadFile.mockResolvedValue('{"checkpoint":true}');
    mockGetToolCallDataSchema.mockReturnValue({ safeParse });

    const result = await command.execute(context, ['bad-schema']);

    expect(result).toEqual({
      name: 'restore',
      data: 'Checkpoint file is invalid or corrupted.',
    });
    expect(mockPerformRestore).not.toHaveBeenCalled();
  });

  it('formats restore stream output', async () => {
    const command = new RestoreCommand();
    const context = createContext();
    const parsedToolCallData = { id: 'tool-call-1' };
    mockReadFile.mockResolvedValue('{"checkpoint":true}');
    mockGetToolCallDataSchema.mockReturnValue({
      safeParse: vi.fn().mockReturnValue({
        success: true,
        data: parsedToolCallData,
      }),
    });
    mockPerformRestore.mockReturnValue(
      createAsyncGenerator([
        {
          type: 'message',
          messageType: 'info',
          content: 'Checkpoint restored',
        },
        { type: 'load_history', clientHistory: [{}, {}] },
        { type: 'other', detail: 'fallback output' },
      ]),
    );

    const result = await command.execute(context, ['checkpoint-1.json']);

    expect(mockPerformRestore).toHaveBeenCalledWith(
      parsedToolCallData,
      context.git,
    );
    expect(result.name).toBe('restore');
    expect(result.data).toContain('[INFO] Checkpoint restored');
    expect(result.data).toContain('Loaded history with 2 messages.');
    expect(result.data).toContain(
      'Restored: {"type":"other","detail":"fallback output"}',
    );
  });

  it('returns unexpected error message for non-ENOENT failures', async () => {
    const command = new RestoreCommand();
    const context = createContext();
    mockReadFile.mockRejectedValue(new Error('permission denied'));
    mockIsNodeError.mockReturnValue(false);

    const result = await command.execute(context, ['checkpoint-1']);

    expect(result).toEqual({
      name: 'restore',
      data: 'An unexpected error occurred during restore: Error: permission denied',
    });
  });
});

describe('ListCheckpointsCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
  });

  it('returns disabled message when checkpointing is off', async () => {
    const command = new ListCheckpointsCommand();
    const context = createContext(false);

    const result = await command.execute(context);

    expect(result).toEqual({
      name: 'restore list',
      data: 'Checkpointing is not enabled. Please enable it in your settings (`general.checkpointing.enabled: true`) to use /restore.',
    });
  });

  it('returns no checkpoints when directory has no json files', async () => {
    const command = new ListCheckpointsCommand();
    const context = createContext();
    mockReaddir.mockResolvedValue(['notes.txt', 'checkpoint.tmp']);

    const result = await command.execute(context);

    expect(result).toEqual({
      name: 'restore list',
      data: 'No checkpoints found.',
    });
  });

  it('formats checkpoint summaries from checkpoint info list', async () => {
    const command = new ListCheckpointsCommand();
    const context = createContext();
    mockReaddir.mockResolvedValue(['cp-1.json', 'ignore.txt']);
    mockReadFile.mockResolvedValue('{"raw":"data"}');
    mockGetCheckpointInfoList.mockReturnValue([
      {
        checkpoint: 'cp-1',
        messageId: 'msg-1',
      },
    ]);

    const result = await command.execute(context);

    expect(mockGetCheckpointInfoList).toHaveBeenCalledWith(
      expect.any(Map<string, string>),
    );
    expect(result.name).toBe('restore list');
    expect(result.data).toContain('Available Checkpoints:');
    expect(result.data).toContain('**cp-1** (Message ID: msg-1)');
  });

  it('returns generic error on unexpected list failures', async () => {
    const command = new ListCheckpointsCommand();
    const context = createContext();
    mockReaddir.mockRejectedValue(new Error('boom'));

    const result = await command.execute(context);

    expect(result).toEqual({
      name: 'restore list',
      data: 'An unexpected error occurred while listing checkpoints.',
    });
  });
});
