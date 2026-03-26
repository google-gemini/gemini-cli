/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseToolInvocation,
  type ToolConfirmationOutcome,
  type ToolResult,
  type ToolCallConfirmationDetails,
  type ToolLiveOutput,
} from '../tools/tools.js';
import {
  DEFAULT_QUERY_STRING,
  type RemoteAgentInputs,
  type RemoteAgentDefinition,
  type AgentInputs,
  type SubagentProgress,
} from './types.js';
import { type AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { A2AAgentError } from './a2a-errors.js';
import { RemoteSubagentSession } from './remote-subagent-protocol.js';
import type { AgentEvent } from '../agent/types.js';

/**
 * A tool invocation that proxies to a remote A2A agent.
 *
 * This implementation delegates execution to {@link RemoteSubagentSession},
 * which wraps the A2A client streaming behind the AgentProtocol interface.
 */
export class RemoteAgentInvocation extends BaseToolInvocation<
  RemoteAgentInputs,
  ToolResult
> {
  constructor(
    private readonly definition: RemoteAgentDefinition,
    private readonly context: AgentLoopContext,
    params: AgentInputs,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
    private readonly _onAgentEvent?: (event: AgentEvent) => void,
  ) {
    const query = params['query'] ?? DEFAULT_QUERY_STRING;
    if (typeof query !== 'string') {
      throw new Error(
        `Remote agent '${definition.name}' requires a string 'query' input.`,
      );
    }
    // Safe to pass strict object to super
    super(
      { query },
      messageBus,
      _toolName ?? definition.name,
      _toolDisplayName ?? definition.displayName,
    );

    // Validate that A2AClientManager is available at construction time
    if (!this.context.config.getA2AClientManager()) {
      throw new Error(
        `Failed to initialize RemoteAgentInvocation for '${definition.name}': A2AClientManager is not available.`,
      );
    }
  }

  getDescription(): string {
    return `Calling remote agent ${this.definition.displayName ?? this.definition.name}`;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // For now, always require confirmation for remote agents until we have a policy system for them.
    return {
      type: 'info',
      title: `Call Remote Agent: ${this.definition.displayName ?? this.definition.name}`,
      prompt: `Calling remote agent: "${this.params.query}"`,
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {
        // Policy updates are now handled centrally by the scheduler
      },
    };
  }

  async execute(
    _signal: AbortSignal,
    updateOutput?: (output: ToolLiveOutput) => void,
  ): Promise<ToolResult> {
    const agentName = this.definition.displayName ?? this.definition.name;
    const session = new RemoteSubagentSession(
      this.definition,
      this.context,
      this.messageBus,
    );

    // Wire external abort signal to session abort
    const abortListener = () => void session.abort();
    _signal.addEventListener('abort', abortListener, { once: true });

    // Subscribe for parent session observability (future use)
    let unsubscribeParent: (() => void) | undefined;
    if (this._onAgentEvent) {
      unsubscribeParent = session.subscribe(this._onAgentEvent);
    }

    // Subscribe to message events for live SubagentProgress updates
    const unsubscribeProgress = session.subscribe((event: AgentEvent) => {
      if (event.type === 'message' && updateOutput) {
        const currentProgress = session.getLatestProgress();
        if (currentProgress) updateOutput(currentProgress);
      }
    });

    try {
      if (updateOutput) {
        updateOutput({
          isSubagentProgress: true,
          agentName,
          state: 'running',
          recentActivity: [
            {
              id: 'pending',
              type: 'thought',
              content: 'Working...',
              status: 'running',
            },
          ],
        });
      }

      await session.send({
        message: [{ type: 'text', text: this.params.query }],
      });

      const result = await session.getResult();

      // Emit final completed progress
      if (updateOutput) {
        const finalProgress = session.getLatestProgress();
        if (finalProgress) updateOutput(finalProgress);
      }

      return result;
    } catch (error: unknown) {
      const partialProgress = session.getLatestProgress();
      const partialOutput =
        typeof partialProgress?.result === 'string'
          ? partialProgress.result
          : '';
      const errorMessage = this.formatExecutionError(error);
      const fullDisplay = partialOutput
        ? `${partialOutput}\n\n${errorMessage}`
        : errorMessage;

      const errorProgress: SubagentProgress = {
        isSubagentProgress: true,
        agentName,
        state: 'error',
        result: fullDisplay,
        recentActivity: partialProgress?.recentActivity ?? [],
      };

      if (updateOutput) {
        updateOutput(errorProgress);
      }

      return {
        llmContent: [{ text: fullDisplay }],
        returnDisplay: errorProgress,
      };
    } finally {
      _signal.removeEventListener('abort', abortListener);
      unsubscribeProgress();
      unsubscribeParent?.();
    }
  }

  /**
   * Formats an execution error into a user-friendly message.
   * Recognizes typed A2AAgentError subclasses and falls back to
   * a generic message for unknown errors.
   */
  private formatExecutionError(error: unknown): string {
    // All A2A-specific errors include a human-friendly `userMessage` on the
    // A2AAgentError base class. Rely on that to avoid duplicating messages
    // for specific subclasses, which improves maintainability.
    if (error instanceof A2AAgentError) {
      return error.userMessage;
    }

    return `Error calling remote agent: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}
