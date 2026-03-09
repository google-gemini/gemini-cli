/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseToolInvocation,
  type BackgroundExecutionData,
  type ToolConfirmationOutcome,
  type ToolResult,
  type ToolCallConfirmationDetails,
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
import { GoogleAuth } from 'google-auth-library';
import type { AuthenticationHandler } from '@a2a-js/sdk/client';
import { debugLogger } from '../utils/debugLogger.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import { A2AAuthProviderFactory } from './auth-provider/factory.js';
import { ExecutionLifecycleService } from '../services/executionLifecycleService.js';

/**
 * Authentication handler implementation using Google Application Default Credentials (ADC).
 */
export class ADCHandler implements AuthenticationHandler {
  private auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  async headers(): Promise<Record<string, string>> {
    try {
      const client = await this.auth.getClient();
      const token = await client.getAccessToken();
      if (token.token) {
        return { Authorization: `Bearer ${token.token}` };
      }
      throw new Error('Failed to retrieve ADC access token.');
    } catch (e) {
      const errorMessage = `Failed to get ADC token: ${
        e instanceof Error ? e.message : String(e)
      }`;
      debugLogger.log('ERROR', errorMessage);
      throw new Error(errorMessage);
    }
  }

  async shouldRetryWithHeaders(
    _response: unknown,
  ): Promise<Record<string, string> | undefined> {
    // For ADC, we usually just re-fetch the token if needed.
    return this.headers();
  }
}

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

  private publishBackgroundDelta(
    executionId: number,
    previousOutput: string,
    nextOutput: string,
  ): string {
    if (nextOutput.length === 0 || nextOutput === previousOutput) {
      return previousOutput;
    }

    if (nextOutput.startsWith(previousOutput)) {
      ExecutionLifecycleService.appendOutput(
        executionId,
        nextOutput.slice(previousOutput.length),
      );
      return nextOutput;
    }

    // If the reassembled output changes non-monotonically, resync by appending
    // the full latest snapshot with a clear separator.
    ExecutionLifecycleService.appendOutput(
      executionId,
      `\n\n[Output updated]\n${nextOutput}`,
    );
    return nextOutput;
  }

  async execute(
    _signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
    _shellExecutionConfig?: unknown,
    setExecutionIdCallback?: (executionId: number) => void,
  ): Promise<ToolResult> {
    const reassembler = new A2AResultReassembler();
    const executionController = new AbortController();
    const onAbort = () => executionController.abort();
    _signal.addEventListener('abort', onAbort, { once: true });

    const { pid, result } = ExecutionLifecycleService.createExecution(
      '',
      () => executionController.abort(),
    );
    if (pid === undefined) {
      _signal.removeEventListener('abort', onAbort);
      return {
        llmContent: [
          { text: 'Error calling remote agent: missing execution pid.' },
        ],
        returnDisplay: 'Error calling remote agent: missing execution pid.',
        error: {
          message: 'Error calling remote agent: missing execution pid.',
        },
      };
    }
    const backgroundExecutionId = pid;
    setExecutionIdCallback?.(backgroundExecutionId);

    const run = async () => {
      let lastOutput = '';
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

        const stream = this.clientManager.sendMessageStream(
          this.definition.name,
          this.params.query,
          {
            contextId: this.contextId,
            taskId: this.taskId,
            signal: executionController.signal,
          },
        );

        let finalResponse: SendMessageResult | undefined;

        for await (const chunk of stream) {
          if (executionController.signal.aborted) {
            throw new Error('Operation aborted');
          }
          finalResponse = chunk;
          reassembler.update(chunk);

          const currentOutput = reassembler.toString();
          lastOutput = this.publishBackgroundDelta(
            backgroundExecutionId,
            lastOutput,
            currentOutput,
          );
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

        ExecutionLifecycleService.completeExecution(backgroundExecutionId, {
          exitCode: 0,
        });
      } catch (error: unknown) {
        const partialOutput = reassembler.toString();
        lastOutput = this.publishBackgroundDelta(
          backgroundExecutionId,
          lastOutput,
          partialOutput,
        );
        const errorMessage = `Error calling remote agent: ${
          error instanceof Error ? error.message : String(error)
        }`;
        ExecutionLifecycleService.completeExecution(backgroundExecutionId, {
          error: new Error(errorMessage),
          aborted: executionController.signal.aborted,
          exitCode: executionController.signal.aborted ? 130 : 1,
        });
      } finally {
        _signal.removeEventListener('abort', onAbort);
        // Persist state even on partial failures or aborts to maintain conversational continuity.
        RemoteAgentInvocation.sessionState.set(this.definition.name, {
          contextId: this.contextId,
          taskId: this.taskId,
        });
      }
    };

    void run();
    const executionResult = await result;

    if (executionResult.backgrounded) {
      const command = `${this.getDescription()}: ${this.params.query}`;
      const backgroundMessage = `Remote agent moved to background (PID: ${backgroundExecutionId}). Output hidden. Press Ctrl+B to view.`;
      const data: BackgroundExecutionData = {
        executionId: backgroundExecutionId,
        pid: backgroundExecutionId,
        command,
        initialOutput: executionResult.output,
      };
      return {
        llmContent: [{ text: backgroundMessage }],
        returnDisplay: backgroundMessage,
        data,
      };
    }

    if (executionResult.error) {
      const fullDisplay = executionResult.output
        ? `${executionResult.output}\n\n${executionResult.error.message}`
        : executionResult.error.message;
      return {
        llmContent: [{ text: fullDisplay }],
        returnDisplay: fullDisplay,
        error: { message: executionResult.error.message },
      };
    }

    return {
      llmContent: [{ text: executionResult.output }],
      returnDisplay: executionResult.output,
    };
  }
}
