/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { LocalAgentExecutor } from './local-executor.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import { BaseToolInvocation, type ToolResult } from '../tools/tools.js';
import { ToolErrorType } from '../tools/tool-error.js';
import type {
  LocalAgentDefinition,
  AgentInputs,
  SubagentActivityEvent,
} from './types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  fireBeforeSubAgentHook,
  fireAfterSubAgentHook,
} from '../core/subagentHookTriggers.js';
import { BeforeSubAgentHookOutput } from '../hooks/types.js';

const INPUT_PREVIEW_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 200;

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
  private currentParams: AgentInputs;

  /**
   * @param definition The definition object that configures the agent.
   * @param config The global runtime configuration.
   * @param params The validated input parameters for the agent.
   * @param messageBus Optional message bus for policy enforcement.
   */
  constructor(
    private readonly definition: LocalAgentDefinition,
    private readonly config: Config,
    params: AgentInputs,
    messageBus?: MessageBus,
  ) {
    super(params, messageBus, definition.name, definition.displayName);
    this.currentParams = params;
  }

  /**
   * Returns a concise, human-readable description of the invocation.
   * Used for logging and display purposes.
   */
  getDescription(): string {
    const inputSummary = Object.entries(this.currentParams)
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
    try {
      if (updateOutput) {
        updateOutput('Subagent starting...\n');
      }

      // Fire BeforeSubAgent hook if messageBus is available
      if (this.messageBus) {
        const hookOutput = await fireBeforeSubAgentHook(
          this.messageBus,
          this.definition.name,
          this.definition.displayName,
          this.currentParams,
        );

        // Check if hook blocked execution
        if (
          hookOutput?.isBlockingDecision() ||
          hookOutput?.shouldStopExecution()
        ) {
          const reason = hookOutput.getEffectiveReason();
          return {
            llmContent: `Subagent execution blocked by hook: ${reason}`,
            returnDisplay: `Subagent execution blocked by hook: ${reason}`,
            error: {
              message: reason,
              type: ToolErrorType.EXECUTION_FAILED,
            },
          };
        }

        // Apply modified inputs if provided by hook
        if (hookOutput instanceof BeforeSubAgentHookOutput) {
          const modifiedInputs = hookOutput.getModifiedSubagentInput();
          if (modifiedInputs) {
            this.currentParams = modifiedInputs as AgentInputs;
          }
        }

        // Inject additional context if provided
        const additionalContext = hookOutput?.getAdditionalContext();
        if (additionalContext && updateOutput) {
          updateOutput(`Hook context: ${additionalContext}\n`);
        }
      }

      // Create an activity callback to bridge the executor's events to the
      // tool's streaming output.
      const onActivity = (activity: SubagentActivityEvent): void => {
        if (!updateOutput) return;

        if (
          activity.type === 'THOUGHT_CHUNK' &&
          typeof activity.data['text'] === 'string'
        ) {
          updateOutput(`🤖💭 ${activity.data['text']}`);
        }
      };

      const executor = await LocalAgentExecutor.create(
        this.definition,
        this.config,
        onActivity,
      );

      const output = await executor.run(this.currentParams, signal);

      // Fire AfterSubAgent hook if messageBus is available
      if (this.messageBus) {
        const afterHookOutput = await fireAfterSubAgentHook(
          this.messageBus,
          this.definition.name,
          this.definition.displayName,
          this.currentParams,
          {
            result: output.result,
            terminate_reason: output.terminate_reason,
          },
        );

        // Append additional context from AfterSubAgent hook if provided
        const afterContext = afterHookOutput?.getAdditionalContext();
        if (afterContext) {
          output.result = `${output.result}\n\n${afterContext}`;
        }
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

      return {
        llmContent: `Subagent '${this.definition.name}' failed. Error: ${errorMessage}`,
        returnDisplay: `Subagent Failed: ${this.definition.name}\nError: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}
