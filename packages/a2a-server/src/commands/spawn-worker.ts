/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Command,
  CommandContext,
  CommandExecutionResponse,
} from './types.js';
import { CoderAgentEvent, type AgentSettings } from '../types.js';
import type { CoderAgentExecutor } from '../agent/executor.js';
import type { RequestContext } from '@a2a-js/sdk/server';
import { logger } from '../utils/logger.js';
import { createBackgroundEventBus } from '../utils/background_event_bus.js';

const MAX_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours max

function parseArgs(args: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        result.set(key, value);
        i++;
      }
    }
  }
  return result;
}

/**
 * SpawnWorkerCommand creates a background worker Task using the native
 * CoderAgentExecutor pipeline with autoExecute:true and isBackground:true.
 *
 * Key behaviors:
 * - Returns JSON response immediately (non-streaming)
 * - Task continues execution in background after HTTP response
 * - Task survives client disconnect (isBackground skips socket abort)
 * - Optional timeout for safety (defaults to 30 minutes)
 *
 * Observability:
 * - Use list-workers to see current session's background tasks
 * - Use get-worker to get details of a specific task
 * - Note: list-workers only shows in-memory tasks (lost after restart)
 */
export class SpawnWorkerCommand implements Command {
  readonly name = 'spawn-worker';
  readonly description =
    'Spawn a background worker task to complete a specific task autonomously';
  readonly topLevel = true;
  readonly streaming = false; // Returns JSON immediately, no SSE
  readonly requiresWorkspace = true;
  readonly arguments = [
    {
      name: 'task',
      description: 'The task for the worker to complete',
      isRequired: true,
    },
    {
      name: 'workerId',
      description: 'Optional identifier for this worker (defaults to UUID)',
      isRequired: false,
    },
    {
      name: 'timeout',
      description:
        'Optional timeout in minutes (default: 30, max: 240). Task is cancelled after timeout.',
      isRequired: false,
    },
  ];

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const parsedArgs = parseArgs(args);

    const taskDescription = parsedArgs.get('task') || parsedArgs.get('t');
    const workerId =
      parsedArgs.get('workerId') || `worker-${uuidv4().slice(0, 8)}`;
    const timeoutMinutes = parseInt(parsedArgs.get('timeout') || '30', 10);

    if (!taskDescription) {
      throw new Error('Task is required. Use --task "your task description"');
    }

    if (!context.agentExecutor) {
      throw new Error('Agent executor not found in context.');
    }

    const agentExecutor = context.agentExecutor as CoderAgentExecutor;

    const workspacePath = process.env['CODER_AGENT_WORKSPACE_PATH'];
    if (!workspacePath) {
      throw new Error(
        'CODER_AGENT_WORKSPACE_PATH environment variable not set.',
      );
    }

    // Validate and clamp timeout
    const timeoutMs = Math.min(
      Math.max(timeoutMinutes * 60 * 1000, 60 * 1000), // minimum 1 minute
      MAX_TIMEOUT_MS,
    );

    logger.info(`[spawn-worker] Creating worker task: ${workerId}`);
    logger.info(`[spawn-worker] Task description: ${taskDescription}`);
    logger.info(`[spawn-worker] Workspace: ${workspacePath}`);
    logger.info(`[spawn-worker] Timeout: ${timeoutMs / 60000} minutes`);

    const agentSettings: AgentSettings = {
      kind: CoderAgentEvent.StateAgentSettingsEvent,
      workspacePath,
      autoExecute: true,
      isBackground: true,
    };

    const taskId = workerId;
    const contextId = uuidv4();

    const requestContext: RequestContext = {
      userMessage: {
        kind: 'message',
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: `${taskDescription}\n\nWhen you complete this task, output a clear summary of what you did.`,
          },
        ],
        messageId: uuidv4(),
        taskId,
        contextId,
        metadata: {
          coderAgent: agentSettings,
        },
      },
      taskId,
      contextId,
    };

    // Create minimal background event bus (logs only terminal states)
    const backgroundEventBus = createBackgroundEventBus(taskId);

    // Set up timeout for safety
    const timeoutHandle = setTimeout(() => {
      logger.warn(
        `[spawn-worker] Task ${workerId} timed out after ${timeoutMs / 60000} minutes`,
      );
      void agentExecutor.cancelTask(taskId, backgroundEventBus);
    }, timeoutMs);

    // Fire and forget: Start execution but don't await completion
    agentExecutor
      .execute(requestContext, backgroundEventBus)
      .finally(() => {
        clearTimeout(timeoutHandle);
        backgroundEventBus.finished();
        logger.info(`[spawn-worker] Background task ${workerId} completed`);
      })
      .catch((err) =>
        logger.error(`[spawn-worker] Background task ${workerId} error:`, err),
      );

    logger.info(`[spawn-worker] Worker ${workerId} started in background mode`);

    return {
      name: this.name,
      data: {
        workerId,
        taskId,
        contextId,
        state: 'running',
        workspacePath,
        timeoutMinutes: timeoutMs / 60000,
        note: 'Task running in background. Files will be created in workspacePath.',
      },
    };
  }
}

/**
 * ListWorkersCommand returns all background worker Tasks.
 *
 * NOTE: This only shows tasks from the current server session.
 * Tasks are lost from in-memory store after server restart.
 * For persistent tasks, use /tasks/:taskId/metadata endpoint with known taskId.
 */
export class ListWorkersCommand implements Command {
  readonly name = 'list-workers';
  readonly description =
    'List all background worker tasks (current session only)';
  readonly topLevel = true;

  async execute(
    context: CommandContext,
    _args: string[],
  ): Promise<CommandExecutionResponse> {
    if (!context.agentExecutor) {
      throw new Error('Agent executor not found in context.');
    }

    const agentExecutor = context.agentExecutor as CoderAgentExecutor;
    const allTasks = agentExecutor.getAllTasks();

    // Filter to only background worker tasks
    const workerTasks = allTasks
      .filter((wrapper) => wrapper.agentSettings?.isBackground === true)
      .map((wrapper) => ({
        id: wrapper.id,
        state: wrapper.task.taskState,
        model: wrapper.task.modelInfo || wrapper.task.config.getModel(),
        promptCount: wrapper.task.promptCount,
      }));

    logger.info(
      `[list-workers] Found ${workerTasks.length} worker tasks (of ${allTasks.length} total)`,
    );

    return {
      name: this.name,
      data: workerTasks,
    };
  }
}

/**
 * GetWorkerCommand retrieves details of a specific worker Task by ID.
 */
export class GetWorkerCommand implements Command {
  readonly name = 'get-worker';
  readonly description = 'Get details of a specific worker task';
  readonly topLevel = true;
  readonly arguments = [
    {
      name: 'workerId',
      description: 'Worker/Task ID to get details for',
      isRequired: true,
    },
  ];

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const parsedArgs = parseArgs(args);
    const workerId = parsedArgs.get('workerId');

    if (!workerId) {
      throw new Error('workerId is required. Use --workerId "worker-id"');
    }

    if (!context.agentExecutor) {
      throw new Error('Agent executor not found in context.');
    }

    const agentExecutor = context.agentExecutor as CoderAgentExecutor;
    const wrapper = agentExecutor.getTask(workerId);

    if (!wrapper) {
      throw new Error(`Worker ${workerId} not found`);
    }

    const task = wrapper.task;

    return {
      name: this.name,
      data: {
        id: wrapper.id,
        contextId: task.contextId,
        state: task.taskState,
        model: task.modelInfo || task.config.getModel(),
        autoExecute: wrapper.agentSettings?.autoExecute ?? false,
        isBackground: wrapper.agentSettings?.isBackground ?? false,
        promptCount: task.promptCount,
        completedToolCalls: task.completedToolCalls.length,
      },
    };
  }
}

/**
 * CancelWorkerCommand cancels a running background worker task.
 */
export class CancelWorkerCommand implements Command {
  readonly name = 'cancel-worker';
  readonly description = 'Cancel a running background worker task';
  readonly topLevel = true;
  readonly arguments = [
    {
      name: 'workerId',
      description: 'Worker/Task ID to cancel',
      isRequired: true,
    },
  ];

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const parsedArgs = parseArgs(args);
    const workerId = parsedArgs.get('workerId');

    if (!workerId) {
      throw new Error('workerId is required. Use --workerId "worker-id"');
    }

    if (!context.agentExecutor) {
      throw new Error('Agent executor not found in context.');
    }

    const agentExecutor = context.agentExecutor as CoderAgentExecutor;
    const wrapper = agentExecutor.getTask(workerId);

    if (!wrapper) {
      throw new Error(`Worker ${workerId} not found`);
    }

    const task = wrapper.task;
    const previousState = task.taskState;

    // Use a minimal event bus for the cancellation (no HTTP response)
    const cancelEventBus = createBackgroundEventBus(workerId);

    logger.info(`[cancel-worker] Cancelling worker ${workerId}`);
    await agentExecutor.cancelTask(workerId, cancelEventBus);
    cancelEventBus.finished();

    return {
      name: this.name,
      data: {
        workerId,
        previousState,
        currentState: task.taskState,
        message: `Worker ${workerId} cancellation requested`,
      },
    };
  }
}
