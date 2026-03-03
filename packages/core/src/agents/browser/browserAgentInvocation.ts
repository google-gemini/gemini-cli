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
import {
  BaseToolInvocation,
  type ToolResult,
  type ToolLiveOutput,
} from '../../tools/tools.js';
import { ToolErrorType } from '../../tools/tool-error.js';
import type { AgentInputs, SubagentActivityEvent } from '../types.js';
import { AgentTerminateMode } from '../types.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { randomUUID } from 'node:crypto';
import { BackgroundAgentService } from '../../services/backgroundAgentService.js';
import {
  createBrowserAgentDefinition,
  cleanupBrowserAgent,
} from './browserAgentFactory.js';

const INPUT_PREVIEW_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 200;

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
      .map(([key, value]) => {
        if (key === 'is_background') return '';
        return `${key}: ${String(value).slice(0, INPUT_PREVIEW_MAX_LENGTH)}`;
      })
      .filter(Boolean)
      .join(', ');

    const description = `Running browser agent with inputs: { ${inputSummary} }${this.params['is_background'] ? ' [background]' : ''}`;
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
    if (this.params['is_background']) {
      const backgroundAgentId = randomUUID();
      const backgroundAgentService = BackgroundAgentService.getInstance();

      const backgroundRun = async () => {
        let browserManager;
        try {
          const result = await createBrowserAgentDefinition(
            this.config,
            this.messageBus,
          );
          const { definition } = result;
          browserManager = result.browserManager;

          const onActivity = (activity: SubagentActivityEvent): void => {
            if (
              activity.type === 'THOUGHT_CHUNK' &&
              typeof activity.data['text'] === 'string'
            ) {
              backgroundAgentService.updateAgentProgress(backgroundAgentId, {
                isSubagentProgress: true,
                agentName: 'browser_agent',
                recentActivity: [
                  {
                    id: randomUUID(),
                    type: 'thought',
                    content: activity.data['text'],
                    status: 'running',
                  },
                ],
                state: 'running',
              });
            }
          };

          const executor = await LocalAgentExecutor.create(
            definition,
            this.config,
            onActivity,
          );

          const output = await executor.run(this.params, signal);
          backgroundAgentService.updateAgentProgress(backgroundAgentId, {
            isSubagentProgress: true,
            agentName: 'browser_agent',
            recentActivity: [],
            state:
              output.terminate_reason === AgentTerminateMode.GOAL
                ? 'completed'
                : output.terminate_reason === AgentTerminateMode.ABORTED
                  ? 'cancelled'
                  : 'error',
          });
        } catch (_error) {
          backgroundAgentService.updateAgentProgress(backgroundAgentId, {
            isSubagentProgress: true,
            agentName: 'browser_agent',
            recentActivity: [],
            state: 'error',
          });
        } finally {
          if (browserManager) {
            await cleanupBrowserAgent(browserManager);
          }
        }
      };

      backgroundAgentService.registerAgent({
        id: backgroundAgentId,
        name: 'browser_agent',
        displayName: 'Browser Agent',
        command: this.getDescription(),
        output: {
          isSubagentProgress: true,
          agentName: 'browser_agent',
          recentActivity: [],
          state: 'running',
        },
      });

      void backgroundRun();

      const msg = `Browser agent started in background (ID: ${backgroundAgentId.slice(0, 8)}).`;
      return {
        llmContent: [{ text: msg }],
        returnDisplay: msg,
        backgrounded: true,
        data: {
          agentId: backgroundAgentId,
          agentName: 'browser_agent',
        },
      };
    }

    let browserManager;

    try {
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
      );
      const { definition } = result;
      browserManager = result.browserManager;

      if (updateOutput) {
        updateOutput(
          `🌐 Browser connected. Tools: ${definition.toolConfig?.tools.length ?? 0}\n`,
        );
      }

      // Create activity callback for streaming output
      const onActivity = (activity: SubagentActivityEvent): void => {
        if (!updateOutput) return;

        if (
          activity.type === 'THOUGHT_CHUNK' &&
          typeof activity.data['text'] === 'string'
        ) {
          updateOutput(`🌐💭 ${activity.data['text']}`);
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

      return {
        llmContent: [{ text: resultContent }],
        returnDisplay: displayContent,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        llmContent: `Browser agent failed. Error: ${errorMessage}`,
        returnDisplay: `Browser Agent Failed\nError: ${errorMessage}`,
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
