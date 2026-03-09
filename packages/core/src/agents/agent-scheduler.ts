/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { Scheduler } from '../scheduler/scheduler.js';
import type {
  ToolCallRequestInfo,
  CompletedToolCall,
} from '../scheduler/types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { EditorType } from '../utils/editor.js';
import { PolicyDecision } from '../policy/types.js';

/**
 * Options for scheduling agent tools.
 */
export interface AgentSchedulingOptions {
  /** The unique ID for this agent's scheduler. */
  schedulerId: string;
  /** The ID of the tool call that invoked this agent. */
  parentCallId?: string;
  /** The tool registry specific to this agent. */
  toolRegistry: ToolRegistry;
  /** AbortSignal for cancellation. */
  signal: AbortSignal;
  /** Optional function to get the preferred editor for tool modifications. */
  getPreferredEditor?: () => EditorType | undefined;
  /** Optional function to be notified when the scheduler is waiting for user confirmation. */
  onWaitingForConfirmation?: (waiting: boolean) => void;
  /** Optional list of tools to automatically approve for this agent. */
  allowedTools?: string[];
}

/**
 * Schedules a batch of tool calls for an agent using the new event-driven Scheduler.
 *
 * @param config The global runtime configuration.
 * @param requests The list of tool call requests from the agent.
 * @param options Scheduling options including registry and IDs.
 * @returns A promise that resolves to the completed tool calls.
 */
export async function scheduleAgentTools(
  config: Config,
  requests: ToolCallRequestInfo[],
  options: AgentSchedulingOptions,
): Promise<CompletedToolCall[]> {
  const {
    schedulerId,
    parentCallId,
    toolRegistry,
    signal,
    getPreferredEditor,
    onWaitingForConfirmation,
    allowedTools,
  } = options;

  // Create a proxy/override of the config to provide the agent-specific tool registry.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const agentConfig: Config = Object.create(config);
  agentConfig.getToolRegistry = () => toolRegistry;
  agentConfig.getMessageBus = () => toolRegistry.getMessageBus();

  if (allowedTools && allowedTools.length > 0) {
    const existingAllowed = config.getAllowedTools() || [];
    const mergedAllowed = Array.from(
      new Set([...existingAllowed, ...allowedTools]),
    );
    agentConfig.getAllowedTools = () => mergedAllowed;

    const originalPolicyEngine = config.getPolicyEngine();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const proxyPolicyEngine = Object.create(originalPolicyEngine);
    proxyPolicyEngine.check = async (
      toolCall: { name: string; args?: Record<string, unknown> },
      serverName?: string,
      toolAnnotations?: Record<string, unknown>,
    ) => {
      if (allowedTools.includes(toolCall.name)) {
        return {
          decision: PolicyDecision.ALLOW,
          rule: {
            toolName: toolCall.name,
            decision: PolicyDecision.ALLOW,
            priority: 999,
            source: 'Agent Allowed Tools',
          },
        };
      }
      return originalPolicyEngine.check(toolCall, serverName, toolAnnotations);
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    agentConfig.getPolicyEngine = () => proxyPolicyEngine;
  }

  const scheduler = new Scheduler({
    config: agentConfig,
    messageBus: toolRegistry.getMessageBus(),
    getPreferredEditor: getPreferredEditor ?? (() => undefined),
    schedulerId,
    parentCallId,
    onWaitingForConfirmation,
  });

  return scheduler.schedule(requests, signal);
}
