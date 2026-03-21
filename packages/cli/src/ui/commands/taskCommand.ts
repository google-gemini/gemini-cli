/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';
import { TaskWorkflowService } from '../../services/TaskWorkflowService.js';

const taskService = TaskWorkflowService.getInstance();

const getGoalFromArgs = (args?: string): string => {
  const goal = args?.trim() ?? '';
  return goal.replace(/^['"]|['"]$/g, '').trim();
};

const formatTaskStatus = () => {
  const status = taskService.getStatus();
  if (!status) {
    return 'No active task. Start one with /task run "<goal>".';
  }

  return [
    `Task: ${status.id}`,
    `Trace: ${status.traceId}`,
    `Goal: ${status.goal}`,
    `Status: ${status.status}`,
    `Phases: ${status.phases.join(' -> ')}`,
    `Updated: ${status.updatedAt}`,
  ].join('\n');
};

const formatTaskHelp = () =>
  [
    'Task workflow commands:',
    '/task run "<goal>"   Start a new workflow run',
    '/task status         Show the active workflow status',
    '/task list           List recent workflow runs',
    '/task resume         Resume the most recent workflow',
    '/task cancel         Cancel the current workflow',
    '/task clear          Clear active workflow state',
  ].join('\n');

const formatTaskHistory = () => {
  const history = taskService.getHistory();
  if (history.length === 0) {
    return 'No task history yet. Start one with /task run "<goal>".';
  }

  return history
    .slice(0, 10)
    .map(
      (run, idx) =>
        `${idx + 1}. ${run.id} (${run.status}) [${run.traceId}] - ${run.goal}`,
    )
    .join('\n');
};

const runSubCommand: SlashCommand = {
  name: 'run',
  description: 'Run a structured task workflow against a goal.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext, args?: string) => {
    const goal = getGoalFromArgs(args);
    if (!goal) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Usage: /task run "<goal>"',
      });
      return;
    }

    const started = taskService.start(goal);
    context.ui.addItem({
      type: MessageType.INFO,
      text: `Started task workflow for: ${goal} [${started.traceId}]`,
    });

    return {
      type: 'submit_prompt',
      content: [
        `Execute this task goal: ${goal}`,
        'Follow these phases in order:',
        '1) plan',
        '2) execute',
        '3) verify',
        '4) summarize',
        'Keep outputs concise and include explicit verification results.',
      ].join('\n'),
    };
  },
};

const statusSubCommand: SlashCommand = {
  name: 'status',
  description: 'Show the latest task workflow status.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    context.ui.addItem({
      type: MessageType.INFO,
      text: formatTaskStatus(),
    });
  },
};

const cancelSubCommand: SlashCommand = {
  name: 'cancel',
  description: 'Cancel the current task workflow.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    const cancelled = taskService.cancel();
    context.ui.addItem({
      type: cancelled ? MessageType.INFO : MessageType.ERROR,
      text: cancelled
        ? `Cancelled task ${cancelled.id}.`
        : 'No active task to cancel.',
    });
  },
};

const resumeSubCommand: SlashCommand = {
  name: 'resume',
  description: 'Resume the most recent task workflow.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    const resumed = taskService.resume();
    if (!resumed) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'No task found to resume. Start one with /task run "<goal>".',
      });
      return;
    }

    context.ui.addItem({
      type: MessageType.INFO,
      text: `Resumed task ${resumed.id}: ${resumed.goal}`,
    });

    return {
      type: 'submit_prompt',
      content: [
        `Resume this task goal: ${resumed.goal}`,
        `Task ID: ${resumed.id}`,
        'Continue from the current progress and finish phases in order:',
        '1) plan',
        '2) execute',
        '3) verify',
        '4) summarize',
        'Include what was already done and what is newly completed.',
      ].join('\n'),
    };
  },
};

const clearSubCommand: SlashCommand = {
  name: 'clear',
  description: 'Clear the saved task workflow state.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    taskService.clear();
    context.ui.addItem({
      type: MessageType.INFO,
      text: 'Cleared task workflow state.',
    });
  },
};

const listSubCommand: SlashCommand = {
  name: 'list',
  description: 'List recent task workflow runs.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    context.ui.addItem({
      type: MessageType.INFO,
      text: formatTaskHistory(),
    });
  },
};

export const taskCommand: SlashCommand = {
  name: 'task',
  description: 'Run and manage structured task workflows.',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    runSubCommand,
    statusSubCommand,
    cancelSubCommand,
    resumeSubCommand,
    clearSubCommand,
    listSubCommand,
  ],
  action: async (context: CommandContext): Promise<void> => {
    context.ui.addItem({
      type: MessageType.INFO,
      text: [formatTaskHelp(), '', formatTaskStatus()].join('\n'),
    });
  },
};
