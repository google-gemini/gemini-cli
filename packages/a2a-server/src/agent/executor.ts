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
import type { ToolCallRequestInfo, Config } from '@google/gemini-cli-core';
import {
  GeminiEventType,
  SimpleExtensionLoader,
} from '@google/gemini-cli-core';
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
import { pushTaskStateFailed } from '../utils/executor_utils.js';

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
  // Cached server Config to avoid re-creating per-task (which re-fetches
  // remote agent cards and may fail if peers are busy).
  private serverConfig: Config | undefined;

  constructor(private taskStore?: TaskStore, serverConfig?: Config) {
    this.serverConfig = serverConfig;
  }

  getServerConfig(): Config | undefined {
    return this.serverConfig;
  }

  private shouldCompleteOnTurnEnd(): boolean {
    return process.env['A2A_AUTO_COMPLETE_ON_TURN_END'] === 'true';
  }

  private async getConfig(
    agentSettings: AgentSettings,
    taskId: string,
  ): Promise<Config> {
    // Reuse the server Config if available — it already has remote agents
    // registered in its ToolRegistry (after /reload-agents). Creating a new
    // Config per-task would re-fetch agent cards from peers, which can fail
    // silently if peers are busy and leave tools unregistered.
    if (this.serverConfig) {
      return this.serverConfig;
    }
    const workspaceRoot = setTargetDir(agentSettings);
    loadEnvironment(); // Will override any global env with workspace envs
    const settings = loadSettings(workspaceRoot);
    const extensions = loadExtensions(workspaceRoot);
    return loadConfig(settings, new SimpleExtensionLoader(extensions), taskId, agentSettings);
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
    const contextId: string =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (metadata['_contextId'] as string) || sdkTask.contextId;
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const agentSettings = agentSettingsInput || ({} as AgentSettings);
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
    const userMessage = requestContext.userMessage;
    const sdkTask = requestContext.task;

    const taskId = sdkTask?.id || userMessage.taskId || uuidv4();
    const contextId: string =
      userMessage.contextId ||
      sdkTask?.contextId ||
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (sdkTask?.metadata?.['_contextId'] as string) ||
      uuidv4();

    logger.info(
      `[CoderAgentExecutor] Executing for taskId: ${taskId}, contextId: ${contextId}`,
    );
    logger.info(
      `[CoderAgentExecutor] userMessage: ${JSON.stringify(userMessage)}`,
    );
    let accumulated_text = '';
    let thinking_text = '';
    let tool_calls: any[] = [];
    let content_blocks: Array<{ type: string, text?: string, toolCallIds?: string[] }> = [];
    /** Tracks the last block type to merge adjacent blocks of the same type */
    let lastBlockType: string | null = null;
    let patch_seq = 0;
    const start_time = Date.now();
    const webhookUrl = process.env['TEAM_EVENT_WEBHOOK'];

    eventBus.on('event', async (event: AgentExecutionEvent) => {
      logger.info('[EventBus event]: ', event);
      if (webhookUrl && event.kind === 'status-update' && event.status.message) {
        try {
          const msg = event.status.message;
          let changed = false;
          if (msg.parts) {
            for (const part of msg.parts) {
              if (part.kind === 'text') {
                // Filter out raw functionResponse/functionCall JSON from content
                // These are tool call data already handled via toolCalls array
                const textStr = part.text;
                const trimmed = textStr.trim();
                if (trimmed.startsWith('{"functionResponse"') ||
                  trimmed.startsWith('{"functionCall"') ||
                  trimmed.startsWith('{"function_response"') ||
                  trimmed.startsWith('{"function_call"') ||
                  trimmed === 'Agent turn completed.' ||
                  trimmed === 'Internal error: Task state lost or corrupted.') {
                  continue; // Skip — handled by toolCalls
                }
                accumulated_text += textStr;
                // Append to existing text block or create new one
                if (lastBlockType === 'text' && content_blocks.length > 0) {
                  content_blocks[content_blocks.length - 1].text = accumulated_text;
                } else {
                  content_blocks.push({ type: 'text', text: accumulated_text });
                  lastBlockType = 'text';
                }
                changed = true;
              } else if (part.kind === 'data') {
                const data = part.data as any;
                if (data && data.kind === 'thought') {
                  // Ignore raw thought marker
                } else if (data && data.subject !== undefined && data.description !== undefined) {
                  const subject = data.subject || '';
                  const description = data.description || '';
                  const thoughtFragment = (subject ? `[${subject}]\n` : '') + description + '\n';
                  thinking_text += thoughtFragment;
                  // Append to existing thinking block or create new one
                  if (lastBlockType === 'thinking' && content_blocks.length > 0) {
                    content_blocks[content_blocks.length - 1].text = thinking_text;
                  } else {
                    content_blocks.push({ type: 'thinking', text: thinking_text });
                    lastBlockType = 'thinking';
                  }
                  changed = true;
                } else if (data && data.status && data.request) {
                  const callId = data.request.callId;
                  const existingIdx = tool_calls.findIndex((t: any) => t.toolCallId === callId);
                  const callObj = {
                    toolCallId: callId,
                    title: data.tool?.name || data.request.name,
                    kind: 'execute' as const,
                    status: data.status === 'cancelled' ? 'failed' : data.status,
                    rawInput: data.request.args,
                    rawOutput: null as any,
                    content: [],
                    locations: [],
                  };
                  if (existingIdx >= 0) {
                    // Preserve rawOutput if already set
                    callObj.rawOutput = tool_calls[existingIdx].rawOutput;
                    tool_calls[existingIdx] = callObj;
                  } else {
                    tool_calls.push(callObj);
                    // Add tool_calls block for ordering
                    content_blocks.push({ type: 'tool_calls', toolCallIds: [callId] });
                    lastBlockType = 'tool_calls';
                  }
                  changed = true;
                }
              }
            }
          }
          if (changed) {
            const agentName = process.env['CODER_AGENT_NAME'] || 'unknown';
            const patch = {
              agentId: agentName,
              turnSeq: 0,
              patchSeq: patch_seq++,
              content: accumulated_text,
              thinking: thinking_text,
              toolCalls: tool_calls,
              contentBlocks: content_blocks,
              input_tokens: 0,
              output_tokens: 0,
              total_tokens: 0,
              durationMs: Date.now() - start_time,
              contextId: contextId,
              taskId: currentTask.id
            };
            const streamUrl = webhookUrl.replace('/events', '/stream_patch');
            try {
              await fetch(streamUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch)
              });
            } catch { }          }
        } catch (e) {
          logger.error('[CoderAgentExecutor] Error streaming patch:', e);
        }
      }
    });

    const store = requestStorage.getStore();
    if (!store) {
      logger.error(
        '[CoderAgentExecutor] Could not get request from async local storage. Cancellation on socket close will not be handled for this request.',
      );
    }

    const abortController = new AbortController();
    const abortSignal = abortController.signal;
    const isAsyncFireAndForget = !!webhookUrl;

    if (store && !isAsyncFireAndForget) {
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
        socket.removeListener('end', onClientEnd);
      };

      // Listen on the socket's 'end' or 'close' event (remote closed the connection)
      socket.on('end', onClientEnd);
      socket.on('close', onClientEnd);

      // It's also good practice to remove the listener if the task completes successfully
      abortSignal.addEventListener('abort', () => {
        socket.removeListener('end', onClientEnd);
        socket.removeListener('close', onClientEnd);
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const agentSettings = userMessage.metadata?.[
        'coderAgent'
      ] as AgentSettings;
      try {
        wrapper = await this.createTask(
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
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        pushTaskStateFailed(error, eventBus, taskId, contextId);
        return;
      }
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
          // Report tool calls to webhook for observability (fire-and-forget)
          const webhookUrl = process.env['TEAM_EVENT_WEBHOOK'];
          logger.info(`[CoderAgentExecutor] TEAM_EVENT_WEBHOOK=${webhookUrl ?? '(unset)'}`);
          if (webhookUrl) {
            for (const tcr of toolCallRequests) {
              const agentName =
                process.env['CODER_AGENT_NAME'] ||
                process.env['CODER_AGENT_WORKSPACE_PATH']
                  ?.split('/')
                  .pop() ||
                'unknown';
              logger.info(`[CoderAgentExecutor] Webhook POST: ${agentName} → ${tcr.name}`);
              fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: agentName,
                  to: tcr.name,
                  status: 'scheduled',
                  task: tcr.args,
                  contextId: currentTask.contextId || process.env['A2A_CONTEXT_ID'],
                  taskId: currentTask.id
                }),
              }).catch(() => {
                /* ignore webhook errors */
              });
            }
          }
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
          // Merge tool results (rawOutput) back into tool_calls array
          for (const tc of completedTools) {
            const resultText = tc.response?.responseParts
              ?.map((p: any) => {
                if (typeof p === 'string') return p;
                if (Array.isArray(p)) return p.map((pp: any) => pp.text || JSON.stringify(pp)).join('');
                return p.text || JSON.stringify(p);
              })
              .join('\n')
              .slice(0, 4000) || '';
            const existingIdx = tool_calls.findIndex((t: any) => t.toolCallId === tc.request.callId);
            if (existingIdx >= 0) {
              tool_calls[existingIdx] = {
                ...tool_calls[existingIdx],
                status: tc.status === 'cancelled' ? 'failed' : (tc.status || 'completed'),
                rawOutput: resultText || null,
              };
            }
          }
          // Send immediate stream_patch so frontend receives rawOutput right away
          // (the eventBus handler only fires on new LLM events, not on tool completion)
          if (webhookUrl) {
            const agentName = process.env['CODER_AGENT_NAME'] || 'unknown';
            const resultPatch = {
              agentId: agentName,
              turnSeq: 0,
              patchSeq: patch_seq++,
              content: accumulated_text,
              thinking: thinking_text,
              toolCalls: tool_calls,
              contentBlocks: content_blocks,
              durationMs: Date.now() - start_time,
              contextId: contextId,
              taskId: currentTask.id,
            };
            const streamUrl = webhookUrl.replace('/events', '/stream_patch');
            try {
              await fetch(streamUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(resultPatch),
              });
            } catch { }
          }
          // Report tool results to webhook for DB persistence
          if (webhookUrl) {
            const agentName = process.env['CODER_AGENT_NAME'] || 'unknown';
            for (const tc of completedTools) {
              const resultText = tc.response?.responseParts
                ?.map((p: any) => {
                  if (typeof p === 'string') return p;
                  if (Array.isArray(p)) return p.map((pp: any) => pp.text || JSON.stringify(pp)).join('');
                  return p.text || JSON.stringify(p);
                })
                .join('\n')
                .slice(0, 4000) || '';
              fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: tc.request.name,
                  to: agentName,
                  status: tc.status,
                  result: resultText,
                  taskId,
                  contextId,
                }),
              }).catch(() => { });
            }
          }

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

            // FLUSH state to DB as a complete turn before LLM resumes
            if (webhookUrl && (accumulated_text || thinking_text || tool_calls.length > 0)) {
              const agentName = process.env['CODER_AGENT_NAME'] || 'unknown';
              const flushPatch = {
                agentId: agentName,
                content: accumulated_text,
                thinking: thinking_text,
                toolCalls: tool_calls,
                contentBlocks: content_blocks,
                durationMs: Date.now() - start_time,
                final: true,
                contextId: contextId,
              };
              const streamUrl = webhookUrl.replace('/events', '/stream_patch');
              try {
                await fetch(streamUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(flushPatch),
                });
              } catch { }
              
              // Reset accumulated state so the next LLM output starts a new DB row
              accumulated_text = '';
              thinking_text = '';
              tool_calls = [];
              content_blocks = [];
              patch_seq = 0;
            }

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
        `[CoderAgentExecutor] Task ${taskId}: Agent turn finished, finalizing terminal state.`,
      );

      // Send final stream_patch with full accumulated content for DB persistence
      if (webhookUrl && (accumulated_text || thinking_text || tool_calls.length > 0)) {
        const agentName = process.env['CODER_AGENT_NAME'] || 'unknown';
        const finalPatch = {
          agentId: agentName,
          content: accumulated_text,
          thinking: thinking_text,
          toolCalls: tool_calls,
          contentBlocks: content_blocks,
          durationMs: Date.now() - start_time,
          final: true, // Signal to proxy: INSERT this as permanent DB record
          contextId: contextId,
        };
        const streamUrl = webhookUrl.replace('/events', '/stream_patch');
        try {
          await fetch(streamUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalPatch),
          });
        } catch { /* ignore webhook errors */ }
        logger.info(
          `[CoderAgentExecutor] Task ${taskId}: Sent final stream_patch (c:${accumulated_text.length}B t:${thinking_text.length}B)`,
        );
      }

      const stateChange: StateChange = {
        kind: CoderAgentEvent.StateChangeEvent,
      };
      const finalState = this.shouldCompleteOnTurnEnd()
        ? 'completed'
        : 'input-required';
      const finalMessage = undefined; // Do not emit artificial text when task completes
      logger.info(
        `[CoderAgentExecutor] Task ${taskId}: publishing terminal state=${finalState}.`,
      );
      currentTask.setTaskStateAndPublishUpdate(
        finalState,
        stateChange,
        finalMessage,
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
