/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import { BaseToolInvocation, type ToolResult } from '../tools/tools.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { LocalAgentDefinition, AgentInputs } from './types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import { AgentFactory } from './agent-factory.js';
import { type Turn, GeminiEventType } from '../core/turn.js';
import { promptIdContext } from '../utils/promptIdContext.js';

const INPUT_PREVIEW_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 200;

/**
 * A specialized invocation for running subagents within the AgentHarness.
 * COMPLETELY FORKED from LocalSubagentInvocation to ensure isolated logic.
 */
export class HarnessSubagentInvocation extends BaseToolInvocation<
  AgentInputs,
  ToolResult
> {
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

  getDescription(): string {
    const inputSummary = Object.entries(this.params)
      .map(
        ([key, value]) =>
          `${key}: ${String(value).slice(0, INPUT_PREVIEW_MAX_LENGTH)}`,
      )
      .join(', ');

    return `Running harness subagent '${this.definition.name}' with inputs: { ${inputSummary} }`.slice(
      0,
      DESCRIPTION_MAX_LENGTH,
    );
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
  ): Promise<ToolResult> {
    try {
      if (updateOutput) {
        updateOutput(`Subagent ${this.definition.name} starting (Harness Mode)...
`);
      }

      const harness = AgentFactory.createHarness(this.config, this.definition, {
        inputs: this.params,
        parentPromptId: promptIdContext.getStore(),
      });

      const initialRequest = [{ text: 'Start' }];
      const stream = harness.run(
        initialRequest,
        signal,
        this.definition.runConfig?.maxTurns,
      );

      let turn: Turn | undefined;
      let lastThought = '';

      while (true) {
        const { value, done } = await stream.next();
        if (done) {
          turn = value;
          break;
        }

        const event = value;
        if (updateOutput) {
          if (event.type === GeminiEventType.Thought && 'value' in event) {
            lastThought = event.value.subject;
            updateOutput(`🤖💭 ${lastThought}\n`);

            // Also publish to message bus so UI hooks can see it regardless of where they listen
            void this.messageBus.publish({
              type: MessageBusType.SUBAGENT_ACTIVITY,
              activity: {
                agentName: this.definition.name,
                type: 'THOUGHT',
                data: { subject: lastThought },
              },
            });
          } else if (
            event.type === GeminiEventType.SubagentActivity &&
            'value' in event
          ) {
            if (event.value.type === 'TOOL_CALL_START') {
              const toolName = String(event.value.data['name'] || 'a tool');
              updateOutput(`🛠️ Calling ${toolName}...\n`);
            }

            // Forward the core activity to the global bus
            void this.messageBus.publish({
              type: MessageBusType.SUBAGENT_ACTIVITY,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
              activity: event.value as any,
            });
          }
        }
      }

      if (!turn) {
        throw new Error('Agent failed to return a valid turn.');
      }

      // 1. Initialize result with the explicit submitted output if available
      let finalResultRaw: unknown = turn.submittedOutput;

      // 2. Fallback: If no explicit output, try textual response
      if (finalResultRaw === undefined) {
        const output = turn.getResponseText();
        debugLogger.debug(
          `[AgentHarness] [Invocation:${this.definition.name}] Initial response text: "${output}"`,
        );
        if (output.trim()) {
          finalResultRaw = output;
        }
      }

      const outputName = this.definition.outputConfig?.outputName || 'result';

      // 3. Fallback: If still no result, extract from 'complete_task' tool call arguments (Directly from the turn)
      if (finalResultRaw === undefined) {
        const completeCall = turn.pendingToolCalls?.find(
          (c) => c.name === 'complete_task',
        );

        if (completeCall) {
          debugLogger.debug(
            `[AgentHarness] [Invocation:${this.definition.name}] Found 'complete_task' call in pending tool calls.`,
          );
          finalResultRaw =
            completeCall.args[outputName] || completeCall.args['result'];

          if (finalResultRaw !== undefined) {
            debugLogger.debug(
              `[AgentHarness] [Invocation:${this.definition.name}] Extracted raw result from complete_task args (${outputName}).`,
            );
          }
        }
      }

      // 4. Fallback: If no result yet, look for any definitive findings in the history
      if (finalResultRaw === undefined) {
        debugLogger.debug(
          `[AgentHarness] [Invocation:${this.definition.name}] No direct result found, checking history...`,
        );
        const history = turn.chat.getHistory();

        // Find the last model message that has either non-thought text or a complete_task call
        const lastMsgWithResult = history.findLast(
          (m) =>
            m.role === 'model' &&
            m.parts &&
            (m.parts.some(
              (p) =>
                !('thought' in p && p.thought) && 'text' in p && p.text?.trim(),
            ) ||
              m.parts.some(
                (p) =>
                  'functionCall' in p &&
                  p.functionCall &&
                  p.functionCall.name === 'complete_task',
              )),
        );

        if (lastMsgWithResult?.parts) {
          // Check for text part first (likely injected by Harness)
          const textPart = lastMsgWithResult.parts.find(
            (p) =>
              !('thought' in p && p.thought) && 'text' in p && p.text?.trim(),
          );
          if (textPart && 'text' in textPart && textPart.text) {
            finalResultRaw = textPart.text;
            debugLogger.debug(
              `[AgentHarness] [Invocation:${this.definition.name}] Extracted result from history text part.`,
            );
          } else {
            // Check for complete_task call in history (what the tests use)
            const callPart = lastMsgWithResult.parts.find(
              (p) =>
                'functionCall' in p && p.functionCall?.name === 'complete_task',
            );
            if (
              callPart &&
              'functionCall' in callPart &&
              callPart.functionCall
            ) {
              finalResultRaw =
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                (callPart.functionCall.args as Record<string, unknown>)?.[
                  outputName
                ] ||
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                (callPart.functionCall.args as Record<string, unknown>)?.[
                  'result'
                ];
              if (finalResultRaw !== undefined) {
                debugLogger.debug(
                  `[AgentHarness] [Invocation:${this.definition.name}] Extracted result from history function call.`,
                );
              }
            }
          }
        }
      }

      const finalResultString =
        typeof finalResultRaw === 'object'
          ? JSON.stringify(finalResultRaw, null, 2)
          : String(finalResultRaw ?? 'Task completed.');

      const displayContent = `
Subagent ${this.definition.name} Finished (Harness Mode)

Result:
${finalResultString}
`;

      if (updateOutput) {
        updateOutput(displayContent);
      }

      // Parse as JSON if it's a string that looks like an object, to satisfy schema requirements
      let finalResultData = finalResultRaw ?? 'Task completed.';
      if (
        typeof finalResultData === 'string' &&
        finalResultData.trim().startsWith('{')
      ) {
        try {
          finalResultData = JSON.parse(finalResultData);
          debugLogger.debug(
            `[AgentHarness] [Invocation:${this.definition.name}] Parsed string result into JSON object.`,
          );
        } catch (_e) {
          // Not valid JSON, keep as string
        }
      }

      debugLogger.debug(
        `[AgentHarness] [Invocation:${this.definition.name}] Returning data to parent: ${JSON.stringify(
          finalResultData,
        ).slice(0, 500)}...`,
      );

      const resultContent = `Subagent '${this.definition.name}' finished.
Termination Reason: goal
Result:
${finalResultString}`;

      return {
        llmContent: [{ text: resultContent }],
        returnDisplay: displayContent,
        data: {
          [outputName]: finalResultData,
          result: finalResultData,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: [],
        returnDisplay: `Subagent Failed: ${this.definition.name}
Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}
