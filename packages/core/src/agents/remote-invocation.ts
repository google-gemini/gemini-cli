/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolConfirmationOutcome,
  ToolResult,
  ToolCallConfirmationDetails,
} from '../tools/tools.js';
import { BaseToolInvocation } from '../tools/tools.js';
import { DEFAULT_QUERY_STRING } from './types.js';
import type {
  RemoteAgentInputs,
  RemoteAgentDefinition,
  AgentInputs,
} from './types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { A2AClientManager } from './a2a-client-manager.js';
import { extractIdsFromResponse, A2AResultReassembler } from './a2aUtils.js';
import { GoogleAuth } from 'google-auth-library';
import type { AuthenticationHandler } from '@a2a-js/sdk/client';
import { debugLogger } from '../utils/debugLogger.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import type { SendMessageResult } from './a2a-client-manager.js';

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
  private readonly authHandler = new ADCHandler();

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
    updateOutput?: (output: string | AnsiOutput) => void,
  ): Promise<ToolResult> {
    // 1. Ensure the agent is loaded (cached by manager)
    // We assume the user has provided an access token via some mechanism (TODO),
    // or we rely on ADC.
    const reassembler = new A2AResultReassembler();
    try {
      const priorState = RemoteAgentInvocation.sessionState.get(
        this.definition.name,
      );
      if (priorState) {
        this.contextId = priorState.contextId;
        this.taskId = priorState.taskId;
      }

      if (!this.clientManager.getClient(this.definition.name)) {
        await this.clientManager.loadAgent(
          this.definition.name,
          this.definition.agentCardUrl,
          this.authHandler,
        );
      }

      const message = this.params.query;

      const stream = this.clientManager.sendMessageStream(
        this.definition.name,
        message,
        {
          contextId: this.contextId,
          taskId: this.taskId,
          signal: _signal,
        },
      );

      let finalResponse: SendMessageResult | undefined;

      for await (const chunk of stream) {
        if (_signal.aborted) {
          throw new Error('Operation aborted');
        }
        finalResponse = chunk;
        reassembler.update(chunk);

        if (updateOutput) {
          updateOutput(reassembler.toString());
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

      const finalOutput = reassembler.toString();

      debugLogger.debug(
        `[RemoteAgent] Final response from ${this.definition.name}:\n${JSON.stringify(finalResponse, null, 2)}`,
      );

      return {
        llmContent: [{ text: finalOutput }],
        returnDisplay: finalOutput,
      };
    } catch (error: unknown) {
      const partialOutput = reassembler.toString();
      const errorMessage = `Error calling remote agent: ${error instanceof Error ? error.message : String(error)}`;
      const fullDisplay = partialOutput
        ? `${partialOutput}\n\n${errorMessage}`
        : errorMessage;
      return {
        llmContent: [{ text: fullDisplay }],
        returnDisplay: fullDisplay,
        error: { message: errorMessage },
      };
    } finally {
      // Persist state even on partial failures or aborts to maintain conversational continuity.
      RemoteAgentInvocation.sessionState.set(this.definition.name, {
        contextId: this.contextId,
        taskId: this.taskId,
      });
    }
  }
}
