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
import { debugLogger } from '../../utils/debugLogger.js';
import type { Config } from '../../config/config.js';
import { type AgentLoopContext } from '../../config/agent-loop-context.js';
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
  AgentTerminateMode,
  isToolActivityError,
} from '../types.js';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import { createBrowserAgentDefinition } from './browserAgentFactory.js';
import { removeInputBlocker } from './inputBlocker.js';
import { logBrowserAgentTaskOutcome } from '../../telemetry/loggers.js';
import {
  sanitizeThoughtContent,
  sanitizeToolArgs,
  sanitizeErrorMessage,
} from '../../utils/agent-sanitization-utils.js';
import { removeAutomationOverlay } from './automationOverlay.js';

const INPUT_PREVIEW_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 200;
const MAX_RECENT_ACTIVITY = 20;

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
  private readonly agentName: string;

  constructor(
    private readonly context: AgentLoopContext,
    params: AgentInputs,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    const resolvedName = _toolName ?? 'browser_agent';
    // Note: BrowserAgentDefinition is a factory function, so we use hardcoded names
    super(
      params,
      messageBus,
      resolvedName,
      _toolDisplayName ?? 'Browser Agent',
    );
    this.agentName = resolvedName;
  }

  private get config(): Config {
    return this.context.config;
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
    const invocationStartMs = Date.now();
    let browserManager;
    let recentActivity: SubagentActivityItem[] = [];
    let sessionMode: 'persistent' | 'isolated' | 'existing' = 'persistent';
    let visionEnabled = false;
    let taskSuccess = false;

    try {
      if (updateOutput) {
        // Send initial state
        const initialProgress: SubagentProgress = {
          isSubagentProgress: true,
          agentName: this.agentName,
          recentActivity: [],
          state: 'running',
        };
        updateOutput(initialProgress);
      }

      // Create definition with MCP tools
      // Note: printOutput is used for low-level connection logs before agent starts
      const printOutput = updateOutput
        ? (msg: string) => {
            const sanitizedMsg = sanitizeThoughtContent(msg);
            recentActivity.push({
              id: randomUUID(),
              type: 'thought',
              content: sanitizedMsg,
              status: 'completed',
            });
            if (recentActivity.length > MAX_RECENT_ACTIVITY) {
              recentActivity = recentActivity.slice(-MAX_RECENT_ACTIVITY);
            }
            updateOutput({
              isSubagentProgress: true,
              agentName: this.agentName,
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
      visionEnabled = result.visionEnabled;
      sessionMode = result.sessionMode;

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
            const args = JSON.stringify(
              sanitizeToolArgs(activity.data['args']),
            );
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
              status: 'running',
            });
            updated = true;
            break;
          }
          case 'TOOL_CALL_END': {
            const callId = activity.data['id']
              ? String(activity.data['id'])
              : undefined;
            const data = activity.data['data'];
            const isError = isToolActivityError(data);

            for (let i = recentActivity.length - 1; i >= 0; i--) {
              if (
                recentActivity[i].type === 'tool_call' &&
                callId != null &&
                recentActivity[i].id === callId &&
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
            const isCancellation = error === 'Request cancelled.';
            const callId = activity.data['callId']
              ? String(activity.data['callId'])
              : undefined;
            const newStatus = isCancellation ? 'cancelled' : 'error';

            if (callId) {
              // Mark the specific tool as error/cancelled
              for (let i = recentActivity.length - 1; i >= 0; i--) {
                if (
                  recentActivity[i].type === 'tool_call' &&
                  recentActivity[i].id === callId &&
                  recentActivity[i].status === 'running'
                ) {
                  recentActivity[i].status = newStatus;
                  updated = true;
                  break;
                }
              }
            } else {
              // No specific tool — mark ALL running tool_call items
              for (const item of recentActivity) {
                if (item.type === 'tool_call' && item.status === 'running') {
                  item.status = newStatus;
                  updated = true;
                }
              }
            }

            // Sanitize the error message before emitting
            const sanitizedError = sanitizeErrorMessage(error);
            recentActivity.push({
              id: randomUUID(),
              type: 'thought',
              content: isCancellation
                ? sanitizedError
                : `Error: ${sanitizedError}`,
              status: newStatus,
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
            agentName: this.agentName,
            recentActivity: [...recentActivity],
            state: 'running',
          };
          updateOutput(progress);
        }
      };

      // Create and run executor with the configured definition
      const executor = await LocalAgentExecutor.create(
        definition,
        this.context,
        onActivity,
      );

      const output = await executor.run(this.params, signal);

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const parsed = JSON.parse(output.result);

        taskSuccess = parsed?.success === true;
      } catch (parseError) {
        // non-JSON result -> treat as unknown, default false
        debugLogger.log(
          'Failed to parse browser agent output as JSON:',
          parseError,
        );
      }

      const resultContent = `Browser agent finished.
Termination Reason: ${output.terminate_reason}
Result:
${output.result}`;

      // Map terminate_reason to the correct SubagentProgress state.
      // GOAL = agent completed its task normally.
      // ABORTED = user cancelled.
      // Others (ERROR, MAX_TURNS, ERROR_NO_COMPLETE_TASK_CALL) = error.
      let progressState: SubagentProgress['state'];
      if (output.terminate_reason === AgentTerminateMode.ABORTED) {
        progressState = 'cancelled';
      } else if (output.terminate_reason === AgentTerminateMode.GOAL) {
        progressState = 'completed';
      } else {
        progressState = 'error';
      }

      const progress: SubagentProgress = {
        isSubagentProgress: true,
        agentName: this.agentName,
        recentActivity: [...recentActivity],
        state: progressState,
        result: output.result,
        terminateReason: output.terminate_reason,
      };

      if (updateOutput) {
        updateOutput(progress);
      }

      return {
        llmContent: [{ text: resultContent }],
        returnDisplay: progress,
      };
    } catch (error) {
      const rawErrorMessage =
        error instanceof Error ? error.message : String(error);
      const isAbort =
        (error instanceof Error && error.name === 'AbortError') ||
        rawErrorMessage.includes('Aborted');
      const errorMessage = sanitizeErrorMessage(rawErrorMessage);

      // Mark any running items as error/cancelled
      for (const item of recentActivity) {
        if (item.status === 'running') {
          item.status = isAbort ? 'cancelled' : 'error';
        }
      }

      const progress: SubagentProgress = {
        isSubagentProgress: true,
        agentName: this.agentName,
        recentActivity: [...recentActivity],
        state: isAbort ? 'cancelled' : 'error',
      };

      if (updateOutput) {
        updateOutput(progress);
      }

      const llmContent = isAbort
        ? 'Browser agent execution was aborted.'
        : `Browser agent failed. Error: ${errorMessage}`;

      return {
        llmContent: [{ text: llmContent }],
        returnDisplay: progress,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    } finally {
      logBrowserAgentTaskOutcome(this.config, {
        success: taskSuccess,
        session_mode: sessionMode,
        vision_enabled: visionEnabled,
        headless: !!this.config.getBrowserAgentConfig().customConfig.headless,
        duration_ms: Date.now() - invocationStartMs,
      });

      // Clean up input blocker, but keep browserManager alive for persistent sessions
      if (browserManager) {
        await removeInputBlocker(browserManager, signal);
        await removeAutomationOverlay(browserManager, signal);

        // try cleaning up overlays in previous opened pages if any
        try {
          const listResult = await browserManager.callTool(
            'list_pages',
            {},
            signal,
            true,
          );
          const pagesText =
            listResult.content?.find((c) => c.type === 'text')?.text || '';
          const pageMatches = Array.from(pagesText.matchAll(/^(\d+):/gm));
          const pageIds = pageMatches.map((m) => parseInt(m[1], 10));
          if (pageIds.length > 1) {
            for (const pageId of pageIds) {
              try {
                await browserManager.callTool(
                  'select_page',
                  { pageId, bringToFront: false },
                  signal,
                  true,
                );
                await removeInputBlocker(browserManager, signal);
                await removeAutomationOverlay(browserManager, signal);
              } catch {
                // Ignore errors for individual pages
              }
            }
          }
        } catch {
          // Ignore errors for removing the overlays.
        } finally {
          browserManager.release();
        }
      }
    }
  }
}
