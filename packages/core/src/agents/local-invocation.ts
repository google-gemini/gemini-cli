/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { LocalAgentExecutor } from './local-executor.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import { BaseToolInvocation, type ToolResult } from '../tools/tools.js';
import {
  type LocalAgentDefinition,
  type AgentInputs,
  type SubagentActivityEvent,
  type SubagentProgress,
  type SubagentActivityItem,
  AgentTerminateMode,
} from './types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

const INPUT_PREVIEW_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 200;
const MAX_RECENT_ACTIVITY = 3;

/**
 * Represents a validated, executable instance of a subagent tool.
 *
 * This class orchestrates the execution of a defined agent by:
 * 1. Initializing the {@link LocalAgentExecutor}.
 * 2. Running the agent's execution loop.
 * 3. Bridging the agent's streaming activity (e.g., thoughts) to the tool's
 * live output stream.
 * 4. Formatting the final result into a {@link ToolResult}.
 */
export class LocalSubagentInvocation extends BaseToolInvocation<
  AgentInputs,
  ToolResult
> {
  /**
   * @param definition The definition object that configures the agent.
   * @param config The global runtime configuration.
   * @param params The validated input parameters for the agent.
   * @param messageBus Message bus for policy enforcement.
   */
  constructor(
    private readonly definition: LocalAgentDefinition,
    private readonly config: Config,
    params: AgentInputs,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
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
    updateOutput?: (output: string | AnsiOutput) => void,
  ): Promise<ToolResult> {
    let recentActivity: SubagentActivityItem[] = [];

    try {
      if (updateOutput) {
        // Send initial state
        const initialProgress: SubagentProgress = {
          isSubagentProgress: true,
          agentName: this.definition.name,
          recentActivity: [],
          state: 'running',
        };
        updateOutput(initialProgress as unknown as AnsiOutput);
      }

      // Create an activity callback to bridge the executor's events to the
      // tool's streaming output.
      const onActivity = (activity: SubagentActivityEvent): void => {
        if (!updateOutput) return;

        let updated = false;

        switch (activity.type) {
          case 'THOUGHT_CHUNK': {
            const text = String(activity.data['text']);
            const lastItem = recentActivity[recentActivity.length - 1];
            if (lastItem && lastItem.type === 'thought') {
              lastItem.content += text;
            } else {
              recentActivity.push({
                type: 'thought',
                content: text,
                status: 'running',
              });
            }
            updated = true;
            break;
          }
          case 'TOOL_CALL_START': {
            const name = String(activity.data['name']);
            const args = JSON.stringify(activity.data['args']);
            recentActivity.push({
              type: 'tool_call',
              content: name,
              args,
              status: 'running',
            });
            updated = true;
            break;
          }
          case 'TOOL_CALL_END': {
            const name = String(activity.data['name']);
            // Find the last running tool call with this name
            for (let i = recentActivity.length - 1; i >= 0; i--) {
              if (
                recentActivity[i].type === 'tool_call' &&
                recentActivity[i].content === name &&
                recentActivity[i].status === 'running'
              ) {
                recentActivity[i].status = 'completed';
                updated = true;
                break;
              }
            }
            break;
          }
          case 'ERROR': {
            const error = String(activity.data['error']);
            recentActivity.push({
              type: 'thought', // Treat errors as thoughts for now, or add an error type
              content: `Error: ${error}`,
              status: 'error',
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

          updateOutput(progress as unknown as AnsiOutput);
        }
      };

      const executor = await LocalAgentExecutor.create(
        this.definition,
        this.config,
        onActivity,
      );

      const output = await executor.run(this.params, signal);

      if (output.terminate_reason === AgentTerminateMode.ABORTED) {
        const progress: SubagentProgress = {
          isSubagentProgress: true,
          agentName: this.definition.name,
          recentActivity: [...recentActivity],
          state: 'cancelled',
        };

        if (updateOutput) {
          updateOutput(progress as unknown as AnsiOutput);
        }

        return {
          llmContent: `Subagent '${this.definition.name}' was cancelled by the user.`,
          returnDisplay: progress,
        };
      }

      const resultContent = `Subagent '${this.definition.name}' finished.
Termination Reason: ${output.terminate_reason}
Result:
${output.result}`;

      const displayContent = `
Subagent ${this.definition.name} Finished

Termination Reason:\n ${output.terminate_reason}

Result:
${output.result}
`;

      return {
        llmContent: [{ text: resultContent }],
        returnDisplay: displayContent,
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
          item.status = 'error';
        }
      }

      // Ensure the error is reflected in the recent activity for display
      // But only if it's NOT an abort, or if we want to show "Cancelled" as a thought
      if (!isAbort) {
        const lastActivity = recentActivity[recentActivity.length - 1];
        if (!lastActivity || lastActivity.status !== 'error') {
          recentActivity.push({
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
        updateOutput(progress as unknown as AnsiOutput);
      }

      return {
        llmContent: `Subagent '${this.definition.name}' failed. Error: ${errorMessage}`,
        returnDisplay: progress,
        // We omit the 'error' property so that the UI renders our rich returnDisplay
        // instead of the raw error message. The llmContent still informs the agent of the failure.
      };
    }
  }
}
