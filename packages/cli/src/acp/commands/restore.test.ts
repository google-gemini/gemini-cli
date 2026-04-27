/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RestoreCommand, ListCheckpointsCommand } from './restore.js';
import * as fs from 'node:fs/promises';
import {
  getCheckpointInfoList,
  getToolCallDataSchema,
  isNodeError,
  performRestore,
} from '@google/gemini-cli-core';
import type { CommandContext } from './types.js';
import type { Mock } from 'vitest';

vi.mock('node:fs/promises');
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getCheckpointInfoList: vi.fn(),
    getToolCallDataSchema: vi.fn(),
    isNodeError: vi.fn(),
    performRestore: vi.fn(),
  };
});

describe('RestoreCommand', () => {
  let context: CommandContext;
  let restoreCommand: RestoreCommand;

  beforeEach(() => {
    vi.resetAllMocks();
    restoreCommand = new RestoreCommand();
    context = {
      agentContext: {
        config: {
          getCheckpointingEnabled: vi.fn().mockReturnValue(true),
          storage: {
            getProjectTempCheckpointsDir: vi
              .fn()
              .mockReturnValue('/tmp/checkpoints'),
          },
        },
      },
      git: {},
      sendMessage: vi.fn(),
    } as unknown as CommandContext;
  });

  it('delegates to list behavior when invoked without args', async () => {
    const listExecuteSpy = vi
      .spyOn(ListCheckpointsCommand.prototype, 'execute')
      .mockResolvedValue({
        name: 'restore list',
        data: 'list data',
      });

    const response = await restoreCommand.execute(context, []);

    expect(listExecuteSpy).toHaveBeenCalledWith(context);
    expect(response).toEqual({
      name: 'restore list',
      data: 'list data',
    });
  });

  it('returns checkpointing-disabled message when disabled', async () => {
    (
      context.agentContext.config.getCheckpointingEnabled as Mock
    ).mockReturnValue(false);

    const response = await restoreCommand.execute(context, ['checkpoint1']);

    expect(response.data).toContain('Checkpointing is not enabled');
  });

  it('returns file-not-found message for missing checkpoint', async () => {
    const error = new Error('ENOENT');
    (error as Error & { code: string }).code = 'ENOENT';
    vi.mocked(fs.readFile).mockRejectedValue(error);
    vi.mocked(isNodeError).mockReturnValue(true);

    const response = await restoreCommand.execute(context, ['missing']);

    expect(response.data).toBe('File not found: missing.json');
  });

  it('handles checkpoint filename already ending in .json', async () => {
    const error = new Error('ENOENT');
    (error as Error & { code: string }).code = 'ENOENT';
    vi.mocked(fs.readFile).mockRejectedValue(error);
    vi.mocked(isNodeError).mockReturnValue(true);

    const response = await restoreCommand.execute(context, ['existing.json']);

    expect(response.data).toBe('File not found: existing.json');
    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('existing.json'),
      'utf-8',
    );
  });

  it('returns invalid/corrupt checkpoint message when schema parse fails', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{"invalid": "data"}');
    vi.mocked(getToolCallDataSchema).mockReturnValue({
      safeParse: vi.fn().mockReturnValue({ success: false }),
    } as unknown as ReturnType<typeof getToolCallDataSchema>);

    const response = await restoreCommand.execute(context, ['invalid']);

    expect(response.data).toBe('Checkpoint file is invalid or corrupted.');
  });

  it('formats streamed restore results correctly', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('{"valid": "data"}');
    vi.mocked(getToolCallDataSchema).mockReturnValue({
      safeParse: vi
        .fn()
        .mockReturnValue({ success: true, data: { some: 'data' } }),
    } as unknown as ReturnType<typeof getToolCallDataSchema>);

    async function* mockRestoreGenerator() {
      yield { type: 'message', messageType: 'info', content: 'Restoring...' };
      yield { type: 'load_history', clientHistory: [{}, {}] };
      yield { type: 'other', some: 'other' };
    }
    vi.mocked(performRestore).mockReturnValue(
      mockRestoreGenerator() as unknown as ReturnType<typeof performRestore>,
    );

    const response = await restoreCommand.execute(context, ['valid']);

    expect(response.data).toContain('[INFO] Restoring...');
    expect(response.data).toContain('Loaded history with 2 messages.');
    expect(response.data).toContain(
      'Restored: {"type":"other","some":"other"}',
    );
  });

  it('returns generic unexpected error message for non-ENOENT failures', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('Random error'));
    vi.mocked(isNodeError).mockReturnValue(false);

    const response = await restoreCommand.execute(context, ['error']);

    expect(response.data).toContain(
      'An unexpected error occurred during restore: Error: Random error',
    );
  });
});

describe('ListCheckpointsCommand', () => {
  let context: CommandContext;
  let listCommand: ListCheckpointsCommand;

  beforeEach(() => {
    vi.resetAllMocks();
    listCommand = new ListCheckpointsCommand();
    context = {
      agentContext: {
        config: {
          getCheckpointingEnabled: vi.fn().mockReturnValue(true),
          storage: {
            getProjectTempCheckpointsDir: vi
              .fn()
              .mockReturnValue('/tmp/checkpoints'),
          },
        },
      },
    } as unknown as CommandContext;
  });

  it('returns checkpointing-disabled message when disabled', async () => {
    (
      context.agentContext.config.getCheckpointingEnabled as Mock
    ).mockReturnValue(false);

    const response = await listCommand.execute(context);

    expect(response.data).toContain('Checkpointing is not enabled');
  });

  it('returns "No checkpoints found." when no .json checkpoints exist', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      'not-a-checkpoint.txt',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const response = await listCommand.execute(context);

    expect(response.data).toBe('No checkpoints found.');
  });

  it('ignores error when mkdir fails', async () => {
    vi.mocked(fs.mkdir).mockRejectedValue(new Error('mkdir fail'));
    vi.mocked(fs.readdir).mockResolvedValue([]);

    const response = await listCommand.execute(context);

    expect(response.data).toBe('No checkpoints found.');
    expect(fs.mkdir).toHaveBeenCalled();
  });

  it('formats checkpoint summary output from checkpoint metadata', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([
      'cp1.json',
      'cp2.json',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    vi.mocked(getCheckpointInfoList).mockReturnValue([
      { messageId: 'id1', checkpoint: 'cp1' },
      { messageId: 'id2', checkpoint: 'cp2' },
    ]);

    const response = await listCommand.execute(context);

    expect(response.data).toContain('Available Checkpoints:');
    // Note: The current implementation of ListCheckpointsCommand incorrectly accesses
    // fileName, toolName, etc. which don't exist on CheckpointInfo, resulting in 'Unknown'.
    expect(response.data).toContain('- **Unknown**: Unknown (Status: Unknown)');
  });

  it('handles empty checkpoint info list', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readdir).mockResolvedValue(['some.json'] as any);
    vi.mocked(getCheckpointInfoList).mockReturnValue([]);

    const response = await listCommand.execute(context);

    expect(response.data).toBe('Available Checkpoints:\n');
  });

  it('returns generic unexpected error message on failures', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('Readdir fail'));

    const response = await listCommand.execute(context);

    expect(response.data).toBe(
      'An unexpected error occurred while listing checkpoints.',
    );
  });
});
