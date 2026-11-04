/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type AgentLoopContext } from '../config/agent-loop-context.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import {
  BaseToolInvocation,
  type ToolResult,
  type ExecuteOptions,
} from '../tools/tools.js';
import {
  type LocalAgentDefinition,
  type AgentInputs,
  type SubagentActivityEvent,
  type SubagentProgress,
  type SubagentActivityItem,
  AgentTerminateMode,
  SubagentActivityErrorType,
  SUBAGENT_REJECTED_ERROR_PREFIX,
  SUBAGENT_CANCELLED_ERROR_MESSAGE,
  isToolActivityError,
  SubagentState,
} from './types.js';
import { randomUUID } from 'node:crypto';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  sanitizeThoughtContent,
  sanitizeToolArgs,
  sanitizeErrorMessage,
} from '../utils/agent-sanitization-utils.js';
import { checkExhaustive } from '../utils/checks.js';
import { LocalSubagentSession } from './local-subagent-protocol.js';
import type { AgentEvent } from '../agent/types.js';

const MAX_RECENT_ACTIVITY = 3;

/** Optional configuration for subagent invocations. */
export interface SubagentInvocationOptions {
  toolName?: string;
  toolDisplayName?: string;
  onAgentEvent?: (event: AgentEvent) => void;
}

/**
 * Session-based local subagent invocation.
 *
 * This class orchestrates the execution of a defined agent by:
 * 1. Using {@link LocalSubagentSession} as the execution engine.
 * 2. Bridging the agent's streaming activity (e.g., thoughts) to the tool's
 *    live output stream via the session's rawActivityCallback.
 * 3. Formatting the final result into a {@link ToolResult}.
 */
export class LocalSessionInvocation extends BaseToolInvocation<
  AgentInputs,
  ToolResult
> {
  private readonly _onAgentEvent?: (event: AgentEvent) => void;

  /**
   * @param definition The definition object that configures the agent.
   * @param context The agent loop context.
   * @param params The validated input parameters for the agent.
   * @param messageBus Message bus for policy enforcement.
   * @param options Optional overrides for tool name, display name, and event callback.
   */
  constructor(
    private readonly definition: LocalAgentDefinition,
    private readonly context: AgentLoopContext,
    params: AgentInputs,
    messageBus: MessageBus,
    options?: SubagentInvocationOptions,
  ) {
    super(
      params,
      messageBus,
      options?.toolName ?? definition.name,
      options?.toolDisplayName ?? definition.displayName,
    );
    this._onAgentEvent = options?.onAgentEvent;
  }

  /**
   * Returns a concise, human-readable description of the invocation.
   * Used for logging and display purposes.
   */
  getDescription(): string {
    const inputSummary = Object.entries(this.params)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(', ');

    return `Running subagent '${this.definition.name}' with inputs: { ${inputSummary} }`;
  }

  private publishActivity(activity: SubagentActivityItem): void {
    void this.messageBus.publish({
      type: MessageBusType.SUBAGENT_ACTIVITY,
      subagentName: this.definition.displayName ?? this.definition.name,
      activity,
    });
  }

  /**
   * Executes the subagent.
   *
   * @param options Options for tool execution including signal and output updates.
   * @returns A `Promise` that resolves with the final `ToolResult`.
   */
  async execute(options: ExecuteOptions): Promise<ToolResult> {
    const { abortSignal: signal, updateOutput } = options;
    let recentActivity: SubagentActivityItem[] = [];

    // Raw SubagentActivityEvent handler — preserves all existing progress display logic.
    // Passed as rawActivityCallback to LocalSubagentSession so the protocol can call it
    // before translating to AgentEvents.
    const onActivity = (activity: SubagentActivityEvent): void => {
      if (!updateOutput) return;

      let updated = false;

      switch (activity.type) {
        case 'THOUGHT_CHUNK': {
          const rawText = activity.data['text'];
          const text = typeof rawText === 'string' ? rawText : '';
          const lastItem = recentActivity[recentActivity.length - 1];

          if (
            lastItem &&
            lastItem.type === 'thought' &&
            lastItem.status === SubagentState.RUNNING
          ) {
            lastItem.content = sanitizeThoughtContent(text);
          } else {
            recentActivity.push({
              id: randomUUID(),
              type: 'thought',
              content: sanitizeThoughtContent(text),
              status: SubagentState.RUNNING,
            });
          }
          updated = true;

          const latestThought = recentActivity[recentActivity.length - 1];
          if (latestThought) {
            this.publishActivity(latestThought);
          }
          break;
        }
        case 'TOOL_CALL_START': {
          const rawName = activity.data['name'];
          const name = typeof rawName === 'string' ? rawName.trim() : '';
          const displayName = activity.data['displayName']
            ? sanitizeErrorMessage(String(activity.data['displayName']).trim())
            : undefined;
          const description = activity.data['description']
            ? sanitizeErrorMessage(String(activity.data['description']))
            : undefined;
          const args = JSON.stringify(sanitizeToolArgs(activity.data['args']));
          const callId = activity.data['callId']
            ? String(activity.data['callId'])
            : randomUUID();
          recentActivity.push({
            id: callId,
            type: 'tool_call',
            content: name,
            displayName,
            description,
            args,
            status: SubagentState.RUNNING,
          });
          updated = true;

          const latestTool = recentActivity[recentActivity.length - 1];
          if (latestTool) {
            this.publishActivity(latestTool);
          }
          break;
        }
        case 'TOOL_CALL_END': {
          const data = activity.data['data'];
          const isError = isToolActivityError(data);

          const callId = activity.data['id']
            ? String(activity.data['id'])
            : undefined;

          if (callId) {
            for (let i = recentActivity.length - 1; i >= 0; i--) {
              if (
                recentActivity[i].type === 'tool_call' &&
                recentActivity[i].id === callId &&
                recentActivity[i].status === SubagentState.RUNNING
              ) {
                recentActivity[i].status = isError
                  ? SubagentState.ERROR
                  : SubagentState.COMPLETED;
                updated = true;

                this.publishActivity(recentActivity[i]);
                break;
              }
            }
          }
          break;
        }
        case 'ERROR': {
          const rawError = activity.data['error'];
          const error = typeof rawError === 'string' ? rawError.trim() : '';
          const errorType = activity.data['errorType'];
          const sanitizedError = sanitizeErrorMessage(error);
          const isCancellation =
            errorType === SubagentActivityErrorType.CANCELLED ||
            error === SUBAGENT_CANCELLED_ERROR_MESSAGE;
          const isRejection =
            errorType === SubagentActivityErrorType.REJECTED ||
            error.startsWith(SUBAGENT_REJECTED_ERROR_PREFIX);

          const callId = activity.data['callId']
            ? String(activity.data['callId'])
            : undefined;

          if (callId) {
            const targetStatus =
              isCancellation || isRejection
                ? SubagentState.CANCELLED
                : SubagentState.ERROR;

            for (let i = recentActivity.length - 1; i >= 0; i--) {
              if (
                recentActivity[i].type === 'tool_call' &&
                recentActivity[i].id === callId &&
                recentActivity[i].status === SubagentState.RUNNING
              ) {
                recentActivity[i].status = targetStatus;
                updated = true;
                break;
              }
            }
          }

          recentActivity.push({
            id: randomUUID(),
            type: 'thought',
            content:
              isCancellation || isRejection
                ? sanitizedError
                : `Error: ${sanitizedError}`,
            status:
              isCancellation || isRejection
                ? SubagentState.CANCELLED
                : SubagentState.ERROR,
          });
          updated = true;
          break;
        }
        default:
          checkExhaustive(activity.type);
          break;
      }

      if (updated) {
        // Keep only the last N items
        if (recentActivity.length > MAX_RECENT_ACTIVITY) {
          recentActivity = recentActivity.slice(-MAX_RECENT_ACTIVITY);
        }

        const progress: SubagentProgress = {
          isSubagentProgress: true,
          agentName: this.definition.name,
          recentActivity: [...recentActivity], // Copy to avoid mutation issues
          state: SubagentState.RUNNING,
        };

        updateOutput(progress);
      }
    };

    // Create session with the raw activity callback for rich progress display
    const session = new LocalSubagentSession(
      this.definition,
      this.context,
      this.messageBus,
      onActivity,
    );

    // Subscribe for parent session observability
    let unsubscribeParent: (() => void) | undefined;
    if (this._onAgentEvent) {
      unsubscribeParent = session.subscribe(this._onAgentEvent);
    }

    // Wire external abort signal to session abort
    const abortListener = () => void session.abort();
    signal.addEventListener('abort', abortListener, { once: true });

    try {
      if (updateOutput) {
        const initialProgress: SubagentProgress = {
          isSubagentProgress: true,
          agentName: this.definition.name,
          recentActivity: [],
          state: SubagentState.RUNNING,
        };
        updateOutput(initialProgress);
      }

      // Buffer non-query params, then send query as message to start execution
      const query = String(this.params['query'] ?? '');
      const otherParams = { ...this.params } as Record<string, unknown>;
      delete otherParams['query'];
      if (Object.keys(otherParams).length > 0) {
        await session.send({ update: { config: otherParams } });
      }
      await session.send({
        message: { content: [{ type: 'text', text: query }] },
      });

      const output = await session.getResult();

      if (output.terminate_reason === AgentTerminateMode.ABORTED) {
        const progress: SubagentProgress = {
          isSubagentProgress: true,
          agentName: this.definition.name,
          recentActivity: [...recentActivity],
          state: SubagentState.CANCELLED,
        };

        if (updateOutput) {
          updateOutput(progress);
        }

        const cancelError = new Error('Operation cancelled by user');
        cancelError.name = 'AbortError';
        throw cancelError;
      }

      const progress: SubagentProgress = {
        isSubagentProgress: true,
        agentName: this.definition.name,
        recentActivity: [...recentActivity],
        state: SubagentState.COMPLETED,
        result: output.result,
        terminateReason: output.terminate_reason,
      };

      if (updateOutput) {
        updateOutput(progress);
      }

      const resultContent = `Subagent '${this.definition.name}' finished.
Termination Reason: ${output.terminate_reason}
Result:
${output.result}`;

      return {
        llmContent: [{ text: resultContent }],
        returnDisplay: progress,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      const isAbort =
        (error instanceof Error && error.name === 'AbortError') ||
        errorMessage.includes('Aborted');

      // Mark any running items as error/cancelled
      for (const item of recentActivity) {
        if (item.status === SubagentState.RUNNING) {
          item.status = isAbort ? SubagentState.CANCELLED : SubagentState.ERROR;
        }
      }

      // Ensure the error is reflected in the recent activity for display
      if (!isAbort) {
        const lastActivity = recentActivity[recentActivity.length - 1];
        if (!lastActivity || lastActivity.status !== SubagentState.ERROR) {
          recentActivity.push({
            id: randomUUID(),
            type: 'thought',
            content: `Error: ${errorMessage}`,
            status: SubagentState.ERROR,
          });
          if (recentActivity.length > MAX_RECENT_ACTIVITY) {
            recentActivity = recentActivity.slice(-MAX_RECENT_ACTIVITY);
          }
        }
      }

      const progress: SubagentProgress = {
        isSubagentProgress: true,
        agentName: this.definition.name,
        recentActivity: [...recentActivity],
        state: isAbort ? SubagentState.CANCELLED : SubagentState.ERROR,
      };

      if (updateOutput) {
        updateOutput(progress);
      }

      if (isAbort) {
        throw error;
      }

      return {
        llmContent: `Subagent '${this.definition.name}' failed. Error: ${errorMessage}`,
        returnDisplay: progress,
      };
    } finally {
      signal.removeEventListener('abort', abortListener);
      unsubscribeParent?.();
    }
  }
}
