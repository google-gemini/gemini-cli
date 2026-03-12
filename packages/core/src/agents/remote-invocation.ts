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
  type BackgroundExecutionData,
  type ExecuteOptions,
} from '../tools/tools.js';
import {
  DEFAULT_QUERY_STRING,
  type RemoteAgentInputs,
  type RemoteAgentDefinition,
  type AgentInputs,
} from './types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  A2AClientManager,
  type SendMessageResult,
} from './a2a-client-manager.js';
import { extractIdsFromResponse, A2AResultReassembler } from './a2aUtils.js';
import type { AuthenticationHandler } from '@a2a-js/sdk/client';
import { debugLogger } from '../utils/debugLogger.js';
import { safeJsonToMarkdown } from '../utils/markdownUtils.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import { A2AAuthProviderFactory } from './auth-provider/factory.js';
import { A2AAgentError } from './a2a-errors.js';
import { ExecutionLifecycleService } from '../services/executionLifecycleService.js';

/**
 * A tool invocation that proxies to a remote A2A agent.
 *
 * This implementation bypasses the local `LocalAgentExecutor` loop and directly
 * invokes the configured A2A tool.
 */
export class RemoteAgentInvocation extends BaseToolInvocation<
  RemoteAgentInputs,
  ToolResult
> {
  // Persist state across ephemeral invocation instances.
  private static readonly sessionState = new Map<
    string,
    { contextId?: string; taskId?: string }
  >();
  // State for the ongoing conversation with the remote agent
  private contextId: string | undefined;
  private taskId: string | undefined;
  // TODO: See if we can reuse the singleton from AppContainer or similar, but for now use getInstance directly
  // as per the current pattern in the codebase.
  private readonly clientManager = A2AClientManager.getInstance();
  private authHandler: AuthenticationHandler | undefined;

  constructor(
    private readonly definition: RemoteAgentDefinition,
    params: AgentInputs,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
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
  }

  getDescription(): string {
    return `Calling remote agent ${this.definition.displayName ?? this.definition.name}`;
  }

  private async getAuthHandler(): Promise<AuthenticationHandler | undefined> {
    if (this.authHandler) {
      return this.authHandler;
    }

    if (this.definition.auth) {
      const provider = await A2AAuthProviderFactory.create({
        authConfig: this.definition.auth,
        agentName: this.definition.name,
        targetUrl: this.definition.agentCardUrl,
        agentCardUrl: this.definition.agentCardUrl,
      });
      if (!provider) {
        throw new Error(
          `Failed to create auth provider for agent '${this.definition.name}'`,
        );
      }
      this.authHandler = provider;
    }

    return this.authHandler;
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
    signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
    options?: ExecuteOptions,
  ): Promise<ToolResult> {
    const { setExecutionIdCallback } = options ?? {};
    // Create an AbortController for lifecycle kill support.
    // Parent abort and lifecycle kill both funnel through this controller.
    const executionAbortController = new AbortController();
    if (signal.aborted) {
      executionAbortController.abort();
    } else {
      signal.addEventListener('abort', () => executionAbortController.abort(), {
        once: true,
      });
    }

    // Register with lifecycle service as a virtual execution so this
    // invocation can be backgrounded, subscribed to, and killed.
    const agentLabel = this.definition.displayName ?? this.definition.name;
    const handle = ExecutionLifecycleService.createExecution(
      '',
      () => executionAbortController.abort(),
      'remote_agent',
      (output, error) => {
        const header = error
          ? `[Remote agent '${agentLabel}' completed with error: ${error.message}]`
          : `[Remote agent '${agentLabel}' completed successfully]`;
        return output ? `${header}\nOutput:\n${output}` : header;
      },
      agentLabel,
    );
    // createExecution always produces a valid numeric ID
    const executionId = handle.pid!;

    if (setExecutionIdCallback) {
      setExecutionIdCallback(executionId);
    }

    // Guard: stop calling updateOutput after backgrounding since the
    // tool call has already returned from the scheduler's perspective.
    let backgrounded = false;

    // Fire-and-forget: stream processing runs concurrently and settles the
    // lifecycle execution on completion or error.
    const streamingPromise = this.processStream(
      executionId,
      executionAbortController.signal,
      (output) => {
        if (!backgrounded && updateOutput) {
          updateOutput(output);
        }
      },
    );
    // Errors are handled internally via completeExecution; prevent
    // unhandled-rejection noise.
    streamingPromise.catch(() => {});

    // Resolves when either: (a) processStream completes/errors, or
    // (b) the execution is backgrounded externally.
    const result = await handle.result;

    if (result.backgrounded) {
      backgrounded = true;
      const data: BackgroundExecutionData = {
        pid: executionId,
        command: `Remote agent: ${agentLabel}`,
        initialOutput: result.output,
      };
      return {
        llmContent: [
          {
            text: `Remote agent '${agentLabel}' moved to background (ID: ${executionId}). Use subscribe to view output.`,
          },
        ],
        returnDisplay: `Remote agent moved to background (ID: ${executionId}).`,
        data,
      };
    }

    // Error path — the lifecycle result carries the original Error instance.
    if (result.error) {
      const errorMessage = this.formatExecutionError(result.error);
      const fullDisplay = result.output
        ? `${result.output}\n\n${errorMessage}`
        : errorMessage;
      return {
        llmContent: [{ text: fullDisplay }],
        returnDisplay: fullDisplay,
        error: { message: errorMessage },
      };
    }

    // Normal completion.
    const finalOutput = result.output;
    debugLogger.debug(
      `[RemoteAgent] Final output from ${this.definition.name}: ${finalOutput.substring(0, 200)}`,
    );
    return {
      llmContent: [{ text: finalOutput }],
      returnDisplay: safeJsonToMarkdown(finalOutput),
    };
  }

  /**
   * Runs the A2A stream, feeding output deltas into the lifecycle service.
   * On completion (or error) it settles the lifecycle execution so
   * {@link execute}'s `handle.result` resolves.
   */
  private async processStream(
    executionId: number,
    signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
  ): Promise<void> {
    const reassembler = new A2AResultReassembler();
    let previousOutputLength = 0;

    try {
      const priorState = RemoteAgentInvocation.sessionState.get(
        this.definition.name,
      );
      if (priorState) {
        this.contextId = priorState.contextId;
        this.taskId = priorState.taskId;
      }

      const authHandler = await this.getAuthHandler();

      if (!this.clientManager.getClient(this.definition.name)) {
        await this.clientManager.loadAgent(
          this.definition.name,
          this.definition.agentCardUrl,
          authHandler,
        );
      }

      const message = this.params.query;

      const stream = this.clientManager.sendMessageStream(
        this.definition.name,
        message,
        {
          contextId: this.contextId,
          taskId: this.taskId,
          signal,
        },
      );

      let finalResponse: SendMessageResult | undefined;

      for await (const chunk of stream) {
        if (signal.aborted) {
          throw new Error('Operation aborted');
        }
        finalResponse = chunk;
        reassembler.update(chunk);

        // Compute delta so lifecycle subscribers see incremental chunks.
        const currentOutput = reassembler.toString();
        const delta = currentOutput.substring(previousOutputLength);
        previousOutputLength = currentOutput.length;

        if (delta) {
          ExecutionLifecycleService.appendOutput(executionId, delta);
        }

        if (updateOutput) {
          updateOutput(currentOutput);
        }

        const {
          contextId: newContextId,
          taskId: newTaskId,
          clearTaskId,
        } = extractIdsFromResponse(chunk);

        if (newContextId) {
          this.contextId = newContextId;
        }

        this.taskId = clearTaskId ? undefined : (newTaskId ?? this.taskId);
      }

      if (!finalResponse) {
        throw new Error('No response from remote agent.');
      }

      debugLogger.debug(
        `[RemoteAgent] Final response from ${this.definition.name}:\n${JSON.stringify(finalResponse, null, 2)}`,
      );

      ExecutionLifecycleService.completeExecution(executionId);
    } catch (error: unknown) {
      ExecutionLifecycleService.completeExecution(executionId, {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    } finally {
      // Persist conversational state. On abort/kill the task was interrupted
      // so clear taskId (next invocation starts a fresh task), but keep
      // contextId to maintain the conversation with the remote agent.
      RemoteAgentInvocation.sessionState.set(this.definition.name, {
        contextId: this.contextId,
        taskId: signal.aborted ? undefined : this.taskId,
      });
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
