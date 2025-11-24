/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InitCommand } from './init.js';
import type { CommandContext } from './types.js';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import { CoderAgentExecutor } from '../agent/executor.js';

const mockPerformInit = vi.hoisted(() => vi.fn());
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    performInit: mockPerformInit,
  };
});

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: mockExistsSync,
    writeFileSync: mockWriteFileSync,
  };
});

const mockV4 = vi.hoisted(() => vi.fn());
vi.mock('uuid', async (importOriginal) => {
  const actual = await importOriginal<typeof import('uuid')>();
  return {
    ...actual,
    v4: mockV4,
  };
});

const mockAgentExecutorExecute = vi.hoisted(() => vi.fn());
vi.mock('../agent/executor.js', () => {
  const CoderAgentExecutor = vi.fn();
  CoderAgentExecutor.prototype.execute = mockAgentExecutorExecute;
  return { CoderAgentExecutor };
});

describe('InitCommand', () => {
  const commandContext: CommandContext = {
    config: {
      getModel: () => 'gemini-pro',
    },
  };
  const eventBus: ExecutionEventBus = {
    publish: vi.fn(),
  };

  beforeEach(() => {
    process.env['CODER_AGENT_WORKSPACE_PATH'] = '/test/workspace';
    mockV4.mockReturnValue('test-uuid');
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env['CODER_AGENT_WORKSPACE_PATH'];
  });

  it('should return data for execute', async () => {
    const command = new InitCommand();
    const result = await command.execute(commandContext, []);
    expect(result).toEqual({
      name: 'init',
      data: 'Use executeStream to get streaming results.',
    });
  });

  it('should handle info case', async () => {
    mockPerformInit.mockReturnValue({
      type: 'info',
      message: 'GEMINI.md already exists.',
    });

    const command = new InitCommand();
    const result = await command.executeStream(commandContext, [], eventBus);

    expect(result).toEqual({
      name: 'init',
      data: 'OK',
    });

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'status-update',
        status: expect.objectContaining({
          state: 'completed',
          message: expect.objectContaining({
            parts: [{ kind: 'text', text: 'GEMINI.md already exists.' }],
          }),
        }),
      }),
    );
  });

  it('should handle error case', async () => {
    mockPerformInit.mockReturnValue({
      type: 'error',
      message: 'An error occurred.',
    });

    const command = new InitCommand();
    const result = await command.executeStream(commandContext, [], eventBus);

    expect(result).toEqual({
      name: 'init',
      data: 'OK',
    });

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'status-update',
        status: expect.objectContaining({
          state: 'failed',
          message: expect.objectContaining({
            parts: [{ kind: 'text', text: 'An error occurred.' }],
          }),
        }),
      }),
    );
  });

  it('should handle new_file case', async () => {
    const prompt = 'Analyze the project and generate GEMINI.md';
    mockPerformInit.mockReturnValue({
      type: 'new_file',
      prompt,
    });

    const command = new InitCommand();
    const result = await command.executeStream(
      commandContext,
      [],
      eventBus,
      true,
    );

    expect(result).toEqual({
      name: 'init',
      data: 'OK',
    });

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/test/workspace/GEMINI.md',
      '',
      'utf8',
    );
    expect(CoderAgentExecutor).toHaveBeenCalledTimes(1);
    expect(mockAgentExecutorExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({
          parts: [{ kind: 'text', text: prompt }],
        }),
      }),
      eventBus,
    );
  });
});
