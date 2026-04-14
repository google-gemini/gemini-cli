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
  type ExecuteOptions,
} from '../tools/tools.js';
import {
  DEFAULT_QUERY_STRING,
  type RemoteAgentInputs,
  type RemoteAgentDefinition,
  type AgentInputs,
  type SubagentProgress,
  getRemoteAgentTargetUrl,
} from './types.js';
import { type AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { A2AAgentError } from './a2a-errors.js';
import { RemoteSubagentSession } from './remote-subagent-protocol.js';
import type { AgentEvent } from '../agent/types.js';

/** Optional configuration for remote agent invocations. */
export interface SubagentInvocationOptions {
  toolName?: string;
  toolDisplayName?: string;
  onAgentEvent?: (event: AgentEvent) => void;
}

/**
 * Session-based remote agent invocation.
 *
 * This implementation delegates execution to {@link RemoteSubagentSession},
 * which wraps the A2A client streaming behind the AgentProtocol interface.
 *
 * Cross-invocation A2A session state (contextId/taskId) is persisted via a
 * static map keyed by a composite of agent name and target URL. This ensures
 * agents with the same name but different endpoints maintain independent state.
 */
export class RemoteSessionInvocation extends BaseToolInvocation<
  RemoteAgentInputs,
  ToolResult
> {
  // Persist A2A conversation state across ephemeral invocation instances.
  // Keyed by composite of name + target URL so agents with the same name
  // but different endpoints don't share state.
  private static readonly sessionState = new Map<
    string,
    { contextId?: string; taskId?: string }
  >();

  /**
   * Builds a composite key for the sessionState map.
   * Format: `name::targetUrl` (or just `name` if no URL can be derived).
   */
  private static sessionKey(definition: RemoteAgentDefinition): string {
    const url = getRemoteAgentTargetUrl(definition);
    return url ? `${definition.name}::${url}` : definition.name;
  }

  private readonly _onAgentEvent?: (event: AgentEvent) => void;

  constructor(
    private readonly definition: RemoteAgentDefinition,
    private readonly context: AgentLoopContext,
    params: AgentInputs,
    messageBus: MessageBus,
    options?: SubagentInvocationOptions,
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
      options?.toolName ?? definition.name,
      options?.toolDisplayName ?? definition.displayName,
    );
    this._onAgentEvent = options?.onAgentEvent;

    // Validate that A2AClientManager is available at construction time
    if (!this.context.config.getA2AClientManager()) {
      throw new Error(
        `Failed to initialize RemoteSessionInvocation for '${definition.name}': A2AClientManager is not available.`,
      );
    }
  }

  getDescription(): string {
    return `Calling remote agent ${this.definition.displayName ?? this.definition.name}`;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return {
      type: 'info',
      title: `Call Remote Agent: ${this.definition.displayName ?? this.definition.name}`,
      prompt: `Calling remote agent: "${this.params.query}"`,
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {
        // Policy updates are now handled centrally by the scheduler
      },
    };
  }

  async execute(options: ExecuteOptions): Promise<ToolResult> {
    const { abortSignal: _signal, updateOutput } = options;
    const agentName = this.definition.displayName ?? this.definition.name;

    // Seed session with prior A2A conversation state
    const stateKey = RemoteSessionInvocation.sessionKey(this.definition);
    const priorState = RemoteSessionInvocation.sessionState.get(stateKey);
    const session = new RemoteSubagentSession(
      this.definition,
      this.context,
      this.messageBus,
      priorState,
    );

    // Wire external abort signal to session abort
    const abortListener = () => void session.abort();
    _signal.addEventListener('abort', abortListener, { once: true });

    // Subscribe for parent session observability
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
        message: { content: [{ type: 'text', text: this.params.query }] },
      });

      const result = await session.getResult();

      // The protocol resolves aborts with an empty result rather than
      // rejecting. Detect this and surface proper error state.
      if (_signal.aborted) {
        const partialProgress = session.getLatestProgress();
        const errorProgress: SubagentProgress = {
          isSubagentProgress: true,
          agentName,
          state: 'error',
          result:
            typeof partialProgress?.result === 'string'
              ? partialProgress.result
              : '',
          recentActivity: partialProgress?.recentActivity ?? [],
        };
        if (updateOutput) updateOutput(errorProgress);
        return {
          llmContent: [{ text: 'Operation cancelled by user' }],
          returnDisplay: errorProgress,
        };
      }

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
      // Persist A2A state for next invocation — even on abort/error
      RemoteSessionInvocation.sessionState.set(
        stateKey,
        session.getSessionState(),
      );
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
    if (error instanceof A2AAgentError) {
      return error.userMessage;
    }

    return `Error calling remote agent: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}
