/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { taskCommand } from './taskCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { TaskWorkflowService } from '../../services/TaskWorkflowService.js';

vi.mock('../../utils/persistentState.js', () => ({
  persistentState: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
  },
}));

describe('taskCommand', () => {
  beforeEach(async () => {
    TaskWorkflowService.getInstance().resetForTesting();
    // Ensure each test starts from a clean task state.
    const mockContext = createMockCommandContext();
    const cancel = taskCommand.subCommands?.find(
      (cmd) => cmd.name === 'cancel',
    );
    if (cancel?.action) {
      await cancel.action(mockContext, '');
    }
  });

  it('returns usage error when run has no goal', async () => {
    const context = createMockCommandContext();
    const run = taskCommand.subCommands?.find((cmd) => cmd.name === 'run');
    if (!run?.action) throw new Error('Action not defined');

    await run.action(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.ERROR,
      text: 'Usage: /task run "<goal>"',
    });
  });

  it('starts a task and returns submit_prompt payload', async () => {
    const context = createMockCommandContext();
    const run = taskCommand.subCommands?.find((cmd) => cmd.name === 'run');
    if (!run?.action) throw new Error('Action not defined');

    const result = await run.action(context, '"add plugin API support"');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining(
          'Started task workflow for: add plugin API support',
        ),
      }),
    );
    expect(result).toMatchObject({
      type: 'submit_prompt',
    });
  });

  it('shows status after run', async () => {
    const context = createMockCommandContext();
    const run = taskCommand.subCommands?.find((cmd) => cmd.name === 'run');
    const status = taskCommand.subCommands?.find(
      (cmd) => cmd.name === 'status',
    );
    if (!run?.action || !status?.action) throw new Error('Action not defined');

    await run.action(context, '"ship task workflow"');
    await status.action(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('Status: submitted'),
      }),
    );
  });

  it('cancels and resumes the same task', async () => {
    const context = createMockCommandContext();
    const run = taskCommand.subCommands?.find((cmd) => cmd.name === 'run');
    const cancel = taskCommand.subCommands?.find(
      (cmd) => cmd.name === 'cancel',
    );
    const resume = taskCommand.subCommands?.find(
      (cmd) => cmd.name === 'resume',
    );
    const status = taskCommand.subCommands?.find(
      (cmd) => cmd.name === 'status',
    );
    if (!run?.action || !cancel?.action || !resume?.action || !status?.action) {
      throw new Error('Action not defined');
    }

    await run.action(context, '"finish onboarding polish"');
    await cancel.action(context, '');
    await status.action(context, '');
    await resume.action(context, '');
    await status.action(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('Status: cancelled'),
      }),
    );
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('Status: submitted'),
      }),
    );
  });

  it('returns an error when resume has no task', async () => {
    const context = createMockCommandContext();
    const resume = taskCommand.subCommands?.find(
      (cmd) => cmd.name === 'resume',
    );
    if (!resume?.action) throw new Error('Action not defined');

    await resume.action(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.ERROR,
      text: 'No task found to resume. Start one with /task run "<goal>".',
    });
  });

  it('clears task state and status reflects empty state', async () => {
    const context = createMockCommandContext();
    const run = taskCommand.subCommands?.find((cmd) => cmd.name === 'run');
    const clear = taskCommand.subCommands?.find((cmd) => cmd.name === 'clear');
    const status = taskCommand.subCommands?.find(
      (cmd) => cmd.name === 'status',
    );
    if (!run?.action || !clear?.action || !status?.action) {
      throw new Error('Action not defined');
    }

    await run.action(context, '"cleanup old tasks"');
    await clear.action(context, '');
    await status.action(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.INFO,
      text: 'Cleared task workflow state.',
    });
    expect(context.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.INFO,
      text: 'No active task. Start one with /task run "<goal>".',
    });
  });

  it('lists recent task runs with trace ids', async () => {
    const context = createMockCommandContext();
    const run = taskCommand.subCommands?.find((cmd) => cmd.name === 'run');
    const list = taskCommand.subCommands?.find((cmd) => cmd.name === 'list');
    if (!run?.action || !list?.action) {
      throw new Error('Action not defined');
    }

    await run.action(context, '"add task history"');
    await list.action(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('[trace-'),
      }),
    );
  });

  it('shows task help and status when /task is run without subcommands', async () => {
    const context = createMockCommandContext();
    if (!taskCommand.action) throw new Error('Action not defined');

    await taskCommand.action(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('Task workflow commands:'),
      }),
    );
  });
});
