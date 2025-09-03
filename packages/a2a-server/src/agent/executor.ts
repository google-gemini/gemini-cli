/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Message, Task as SDKTask } from '@a2a-js/sdk';
import type {
  TaskStore,
  AgentExecutor,
  AgentExecutionEvent,
  RequestContext,
  ExecutionEventBus,
} from '@a2a-js/sdk/server';
import type {
  ToolCallRequestInfo,
  ServerGeminiToolCallRequestEvent,
  Config,
} from '@google/gemini-cli-core';
import { GeminiEventType } from '@google/gemini-cli-core';
import { v4 as uuidv4 } from 'uuid';

import { logger } from '../utils/logger.js';
import type {
  StateChange,
  AgentSettings,
  PersistedStateMetadata,
} from '../types.js';
import {
  CoderAgentEvent,
  getPersistedState,
  setPersistedState,
} from '../types.js';
import { loadConfig, loadEnvironment, setTargetDir } from '../config/config.js';
import { loadSettings } from '../config/settings.js';
import { loadExtensions } from '../config/extension.js';
import { Task } from './task.js';
import { requestStorage } from '../http/requestStorage.js';

/**
 * Provides a wrapper for Task. Passes data from Task to SDKTask.
 * The idea is to use this class inside CoderAgentExecutor to replace Task.
 */
class TaskWrapper {
  task: Task;
  agentSettings: AgentSettings;

  constructor(task: Task, agentSettings: AgentSettings) {
    this.task = task;
    this.agentSettings = agentSettings;
  }

  get id() {
    return this.task.id;
  }

  toSDKTask(): SDKTask {
    const persistedState: PersistedStateMetadata = {
      _agentSettings: this.agentSettings,
      _taskState: this.task.taskState,
    };

    const sdkTask: SDKTask = {
      id: this.task.id,
      contextId: this.task.contextId,
      kind: 'task',
      status: {
        state: this.task.taskState,
        timestamp: new Date().toISOString(),
      },
      metadata: setPersistedState({}, persistedState),
      history: [],
      artifacts: [],
    };
    sdkTask.metadata!['_contextId'] = this.task.contextId;
    return sdkTask;
  }
}

/**
 * CoderAgentExecutor implements the agent's core logic for code generation.
 */
export class CoderAgentExecutor implements AgentExecutor {
  private tasks: Map<string, TaskWrapper> = new Map();
  // Track tasks with an active execution loop.
  private executingTasks = new Set<string>();

  constructor(private taskStore?: TaskStore) {}

  private async getConfig(
    agentSettings: AgentSettings,
    taskId: string,
  ): Promise<Config> {
    const workspaceRoot = setTargetDir(agentSettings);
    loadEnvironment(); // Will override any global env with workspace envs
    const settings = loadSettings(workspaceRoot);
    const extensions = loadExtensions(workspaceRoot);
    return await loadConfig(settings, extensions, taskId);
  }

  /**
   * Reconstructs TaskWrapper from SDKTask.
   */
  async reconstruct(
    sdkTask: SDKTask,
    eventBus?: ExecutionEventBus,
  ): Promise<TaskWrapper> {
    const metadata = sdkTask.metadata || {};
    const persistedState = getPersistedState(metadata);

    if (!persistedState) {
      throw new Error(
        `Cannot reconstruct task ${sdkTask.id}: missing persisted state in metadata.`,
      );
    }

    const agentSettings = persistedState._agentSettings;
    const config = await this.getConfig(agentSettings, sdkTask.id);
    const contextId =
      (metadata['_contextId'] as string) || (sdkTask.contextId as string);
    const runtimeTask = await Task.create(
      sdkTask.id,
      contextId,
      config,
      eventBus,
    );
    runtimeTask.taskState = persistedState._taskState;
    await runtimeTask.geminiClient.initialize(
      runtimeTask.config.getContentGeneratorConfig(),
    );

    const wrapper = new TaskWrapper(runtimeTask, agentSettings);
    this.tasks.set(sdkTask.id, wrapper);
    logger.info(`Task ${sdkTask.id} reconstructed from store.`);
    return wrapper;
  }

  async createTask(
    taskId: string,
    contextId: string,
    agentSettingsInput?: AgentSettings,
    eventBus?: ExecutionEventBus,
  ): Promise<TaskWrapper> {
    const agentSettings = agentSettingsInput || ({} as AgentSettings);
    const config = await this.getConfig(agentSettings, taskId);
    const runtimeTask = await Task.create(taskId, contextId, config, eventBus);
    await runtimeTask.geminiClient.initialize(
      runtimeTask.config.getContentGeneratorConfig(),
    );

    const wrapper = new TaskWrapper(runtimeTask, agentSettings);
    this.tasks.set(taskId, wrapper);
    logger.info(`New task ${taskId} created.`);
    return wrapper;
  }

  getTask(taskId: string): TaskWrapper | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): TaskWrapper[] {
    return Array.from(this.tasks.values());
  }

  cancelTask = async (
    taskId: string,
    eventBus: ExecutionEventBus,
  ): Promise<void> => {
    logger.info(
      `[CoderAgentExecutor] Received cancel request for task ${taskId}`,
    );
    const wrapper = this.tasks.get(taskId);

    if (!wrapper) {
      logger.warn(
        `[CoderAgentExecutor] Task ${taskId} not found for cancellation.`,
      );
      eventBus.publish({
        kind: 'status-update',
        taskId,
        contextId: uuidv4(),
        status: {
          state: 'failed',
          message: {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: `Task ${taskId} not found.` }],
            messageId: uuidv4(),
            taskId,
          },
        },
        final: true,
      });
      return;
    }

    const { task } = wrapper;

    if (task.taskState === 'canceled' || task.taskState === 'failed') {
      logger.info(
        `[CoderAgentExecutor] Task ${taskId} is already in a final state: ${task.taskState}. No action needed for cancellation.`,
      );
      eventBus.publish({
        kind: 'status-update',
        taskId,
        contextId: task.contextId,
        status: {
          state: task.taskState,
          message: {
            kind: 'message',
            role: 'agent',
            parts: [
              {
                kind: 'text',
                text: `Task ${taskId} is already ${task.taskState}.`,
              },
            ],
            messageId: uuidv4(),
            taskId,
          },
        },
        final: true,
      });
      return;
    }

    try {
      logger.info(
        `[CoderAgentExecutor] Initiating cancellation for task ${taskId}.`,
      );
      task.cancelPendingTools('Task canceled by user request.');

      const stateChange: StateChange = {
        kind: CoderAgentEvent.StateChangeEvent,
      };
      task.setTaskStateAndPublishUpdate(
        'canceled',
        stateChange,
        'Task canceled by user request.',
        undefined,
        true,
      );
      logger.info(
        `[CoderAgentExecutor] Task ${taskId} cancellation processed. Saving state.`,
      );
      await this.taskStore?.save(wrapper.toSDKTask());
      logger.info(`[CoderAgentExecutor] Task ${taskId} state CANCELED saved.`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        `[CoderAgentExecutor] Error during task cancellation for ${taskId}: ${errorMessage}`,
        error,
      );
      eventBus.publish({
        kind: 'status-update',
        taskId,
        contextId: task.contextId,
        status: {
          state: 'failed',
          message: {
            kind: 'message',
            role: 'agent',
            parts: [
              {
                kind: 'text',
                text: `Failed to process cancellation for task ${taskId}: ${errorMessage}`,
              },
            ],
            messageId: uuidv4(),
            taskId,
          },
        },
        final: true,
      });
    }
  };

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const userMessage = requestContext.userMessage as Message;
    const sdkTask = requestContext.task as SDKTask | undefined;

    const taskId = sdkTask?.id || userMessage.taskId || uuidv4();
    const contextId =
      userMessage.contextId ||
      sdkTask?.contextId ||
      sdkTask?.metadata?.['_contextId'] ||
      uuidv4();

    logger.info(
      `[CoderAgentExecutor] Executing for taskId: ${taskId}, contextId: ${contextId}`,
    );
    logger.info(
      `[CoderAgentExecutor] userMessage: ${JSON.stringify(userMessage)}`,
    );
    eventBus.on('event', (event: AgentExecutionEvent) =>
      logger.info('[EventBus event]: ', event),
    );

    const store = requestStorage.getStore();
    if (!store) {
      logger.error(
        '[CoderAgentExecutor] Could not get request from async local storage. Cancellation on socket close will not be handled for this request.',
      );
    }

    const abortController = new AbortController();
    const abortSignal = abortController.signal;

    if (store) {
      // Grab the raw socket from the request object
      const socket = store.req.socket;
      const onClientEnd = () => {
        logger.info(
          `[CoderAgentExecutor] Client socket closed for task ${taskId}. Cancelling execution.`,
        );
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
        // Clean up the listener to prevent memory leaks
        socket.removeListener('close', onClientEnd);
      };

      // Listen on the socket's 'end' event (remote closed the connection)
      socket.on('end', onClientEnd);

      // It's also good practice to remove the listener if the task completes successfully
      abortSignal.addEventListener('abort', () => {
        socket.removeListener('end', onClientEnd);
      });
      logger.info(
        `[CoderAgentExecutor] Socket close handler set up for task ${taskId}.`,
      );
    }

    let wrapper: TaskWrapper | undefined = this.tasks.get(taskId);

    if (wrapper) {
      wrapper.task.eventBus = eventBus;
      logger.info(`[CoderAgentExecutor] Task ${taskId} found in memory cache.`);
    } else if (sdkTask) {
      logger.info(
        `[CoderAgentExecutor] Task ${taskId} found in TaskStore. Reconstructing...`,
      );
      try {
        wrapper = await this.reconstruct(sdkTask, eventBus);
      } catch (e) {
        logger.error(
          `[CoderAgentExecutor] Failed to hydrate task ${taskId}:`,
          e,
        );
        const stateChange: StateChange = {
          kind: CoderAgentEvent.StateChangeEvent,
        };
        eventBus.publish({
          kind: 'status-update',
          taskId,
          contextId: sdkTask.contextId,
          status: {
            state: 'failed',
            message: {
              kind: 'message',
              role: 'agent',
              parts: [
                {
                  kind: 'text',
                  text: 'Internal error: Task state lost or corrupted.',
                },
              ],
              messageId: uuidv4(),
              taskId,
              contextId: sdkTask.contextId,
            } as Message,
          },
          final: true,
          metadata: { coderAgent: stateChange },
        });
        return;
      }
    } else {
      logger.info(`[CoderAgentExecutor] Creating new task ${taskId}.`);
      const agentSettings = userMessage.metadata?.[
        'coderAgent'
      ] as AgentSettings;
      wrapper = await this.createTask(
        taskId,
        contextId as string,
        agentSettings,
        eventBus,
      );
      const newTaskSDK = wrapper.toSDKTask();
      eventBus.publish({
        ...newTaskSDK,
        kind: 'task',
        status: { state: 'submitted', timestamp: new Date().toISOString() },
        history: [userMessage],
      });
      try {
        await this.taskStore?.save(newTaskSDK);
        logger.info(`[CoderAgentExecutor] New task ${taskId} saved to store.`);
      } catch (saveError) {
        logger.error(
          `[CoderAgentExecutor] Failed to save new task ${taskId} to store:`,
          saveError,
        );
      }
    }

    if (!wrapper) {
      logger.error(
        `[CoderAgentExecutor] Task ${taskId} is unexpectedly undefined after load/create.`,
      );
      return;
    }

    const currentTask = wrapper.task;

    if (['canceled', 'failed', 'completed'].includes(currentTask.taskState)) {
      logger.warn(
        `[CoderAgentExecutor] Attempted to execute task ${taskId} which is already in state ${currentTask.taskState}. Ignoring.`,
      );
      return;
    }

    if (this.executingTasks.has(taskId)) {
      logger.info(
        `[CoderAgentExecutor] Task ${taskId} has a pending execution. Processing message and yielding.`,
      );
      currentTask.eventBus = eventBus;
      for await (const _ of currentTask.acceptUserMessage(
        requestContext,
        abortController.signal,
      )) {
        logger.info(
          `[CoderAgentExecutor] Processing user message ${userMessage.messageId} in secondary execution loop for task ${taskId}.`,
        );
      }
      // End this execution-- the original/source will be resumed.
      return;
    }

    logger.info(
      `[CoderAgentExecutor] Starting main execution for message ${userMessage.messageId} for task ${taskId}.`,
    );
    this.executingTasks.add(taskId);

    try {
      let agentTurnActive = true;
      logger.info(`[CoderAgentExecutor] Task ${taskId}: Processing user turn.`);
      let agentEvents = currentTask.acceptUserMessage(
        requestContext,
        abortSignal,
      );

      while (agentTurnActive) {
        logger.info(
          `[CoderAgentExecutor] Task ${taskId}: Processing agent turn (LLM stream).`,
        );
        const toolCallRequests: ToolCallRequestInfo[] = [];
        for await (const event of agentEvents) {
          if (abortSignal.aborted) {
            logger.warn(
              `[CoderAgentExecutor] Task ${taskId}: Abort signal received during agent event processing.`,
            );
            throw new Error('Execution aborted');
          }
          if (event.type === GeminiEventType.ToolCallRequest) {
            toolCallRequests.push(
              (event as ServerGeminiToolCallRequestEvent).value,
            );
            continue;
          }
          await currentTask.acceptAgentMessage(event);
        }

        if (abortSignal.aborted) throw new Error('Execution aborted');

        if (toolCallRequests.length > 0) {
          logger.info(
            `[CoderAgentExecutor] Task ${taskId}: Found ${toolCallRequests.length} tool call requests. Scheduling as a batch.`,
          );
          await currentTask.scheduleToolCalls(toolCallRequests, abortSignal);
        }

        logger.info(
          `[CoderAgentExecutor] Task ${taskId}: Waiting for pending tools if any.`,
        );
        await currentTask.waitForPendingTools();
        logger.info(
          `[CoderAgentExecutor] Task ${taskId}: All pending tools completed or none were pending.`,
        );

        if (abortSignal.aborted) throw new Error('Execution aborted');

        const completedTools = currentTask.getAndClearCompletedTools();

        if (completedTools.length > 0) {
          // If all completed tool calls were canceled, manually add them to history and set state to input-required, final:true
          if (completedTools.every((tool) => tool.status === 'cancelled')) {
            logger.info(
              `[CoderAgentExecutor] Task ${taskId}: All tool calls were cancelled. Updating history and ending agent turn.`,
            );
            currentTask.addToolResponsesToHistory(completedTools);
            agentTurnActive = false;
            const stateChange: StateChange = {
              kind: CoderAgentEvent.StateChangeEvent,
            };
            currentTask.setTaskStateAndPublishUpdate(
              'input-required',
              stateChange,
              undefined,
              undefined,
              true,
            );
          } else {
            logger.info(
              `[CoderAgentExecutor] Task ${taskId}: Found ${completedTools.length} completed tool calls. Sending results back to LLM.`,
            );

            agentEvents = currentTask.sendCompletedToolsToLlm(
              completedTools,
              abortSignal,
            );
            // Continue the loop to process the LLM response to the tool results.
          }
        } else {
          logger.info(
            `[CoderAgentExecutor] Task ${taskId}: No more tool calls to process. Ending agent turn.`,
          );
          agentTurnActive = false;
        }
      }

      logger.info(
        `[CoderAgentExecutor] Task ${taskId}: Agent turn finished, setting to input-required.`,
      );
      const stateChange: StateChange = {
        kind: CoderAgentEvent.StateChangeEvent,
      };
      currentTask.setTaskStateAndPublishUpdate(
        'input-required',
        stateChange,
        undefined,
        undefined,
        true,
      );
    } catch (error) {
      if (abortSignal.aborted) {
        logger.warn(`[CoderAgentExecutor] Task ${taskId} execution aborted.`);
        currentTask.cancelPendingTools('Execution aborted');
        if (
          currentTask.taskState !== 'canceled' &&
          currentTask.taskState !== 'failed'
        ) {
          currentTask.setTaskStateAndPublishUpdate(
            'input-required',
            { kind: CoderAgentEvent.StateChangeEvent },
            'Execution aborted by client.',
            undefined,
            true,
          );
        }
      } else {
        const errorMessage =
          error instanceof Error ? error.message : 'Agent execution error';
        logger.error(
          `[CoderAgentExecutor] Error executing agent for task ${taskId}:`,
          error,
        );
        currentTask.cancelPendingTools(errorMessage);
        if (currentTask.taskState !== 'failed') {
          const stateChange: StateChange = {
            kind: CoderAgentEvent.StateChangeEvent,
          };
          currentTask.setTaskStateAndPublishUpdate(
            'failed',
            stateChange,
            errorMessage,
            undefined,
            true,
          );
        }
      }
    } finally {
      this.executingTasks.delete(taskId);
      logger.info(
        `[CoderAgentExecutor] Saving final state for task ${taskId}.`,
      );
      try {
        await this.taskStore?.save(wrapper.toSDKTask());
        logger.info(`[CoderAgentExecutor] Task ${taskId} state saved.`);
      } catch (saveError) {
        logger.error(
          `[CoderAgentExecutor] Failed to save task ${taskId} state in finally block:`,
          saveError,
        );
      }
    }
  }
}
