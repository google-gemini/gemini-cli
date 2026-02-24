/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Browser agent invocation that handles async tool setup.
 *
 * Unlike regular LocalSubagentInvocation, this invocation:
 * 1. Uses browserAgentFactory to create definition with MCP tools
 * 2. Cleans up browser resources after execution
 *
 * The MCP tools are only available in the browser agent's isolated registry.
 */

import type { Config } from '../../config/config.js';
import { LocalAgentExecutor } from '../local-executor.js';
import type { AnsiOutput } from '../../utils/terminalSerializer.js';
import { BaseToolInvocation, type ToolResult } from '../../tools/tools.js';
import { ToolErrorType } from '../../tools/tool-error.js';
import {
  AgentTerminateMode,
  type AgentInputs,
  type SubagentActivityEvent,
} from '../types.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import {
  createBrowserAgentDefinition,
  cleanupBrowserAgent,
} from './browserAgentFactory.js';
import { BrowserSessionLogger } from './browserSessionLogger.js';

const INPUT_PREVIEW_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 200;
const ARG_PREVIEW_MAX_LENGTH = 30;

const TASK_COMPLETE_TOOL_NAME = 'complete_task';

/**
 * Produces a compact, human-readable summary of tool arguments
 * tailored to common browser agent tools.
 */
export function formatToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const truncate = (v: unknown): string => {
    const s = String(v ?? '');
    return s.length > ARG_PREVIEW_MAX_LENGTH
      ? s.slice(0, ARG_PREVIEW_MAX_LENGTH) + '…'
      : s;
  };

  switch (toolName) {
    case 'click':
    case 'hover':
      return args['uid'] != null ? `uid=${String(args['uid'])}` : '';
    case 'navigate_page':
    case 'new_page':
      return args['url'] != null ? `url=${truncate(args['url'])}` : '';
    case 'fill':
      return [
        args['uid'] != null ? `uid=${String(args['uid'])}` : '',
        args['value'] != null ? `value=${truncate(args['value'])}` : '',
      ]
        .filter(Boolean)
        .join(', ');
    case 'type_text':
      return args['text'] != null ? `"${truncate(args['text'])}"` : '';
    case 'analyze_screenshot':
      return args['instruction'] != null
        ? `"${truncate(args['instruction'])}"`
        : '';
    case 'press_key':
      return args['key'] != null ? `key=${String(args['key'])}` : '';
    default: {
      const entries = Object.entries(args).slice(0, 2);
      return entries.map(([k, v]) => `${k}=${truncate(v)}`).join(', ');
    }
  }
}

/**
 * Formats a SubagentActivityEvent into a user-facing status string,
 * or returns undefined if the event should not be displayed.
 */
function formatActivityMessage(
  activity: SubagentActivityEvent,
): string | undefined {
  switch (activity.type) {
    case 'THOUGHT_CHUNK': {
      const text = activity.data['text'];
      return typeof text === 'string' ? `🌐💭 ${text}` : undefined;
    }
    case 'TOOL_CALL_START': {
      const name = String(activity.data['name'] ?? '');
      if (name === TASK_COMPLETE_TOOL_NAME) return undefined;
      const rawArgs = activity.data['args'];
      const args: Record<string, unknown> =
        typeof rawArgs === 'object' &&
        rawArgs !== null &&
        !Array.isArray(rawArgs)
          ? Object.fromEntries(Object.entries(rawArgs))
          : {};
      const summary = formatToolArgs(name, args);
      return summary
        ? `🌐🔧 Executing ${name}(${summary})\n`
        : `🌐🔧 Executing ${name}\n`;
    }
    case 'TOOL_CALL_END': {
      const name = String(activity.data['name'] ?? '');
      if (name === TASK_COMPLETE_TOOL_NAME) return undefined;
      const output = String(activity.data['output'] ?? '');
      const failed =
        output.toLowerCase().startsWith('error') ||
        output.toLowerCase().includes('failed');
      return failed ? `🌐❌ ${name} failed\n` : `🌐✅ ${name} completed\n`;
    }
    case 'ERROR': {
      const error = String(activity.data['error'] ?? 'Unknown error');
      return `🌐⚠️ Error: ${error}\n`;
    }
    default:
      return undefined;
  }
}

/**
 * Browser agent invocation with async tool setup.
 *
 * This invocation handles the browser agent's special requirements:
 * - MCP connection and tool wrapping at invocation time
 * - Browser cleanup after execution
 */
export class BrowserAgentInvocation extends BaseToolInvocation<
  AgentInputs,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: AgentInputs,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    // Note: BrowserAgentDefinition is a factory function, so we use hardcoded names
    super(
      params,
      messageBus,
      _toolName ?? 'browser_agent',
      _toolDisplayName ?? 'Browser Agent',
    );
  }

  /**
   * Returns a concise, human-readable description of the invocation.
   */
  getDescription(): string {
    const inputSummary = Object.entries(this.params)
      .map(
        ([key, value]) =>
          `${key}: ${String(value).slice(0, INPUT_PREVIEW_MAX_LENGTH)}`,
      )
      .join(', ');

    const description = `Running browser agent with inputs: { ${inputSummary} }`;
    return description.slice(0, DESCRIPTION_MAX_LENGTH);
  }

  /**
   * Executes the browser agent.
   *
   * This method:
   * 1. Creates browser manager and MCP connection
   * 2. Wraps MCP tools for the isolated registry
   * 3. Runs the agent via LocalAgentExecutor
   * 4. Cleans up browser resources
   */
  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
  ): Promise<ToolResult> {
    let browserManager;
    const sessionLogger = new BrowserSessionLogger(
      this.config.storage.getProjectTempLogsDir(),
      this.config.getSessionId(),
    );

    try {
      sessionLogger.logEvent('session_start', {
        params: this.params,
      });

      if (updateOutput) {
        updateOutput('🌐 Starting browser agent...\n');
      }

      // Create definition with MCP tools
      const printOutput = updateOutput
        ? (msg: string) => updateOutput(`🌐 ${msg}\n`)
        : undefined;

      const result = await createBrowserAgentDefinition(
        this.config,
        this.messageBus,
        printOutput,
        sessionLogger,
      );
      const { definition } = result;
      browserManager = result.browserManager;

      if (updateOutput) {
        updateOutput(
          `🌐 Browser connected. Tools: ${definition.toolConfig?.tools.length ?? 0}\n`,
        );
      }

      const onActivity = (activity: SubagentActivityEvent): void => {
        sessionLogger.logEvent(`activity_${activity.type.toLowerCase()}`, {
          ...activity.data,
          agentName: activity.agentName,
        });

        if (!updateOutput) return;
        const message = formatActivityMessage(activity);
        if (message) {
          updateOutput(message);
        }
      };

      // Create and run executor with the configured definition
      const executor = await LocalAgentExecutor.create(
        definition,
        this.config,
        onActivity,
      );

      const output = await executor.run(this.params, signal);

      if (updateOutput) {
        const isSuccess = output.terminate_reason === AgentTerminateMode.GOAL;
        const prefix = isSuccess ? '🌐✅' : '🌐⚠️';
        updateOutput(`${prefix} Task ended (${output.terminate_reason})\n`);
      }

      sessionLogger.logEvent('session_end', {
        terminateReason: output.terminate_reason,
        result: output.result,
      });

      const resultContent = `Browser agent finished.
Termination Reason: ${output.terminate_reason}
Result:
${output.result}`;

      const displayContent = `
Browser Agent Finished

Termination Reason: ${output.terminate_reason}

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

      sessionLogger.logEvent('session_error', { error: errorMessage });

      return {
        llmContent: `Browser agent failed. Error: ${errorMessage}`,
        returnDisplay: `Browser Agent Failed\nError: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    } finally {
      if (browserManager) {
        await cleanupBrowserAgent(browserManager, sessionLogger);
      }
      sessionLogger.close();
    }
  }
}
