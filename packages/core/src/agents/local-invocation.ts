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
    try {
      if (updateOutput) {
        updateOutput('Subagent starting...\n');
      }

      const verbose =
        this.config.getAgentsSettings()?.verbose !== false;
      // Create an activity callback to bridge the executor's events to the
      // tool's streaming output.
      const onActivity = (activity: SubagentActivityEvent): void => {
        if (!updateOutput) return;

        if (
          activity.type === 'THOUGHT_CHUNK' &&
          typeof activity.data['text'] === 'string'
        ) {
          updateOutput(`🤖💭 ${activity.data['text']}`);
          return;
        }

        if (!verbose) return;

        switch (activity.type) {
          case 'TOOL_CALL_START': {
            const name = activity.data['name'];
            const args = activity.data['args'];
            let argsPreview = '';
            if (args !== undefined) {
              try {
                const s = JSON.stringify(args);
                argsPreview = ` ${s.slice(0, 80)}${s.length > 80 ? '…' : ''}`;
              } catch {
                argsPreview = ' [args]';
              }
            }
            updateOutput(`Calling tool: ${String(name)}${argsPreview}\n`);
            break;
          }
          case 'TOOL_CALL_END': {
            const name = activity.data['name'];
            const output = activity.data['output'];
            const outputPreview =
              typeof output === 'string'
                ? output.slice(0, 200) + (output.length > 200 ? '…' : '')
                : String(output ?? '');
            updateOutput(`Tool ${String(name)} finished: ${outputPreview}\n`);
            break;
          }
          case 'ERROR': {
            const error = activity.data['error'];
            const context = activity.data['context'];
            const name = activity.data['name'];
            const parts = ['Error'];
            if (name) parts.push(`[${String(name)}]`);
            if (context) parts.push(`(${String(context)})`);
            parts.push(':');
            parts.push(error !== undefined ? String(error) : 'Unknown error');
            updateOutput(parts.join(' ') + '\n');
            break;
          }
          default:
            break;
        }
      };

      const executor = await LocalAgentExecutor.create(
        this.definition,
        this.config,
        onActivity,
      );

      const output = await executor.run(this.params, signal);

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
