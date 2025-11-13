/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InitCommand } from './init.js';
import { performInit } from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import { CoderAgentExecutor } from '../agent/executor.js';
import { CoderAgentEvent } from '../types.js';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import { createMockConfig } from '../utils/testing_utils.js';
import type { CommandContext } from './types.js';
import type { CommandActionReturn } from '@google/gemini-cli-core';
import { logger } from '../utils/logger.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    performInit: vi.fn(),
  };
});

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../agent/executor.js', () => ({
  CoderAgentExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn(),
  })),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('InitCommand', () => {
  let eventBus: ExecutionEventBus;
  let command: InitCommand;
  let context: CommandContext;
  let publishSpy: ReturnType<typeof vi.spyOn>;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env['CODER_AGENT_WORKSPACE_PATH'] = '/tmp';
    eventBus = {
      publish: vi.fn(),
    } as unknown as ExecutionEventBus;
    command = new InitCommand();
    const mockConfig = createMockConfig({
      getModel: () => 'gemini-pro',
    });
    context = {
      config: mockConfig,
    } as CommandContext;
    publishSpy = vi.spyOn(eventBus, 'publish');
    mockExecute = vi.fn();
    vi.mocked(CoderAgentExecutor).mockImplementation(
      () =>
        ({
          execute: mockExecute,
        }) as unknown as CoderAgentExecutor,
    );
    vi.clearAllMocks();
  });

  it('has requiresWorkspace set to true', () => {
    expect(command.requiresWorkspace).toBe(true);
  });

  it('has autoExecute set to true', () => {
    expect(command.autoExecute).toBe(true);
  });

  describe('execute', () => {
    it('returns a message indicating to use executeStream', async () => {
      const result = await command.execute(context, []);
      expect(result).toEqual({
        name: 'init',
        data: 'Use executeStream to get streaming results.',
      });
    });
  });

  describe('executeStream', () => {
    it('handles info from performInit', async () => {
      vi.mocked(performInit).mockReturnValue({
        type: 'message',
        messageType: 'info',
        content: 'GEMINI.md already exists.',
      } as CommandActionReturn);

      await command.executeStream(context, [], eventBus);

      expect(logger.info).toHaveBeenCalledWith(
        '[EventBus event]: ',
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

      expect(publishSpy).toHaveBeenCalledWith(
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

    it('handles error from performInit', async () => {
      vi.mocked(performInit).mockReturnValue({
        type: 'message',
        messageType: 'error',
        content: 'An error occurred.',
      } as CommandActionReturn);

      await command.executeStream(context, [], eventBus);

      expect(publishSpy).toHaveBeenCalledWith(
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

    describe('when handling submit_prompt (previously new_file)', () => {
      beforeEach(() => {
        vi.mocked(performInit).mockReturnValue({
          type: 'submit_prompt',
          content: 'Create a new GEMINI.md file.',
        } as CommandActionReturn);
      });

      it('writes the file and executes the agent', async () => {
        await command.executeStream(context, [], eventBus);

        expect(fs.writeFileSync).toHaveBeenCalledWith(
          '/tmp/GEMINI.md',
          '',
          'utf8',
        );
        expect(CoderAgentExecutor).toHaveBeenCalled();
        expect(mockExecute).toHaveBeenCalled();
      });

      it('passes autoExecute=false to the agent executor', async () => {
        await command.executeStream(context, [], eventBus, false);

        expect(mockExecute).toHaveBeenCalledWith(
          expect.objectContaining({
            userMessage: expect.objectContaining({
              parts: expect.arrayContaining([
                expect.objectContaining({
                  text: 'Create a new GEMINI.md file.',
                }),
              ]),
              metadata: {
                coderAgent: {
                  kind: CoderAgentEvent.StateAgentSettingsEvent,
                  workspacePath: '/tmp',
                  autoExecute: false,
                },
              },
            }),
          }),
          eventBus,
        );
      });
    });
  });
});
