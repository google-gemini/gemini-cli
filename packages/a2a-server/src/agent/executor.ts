/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Task as SDKTask } from '@a2a-js/sdk';
import type {
  TaskStore,
  AgentExecutor,
  AgentExecutionEvent,
  RequestContext,
  ExecutionEventBus,
} from '@a2a-js/sdk/server';
import {
  GeminiEventType,
  SimpleExtensionLoader,
  type ToolCallRequestInfo,
  type Config,
} from '@google/gemini-cli-core';
import { v4 as uuidv4 } from 'uuid';

import { logger } from '../utils/logger.js';
import {
  CoderAgentEvent,
  getPersistedState,
  setPersistedState,
  type StateChange,
  type AgentSettings,
  type PersistedStateMetadata,
  getContextIdFromMetadata,
  getAgentSettingsFromMetadata,
} from '../types.js';
import {
  loadConfig,
  loadEnvironment,
  setIsTrusted,
  setTargetDir,
} from '../config/config.js';
import { loadSettings } from '../config/settings.js';
import { loadExtensions } from '../config/extension.js';
import { Task } from './task.js';
import { requestStorage } from '../http/requestStorage.js';
import { pushTaskStateFailed } from '../utils/executor_utils.js';
import { validateWorkspacePath } from '../utils/path_utils.js';

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
  private activeAbortControllers = new Map<string, Set<AbortController>>();
  // Track tasks currently initializing to prevent race conditions.
  private initializingTasks = new Set<string>();
  private initializationPromises = new Map<string, Promise<TaskWrapper>>();
  // Track explicitly canceled task IDs to handle cancellation during initialization.
  private explicitlyCanceledTasks = new Set<string>();

  constructor(private taskStore?: TaskStore) {}

  private async getConfig(
    agentSettings: AgentSettings,
    taskId: string,
  ): Promise<Config> {
    const workspaceRoot = setTargetDir(agentSettings);
    loadEnvironment(); // Will override any global env with workspace envs
    const isTrusted = setIsTrusted(agentSettings);
    const settings = loadSettings(workspaceRoot, isTrusted);
    const extensions = loadExtensions(workspaceRoot);
    return loadConfig(
      settings,
      new SimpleExtensionLoader(extensions),
      taskId,
      isTrusted,
    );
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

    let agentSettings;
    try {
      agentSettings = {
        ...(persistedState._agentSettings ?? {}),
        workspacePath: await validateWorkspacePath(
          persistedState._agentSettings?.workspacePath,
        ),
        isTrusted: false,
      };
    } catch (error) {
      logger.error(
        `[CoderAgentExecutor] Invalid workspace path in persisted state for task ${sdkTask.id}:`,
        error,
      );
      if (eventBus) {
        void pushTaskStateFailed(
          error,
          eventBus,
          sdkTask.id,
          sdkTask.contextId,
        );
      }
      throw error; // Re-throw to be caught by caller
    }
    const config = await this.getConfig(agentSettings, sdkTask.id);
    const contextId: string =
      getContextIdFromMetadata(metadata) || sdkTask.contextId;
    const runtimeTask = await Task.create(
      sdkTask.id,
      contextId,
      config,
      eventBus,
      agentSettings.autoExecute,
    );
    runtimeTask.taskState = persistedState._taskState;
    await runtimeTask.geminiClient.initialize();

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
    const agentSettings: AgentSettings = agentSettingsInput || {
      kind: CoderAgentEvent.StateAgentSettingsEvent,
      workspacePath: process.cwd(),
    };
    const config = await this.getConfig(agentSettings, taskId);
    const runtimeTask = await Task.create(
      taskId,
      contextId,
      config,
      eventBus,
      agentSettings.autoExecute,
    );
    await runtimeTask.geminiClient.initialize();

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

  private cleanupAndEvictTask(taskId: string) {
    const wrapper = this.tasks.get(taskId);
    if (wrapper) {
      logger.info(
        `[CoderAgentExecutor] Task ${taskId} reached terminal state ${wrapper.task.taskState}. Evicting and disposing.`,
      );
      wrapper.task.dispose();
      this.tasks.delete(taskId);
    }
  }

  cancelTask = async (
    taskId: string,
    eventBus: ExecutionEventBus,
  ): Promise<void> => {
    logger.info(
      `[CoderAgentExecutor] Received cancel request for task ${taskId}`,
    );

    const abortControllers = this.activeAbortControllers.get(taskId);
    if (abortControllers && abortControllers.size > 0) {
      this.explicitlyCanceledTasks.add(taskId);
      logger.info(
        `[CoderAgentExecutor] Aborting ${abortControllers.size} active execution loop(s) for task ${taskId}.`,
      );
      // Abort first to ensure loops are stopped.
      for (const controller of Array.from(abortControllers)) {
        controller.abort();
      }

      // Then, attempt to update state and persist.
      const wrapper = this.tasks.get(taskId);
      if (wrapper) {
        const { task } = wrapper;
        task.cancelPendingTools('Task canceled by user request.');
        task.setTaskStateAndPublishUpdate(
          'canceled',
          { kind: CoderAgentEvent.StateChangeEvent },
          'Task canceled by user request.',
          undefined,
          true,
        );
        try {
          await this.taskStore?.save(wrapper.toSDKTask());
          logger.info(
            `[CoderAgentExecutor] Task ${taskId} state CANCELED saved during active abort.`,
          );
        } catch (saveError) {
          logger.error(
            `[CoderAgentExecutor] Failed to save task ${taskId} state during active abort:`,
            saveError,
          );
        }
        this.cleanupAndEvictTask(taskId);
      }
      return;
    }

    // If there is no active execution loop, the task is idle.
    // We can clean it up directly.
    logger.info(
      `[CoderAgentExecutor] No active execution for task ${taskId}. Cleaning up directly.`,
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
        `[CoderAgentExecutor] Initiating cancellation for idle task ${taskId}.`,
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

      // Cleanup listener subscriptions to avoid memory leaks.
      this.cleanupAndEvictTask(taskId);
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
    const userMessage = requestContext.userMessage;
    const sdkTask = requestContext.task;

    const taskId = sdkTask?.id || userMessage.taskId || uuidv4();
    const contextId: string =
      userMessage.contextId ||
      sdkTask?.contextId ||
      getContextIdFromMetadata(sdkTask?.metadata) ||
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

    if (!this.activeAbortControllers.has(taskId)) {
      this.activeAbortControllers.set(taskId, new Set());
    }
    this.activeAbortControllers.get(taskId)!.add(abortController);

    let proceedToMainLoop = false;
    let wrapper: TaskWrapper | undefined;
    let isPrimaryExecution = false;

    try {
      if (store) {
        const socket = store.req.socket;
        const onSocketEnd = () => {
          logger.info(
            `[CoderAgentExecutor] Socket ended for message ${userMessage.messageId} (task ${taskId}). Aborting execution loop.`,
          );
          if (!abortController.signal.aborted) {
            abortController.abort();
          }
          socket.removeListener('end', onSocketEnd);
        };
        socket.on('end', onSocketEnd);
        socket.once('close', () => socket.removeListener('end', onSocketEnd));
        abortSignal.addEventListener('abort', () =>
          socket.removeListener('end', onSocketEnd),
        );
        logger.info(
          `[CoderAgentExecutor] Socket close handler set up for task ${taskId}.`,
        );
      }

      // Check if the task is currently initializing
      if (this.initializingTasks.has(taskId)) {
        logger.info(
          `[CoderAgentExecutor] Task ${taskId} is currently initializing. Waiting for initialization to complete.`,
        );
        const initPromise = this.initializationPromises.get(taskId);
        if (initPromise) {
          try {
            wrapper = await initPromise;
          } catch {
            logger.error(
              `[CoderAgentExecutor] Failed to wait for task ${taskId} initialization.`,
            );
            return;
          }
        }
      }

      if (!wrapper) {
        this.initializingTasks.add(taskId);
        const initPromise = (async () => {
          let initializedWrapper: TaskWrapper | undefined;
          initializedWrapper = this.tasks.get(taskId);

          if (initializedWrapper) {
            initializedWrapper.task.eventBus = eventBus;
            logger.info(
              `[CoderAgentExecutor] Task ${taskId} found in memory cache.`,
            );
          } else if (sdkTask) {
            logger.info(
              `[CoderAgentExecutor] Task ${taskId} found in TaskStore. Reconstructing...`,
            );
            try {
              initializedWrapper = await this.reconstruct(sdkTask, eventBus);
            } catch (e) {
              logger.error(
                `[CoderAgentExecutor] Aborting execution due to failed task reconstruction for task ${taskId}:`,
                e,
              );
              throw e;
            }
          } else {
            let agentSettings: AgentSettings;
            try {
              const rawAgentSettings = getAgentSettingsFromMetadata(
                userMessage.metadata,
              );
              const validatedWorkspacePath = await validateWorkspacePath(
                rawAgentSettings?.workspacePath,
              );
              agentSettings = {
                kind: CoderAgentEvent.StateAgentSettingsEvent,
                ...(rawAgentSettings || {}),
                workspacePath: validatedWorkspacePath,
                isTrusted: false,
              };
              initializedWrapper = await this.createTask(
                taskId,
                contextId,
                agentSettings,
                eventBus,
              );
            } catch (error) {
              logger.error(
                `[CoderAgentExecutor] Error creating task ${taskId}:`,
                error,
              );
              void pushTaskStateFailed(error, eventBus, taskId, contextId);
              throw error;
            }
            const newTaskSDK = initializedWrapper.toSDKTask();
            eventBus.publish({
              ...newTaskSDK,
              kind: 'task',
              status: {
                state: 'submitted',
                timestamp: new Date().toISOString(),
              },
              history: [userMessage],
            });
            try {
              await this.taskStore?.save(newTaskSDK);
              logger.info(
                `[CoderAgentExecutor] New task ${taskId} saved to store.`,
              );
            } catch (saveError) {
              logger.error(
                `[CoderAgentExecutor] Failed to save new task ${taskId} to store:`,
                saveError,
              );
            }
          }
          return initializedWrapper;
        })();

        this.initializationPromises.set(taskId, initPromise);

        try {
          wrapper = await initPromise;
        } catch {
          // Error is already handled/logged inside the promise
          return;
        } finally {
          this.initializingTasks.delete(taskId);
          this.initializationPromises.delete(taskId);
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

      if (abortSignal.aborted) {
        logger.warn(
          `[CoderAgentExecutor] Task ${taskId} was aborted during initialization.`,
        );
        const isExplicitCancel = this.explicitlyCanceledTasks.has(taskId);
        const finalState = isExplicitCancel ? 'canceled' : 'input-required';
        const message = isExplicitCancel
          ? 'Task canceled by user request.'
          : 'Execution aborted by client.';
        currentTask.setTaskStateAndPublishUpdate(
          finalState,
          { kind: CoderAgentEvent.StateChangeEvent },
          message,
          undefined,
          true,
        );
        try {
          await this.taskStore?.save(wrapper.toSDKTask());
        } catch (saveError) {
          logger.error(
            `[CoderAgentExecutor] Failed to save task ${taskId} state:`,
            saveError,
          );
        }
        if (isExplicitCancel) {
          this.cleanupAndEvictTask(taskId);
        }
        return;
      }

      if (this.executingTasks.has(taskId)) {
        logger.info(
          `[CoderAgentExecutor] Task ${taskId} has a pending execution. Processing message and yielding.`,
        );
        currentTask.eventBus = eventBus;
        try {
          for await (const _ of currentTask.acceptUserMessage(
            requestContext,
            abortController.signal,
          )) {
            logger.info(
              `[CoderAgentExecutor] Processing user message ${userMessage.messageId} in secondary execution loop for task ${taskId}.`,
            );
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            throw error;
          }
          logger.info(
            `[CoderAgentExecutor] Secondary execution loop for task ${taskId} was aborted.`,
          );
        }
        return;
      }

      isPrimaryExecution = true;

      proceedToMainLoop = true;
    } finally {
      this.explicitlyCanceledTasks.delete(taskId);
      if (!proceedToMainLoop) {
        const controllers = this.activeAbortControllers.get(taskId);
        if (controllers) {
          controllers.delete(abortController);
          if (controllers.size === 0) {
            this.activeAbortControllers.delete(taskId);
          }
        }
      }
    }

    const currentTask = wrapper.task;
    try {
      logger.info(
        `[CoderAgentExecutor] Starting main execution for message ${userMessage.messageId} for task ${taskId}.`,
      );
      this.executingTasks.add(taskId);

      let agentTurnActive = true;
      logger.info(`[CoderAgentExecutor] Task ${taskId}: Processing user turn.`);
      let agentEvents = currentTask.acceptUserMessage(
        requestContext,
        abortSignal,
      );

      while (agentTurnActive) {
        if (abortSignal.aborted) {
          logger.info(
            `[CoderAgentExecutor] Task ${taskId} aborted before turn. Exiting loop.`,
          );
          throw new Error('Execution aborted');
        }
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
            toolCallRequests.push(event.value);
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

        if (currentTask.hasPendingTools) {
          logger.info(
            `[CoderAgentExecutor] Task ${taskId}: There are still ${currentTask.pendingToolsCount} pending tools waiting for approval. Yielding to user.`,
          );
          agentTurnActive = false;
        } else {
          const completedTools = currentTask.getAndClearCompletedTools();

          if (completedTools.length > 0) {
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
            }
          } else {
            logger.info(
              `[CoderAgentExecutor] Task ${taskId}: No more tool calls to process. Ending agent turn.`,
            );
            agentTurnActive = false;
          }
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
      if (isPrimaryExecution) {
        const controllers = this.activeAbortControllers.get(taskId);
        if (controllers) {
          controllers.delete(abortController);
          if (controllers.size === 0) {
            this.activeAbortControllers.delete(taskId);
          }
        }
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

        if (
          ['canceled', 'failed', 'completed'].includes(currentTask.taskState)
        ) {
          this.cleanupAndEvictTask(taskId);
        }
      }
    }
  }
}
