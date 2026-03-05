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

import { randomUUID } from 'node:crypto';
import type { Config } from '../../config/config.js';
import { LocalAgentExecutor } from '../local-executor.js';
import {
  BaseToolInvocation,
  type ToolResult,
  type ToolLiveOutput,
} from '../../tools/tools.js';
import { ToolErrorType } from '../../tools/tool-error.js';
import {
  type AgentInputs,
  type SubagentActivityEvent,
  type SubagentProgress,
  type SubagentActivityItem,
} from '../types.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import {
  createBrowserAgentDefinition,
  cleanupBrowserAgent,
} from './browserAgentFactory.js';

const INPUT_PREVIEW_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 200;
const MAX_RECENT_ACTIVITY = 20;

/**
 * Sanitizes tool arguments by redacting sensitive fields.
 */
function sanitizeToolArgs(args: unknown): unknown {
  if (typeof args !== 'object' || args === null) {
    return args;
  }

  if (Array.isArray(args)) {
    return args.map(sanitizeToolArgs);
  }

  const sensitiveKeys = [
    'password',
    'apikey',
    'token',
    'secret',
    'credential',
    'auth',
    'passphrase',
    'privatekey',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    const isSensitive = sensitiveKeys.some((sensitiveKey) =>
      key.toLowerCase().includes(sensitiveKey.toLowerCase()),
    );
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeToolArgs(value);
    }
  }

  return sanitized;
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
    updateOutput?: (output: ToolLiveOutput) => void,
  ): Promise<ToolResult> {
    let browserManager;
    let recentActivity: SubagentActivityItem[] = [];

    try {
      if (updateOutput) {
        // Send initial state
        const initialProgress: SubagentProgress = {
          isSubagentProgress: true,
          agentName: this['_toolName'] ?? 'browser_agent',
          recentActivity: [],
          state: 'running',
        };
        updateOutput(initialProgress);
      }

      // Create definition with MCP tools
      // Note: printOutput is used for low-level connection logs before agent starts
      const printOutput = updateOutput
        ? (msg: string) => {
            recentActivity.push({
              id: randomUUID(),
              type: 'thought',
              content: msg,
              status: 'completed',
            });
            if (recentActivity.length > MAX_RECENT_ACTIVITY) {
              recentActivity = recentActivity.slice(-MAX_RECENT_ACTIVITY);
            }
            updateOutput({
              isSubagentProgress: true,
              agentName: this['_toolName'] ?? 'browser_agent',
              recentActivity: [...recentActivity],
              state: 'running',
            } as SubagentProgress);
          }
        : undefined;

      const result = await createBrowserAgentDefinition(
        this.config,
        this.messageBus,
        printOutput,
      );
      const { definition } = result;
      browserManager = result.browserManager;

      // Create activity callback for streaming output
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
              lastItem.content += text;
            } else {
              recentActivity.push({
                id: randomUUID(),
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
            const displayName = activity.data['displayName']
              ? String(activity.data['displayName'])
              : undefined;
            const description = activity.data['description']
              ? String(activity.data['description'])
              : undefined;
            const args = JSON.stringify(
              sanitizeToolArgs(activity.data['args']),
            );
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
            const isCancellation = error === 'Request cancelled.';
            const toolName = activity.data['name']
              ? String(activity.data['name'])
              : undefined;

            if (toolName) {
              for (let i = recentActivity.length - 1; i >= 0; i--) {
                if (
                  recentActivity[i].type === 'tool_call' &&
                  recentActivity[i].content === toolName &&
                  recentActivity[i].status === 'running'
                ) {
                  recentActivity[i].status = isCancellation
                    ? 'cancelled'
                    : 'error';
                  updated = true;
                  break;
                }
              }
            }

            recentActivity.push({
              id: randomUUID(),
              type: 'thought',
              content: isCancellation ? error : `Error: ${error}`,
              status: isCancellation ? 'cancelled' : 'error',
            });
            updated = true;
            break;
          }
          default:
            break;
        }

        if (updated) {
          if (recentActivity.length > MAX_RECENT_ACTIVITY) {
            recentActivity = recentActivity.slice(-MAX_RECENT_ACTIVITY);
          }

          const progress: SubagentProgress = {
            isSubagentProgress: true,
            agentName: this['_toolName'] ?? 'browser_agent',
            recentActivity: [...recentActivity],
            state: 'running',
          };
          updateOutput(progress);
        }
      };

      // Create and run executor with the configured definition
      const executor = await LocalAgentExecutor.create(
        definition,
        this.config,
        onActivity,
      );

      const output = await executor.run(this.params, signal);

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

      if (updateOutput) {
        updateOutput({
          isSubagentProgress: true,
          agentName: this['_toolName'] ?? 'browser_agent',
          recentActivity: [...recentActivity],
          state: 'completed',
        } as SubagentProgress);
      }

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
          item.status = isAbort ? 'cancelled' : 'error';
        }
      }

      const progress: SubagentProgress = {
        isSubagentProgress: true,
        agentName: this['_toolName'] ?? 'browser_agent',
        recentActivity: [...recentActivity],
        state: isAbort ? 'cancelled' : 'error',
      };

      if (updateOutput) {
        updateOutput(progress);
      }

      return {
        llmContent: `Browser agent failed. Error: ${errorMessage}`,
        returnDisplay: progress,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    } finally {
      // Always cleanup browser resources
      if (browserManager) {
        await cleanupBrowserAgent(browserManager);
      }
    }
  }
}
