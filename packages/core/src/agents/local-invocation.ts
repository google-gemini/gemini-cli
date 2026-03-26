/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type AgentLoopContext } from '../config/agent-loop-context.js';
import {
  BaseToolInvocation,
  type ToolResult,
  type ToolLiveOutput,
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
} from './types.js';
import { randomUUID } from 'node:crypto';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  sanitizeThoughtContent,
  sanitizeToolArgs,
  sanitizeErrorMessage,
} from '../utils/agent-sanitization-utils.js';
import { LocalSubagentSession } from './local-subagent-protocol.js';
import type { AgentEvent } from '../agent/types.js';

const INPUT_PREVIEW_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 200;
const MAX_RECENT_ACTIVITY = 3;

/**
 * Represents a validated, executable instance of a subagent tool.
 *
 * This class orchestrates the execution of a defined agent by:
 * 1. Using {@link LocalSubagentSession} as the execution engine.
 * 2. Bridging the agent's streaming activity (e.g., thoughts) to the tool's
 * live output stream via the session's rawActivityCallback.
 * 3. Formatting the final result into a {@link ToolResult}.
 */
export class LocalSubagentInvocation extends BaseToolInvocation<
  AgentInputs,
  ToolResult
> {
  /**
   * @param definition The definition object that configures the agent.
   * @param context The agent loop context.
   * @param params The validated input parameters for the agent.
   * @param messageBus Message bus for policy enforcement.
   * @param _toolName Optional override for the tool name.
   * @param _toolDisplayName Optional override for the tool display name.
   * @param _onAgentEvent Optional callback for parent session observability.
   */
  constructor(
    private readonly definition: LocalAgentDefinition,
    private readonly context: AgentLoopContext,
    params: AgentInputs,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
    private readonly _onAgentEvent?: (event: AgentEvent) => void,
  ) {
    super(
      params,
      messageBus,
      _toolName ?? definition.name,
      _toolDisplayName ?? definition.displayName,
    );
  }

  /**
   * Returns a concise, human-readable description of the invocation.
   * Used for logging and display purposes.
   */
  getDescription(): string {
    const inputSummary = Object.entries(this.params)
      .map(
        ([key, value]) =>
          `${key}: ${String(value).slice(0, INPUT_PREVIEW_MAX_LENGTH)}`,
      )
      .join(', ');

    const description = `Running subagent '${this.definition.name}' with inputs: { ${inputSummary} }`;
    return description.slice(0, DESCRIPTION_MAX_LENGTH);
  }

  /**
   * Executes the subagent.
   *
   * @param signal An `AbortSignal` to cancel the agent's execution.
   * @param updateOutput A callback to stream intermediate output, such as the
   * agent's thoughts, to the user interface.
   * @returns A `Promise` that resolves with the final `ToolResult`.
   */
  async execute(
    signal: AbortSignal,
    updateOutput?: (output: ToolLiveOutput) => void,
  ): Promise<ToolResult> {
    let recentActivity: SubagentActivityItem[] = [];

    // Raw SubagentActivityEvent handler — preserves all existing progress display logic.
    // Passed as rawActivityCallback to LocalSubagentSession so the protocol can call it
    // before translating to AgentEvents.
    const onActivity = (activity: SubagentActivityEvent): void => {
      if (!updateOutput) return;

      let updated = false;

      switch (activity.type) {
        case 'THOUGHT_CHUNK': {
          const text = String(activity.data['text']);
          const lastItem = recentActivity[recentActivity.length - 1];

          if (
            lastItem &&
            lastItem.type === 'thought' &&
            lastItem.status === 'running'
          ) {
            lastItem.content = sanitizeThoughtContent(text);
          } else {
            recentActivity.push({
              id: randomUUID(),
              type: 'thought',
              content: sanitizeThoughtContent(text),
              status: 'running',
            });
          }
          updated = true;
          break;
        }
        case 'TOOL_CALL_START': {
          const name = String(activity.data['name']);
          const displayName = activity.data['displayName']
            ? sanitizeErrorMessage(String(activity.data['displayName']))
            : undefined;
          const description = activity.data['description']
            ? sanitizeErrorMessage(String(activity.data['description']))
            : undefined;
          const args = JSON.stringify(sanitizeToolArgs(activity.data['args']));
          recentActivity.push({
            id: randomUUID(),
            type: 'tool_call',
            content: name,
            displayName,
            description,
            args,
            status: 'running',
          });
          updated = true;
          break;
        }
        case 'TOOL_CALL_END': {
          const name = String(activity.data['name']);
          const data = activity.data['data'];
          const isError = isToolActivityError(data);

          for (let i = recentActivity.length - 1; i >= 0; i--) {
            if (
              recentActivity[i].type === 'tool_call' &&
              recentActivity[i].content === name &&
              recentActivity[i].status === 'running'
            ) {
              recentActivity[i].status = isError ? 'error' : 'completed';
              updated = true;
              break;
            }
          }
          break;
        }
        case 'ERROR': {
          const error = String(activity.data['error']);
          const errorType = activity.data['errorType'];
          const sanitizedError = sanitizeErrorMessage(error);
          const isCancellation =
            errorType === SubagentActivityErrorType.CANCELLED ||
            error === SUBAGENT_CANCELLED_ERROR_MESSAGE;
          const isRejection =
            errorType === SubagentActivityErrorType.REJECTED ||
            error.startsWith(SUBAGENT_REJECTED_ERROR_PREFIX);

          const toolName = activity.data['name']
            ? String(activity.data['name'])
            : undefined;

          if (toolName && (isCancellation || isRejection)) {
            for (let i = recentActivity.length - 1; i >= 0; i--) {
              if (
                recentActivity[i].type === 'tool_call' &&
                recentActivity[i].content === toolName &&
                recentActivity[i].status === 'running'
              ) {
                recentActivity[i].status = 'cancelled';
                updated = true;
                break;
              }
            }
          } else if (toolName) {
            // Mark non-rejection/non-cancellation errors as 'error'
            for (let i = recentActivity.length - 1; i >= 0; i--) {
              if (
                recentActivity[i].type === 'tool_call' &&
                recentActivity[i].content === toolName &&
                recentActivity[i].status === 'running'
              ) {
                recentActivity[i].status = 'error';
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
            status: isCancellation || isRejection ? 'cancelled' : 'error',
          });
          updated = true;
          break;
        }
        default:
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
          state: 'running',
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

    // Subscribe for parent session observability (future use)
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
          state: 'running',
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
      await session.send({ message: [{ type: 'text', text: query }] });

      const output = await session.getResult();

      if (output.terminate_reason === AgentTerminateMode.ABORTED) {
        const progress: SubagentProgress = {
          isSubagentProgress: true,
          agentName: this.definition.name,
          recentActivity: [...recentActivity],
          state: 'cancelled',
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
        state: 'completed',
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
        if (item.status === 'running') {
          item.status = isAbort ? 'cancelled' : 'error';
        }
      }

      // Ensure the error is reflected in the recent activity for display
      // But only if it's NOT an abort, or if we want to show "Cancelled" as a thought
      if (!isAbort) {
        const lastActivity = recentActivity[recentActivity.length - 1];
        if (!lastActivity || lastActivity.status !== 'error') {
          recentActivity.push({
            id: randomUUID(),
            type: 'thought',
            content: `Error: ${errorMessage}`,
            status: 'error',
          });
          // Maintain size limit
          if (recentActivity.length > MAX_RECENT_ACTIVITY) {
            recentActivity = recentActivity.slice(-MAX_RECENT_ACTIVITY);
          }
        }
      }

      const progress: SubagentProgress = {
        isSubagentProgress: true,
        agentName: this.definition.name,
        recentActivity: [...recentActivity],
        state: isAbort ? 'cancelled' : 'error',
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
        // We omit the 'error' property so that the UI renders our rich returnDisplay
        // instead of the raw error message. The llmContent still informs the agent of the failure.
      };
    } finally {
      signal.removeEventListener('abort', abortListener);
      unsubscribeParent?.();
    }
  }
}
