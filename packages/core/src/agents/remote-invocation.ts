/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseToolInvocation,
  type ToolResult,
  type ToolCallConfirmationDetails,
} from '../tools/tools.js';
import type { AgentInputs, RemoteAgentDefinition } from './types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { A2AClientManager } from './a2a-client-manager.js';
import { extractMessageText, extractTaskText } from './a2aUtils.js';

/**
 * A tool invocation that proxies to a remote A2A agent.
 *
 * This implementation bypasses the local `LocalAgentExecutor` loop and directly
 * invokes the configured A2A tool.
 */
export class RemoteAgentInvocation extends BaseToolInvocation<
  AgentInputs,
  ToolResult
> {
  // State for the ongoing conversation with the remote agent
  private contextId: string | undefined;
  private taskId: string | undefined;
  // TODO: See if we can reuse the singleton from AppContainer or similar, but for now use getInstance directly
  // as per the current pattern in the codebase.
  private readonly clientManager = A2AClientManager.getInstance({} as any); // Config not used yet

  constructor(
    private readonly definition: RemoteAgentDefinition,
    params: AgentInputs,
    messageBus?: MessageBus,
  ) {
    super(params, messageBus, definition.name, definition.displayName);
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
      prompt: `This will send a message to the external agent at ${this.definition.agentCardUrl}.`,
      onConfirm: async () => {}, // No-op for now, just informational
    };
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    // 1. Ensure the agent is loaded (cached by manager)
    // We assume the user has provided an access token via some mechanism (TODO),
    // or we rely on ADC.
    try {
      if (!this.clientManager.getClient(this.definition.name)) {
        await this.clientManager.loadAgent(
          this.definition.name,
          this.definition.agentCardUrl,
        );
      }

      // 2. Construct the message from params.
      // TODO: We need a standard way to map AgentInputs to a string message.
      // For now, we'll assume there is a 'query' or 'prompt' field, or JSON stringify all params.
      // 2. Construct the message from params.
      // We aim to extract a single string message from the structured AgentInputs.
      // Priority:
      // 1. Explicit 'query', 'prompt', or 'message' field.
      // 2. Single string input.
      // 3. Simple key-value formatting.
      // 4. JSON fallback.
      let message = '';

      const paramKeys = Object.keys(this.params);
      const primaryKey = paramKeys.find((k) =>
        ['query', 'prompt', 'message'].includes(k.toLowerCase()),
      );

      if (primaryKey && typeof this.params[primaryKey] === 'string') {
        message = this.params[primaryKey] as string;
      } else if (
        paramKeys.length === 1 &&
        typeof this.params[paramKeys[0]] === 'string'
      ) {
        // Single string input, use it directly (e.g. { topic: "foo" } -> "foo")
        message = this.params[paramKeys[0]] as string;
      } else {
        // Multiple inputs or non-string inputs.
        // Try to format nicely if they are all primitives
        const allPrimitives = Object.values(this.params).every(
          (v) =>
            typeof v === 'string' ||
            typeof v === 'number' ||
            typeof v === 'boolean',
        );

        if (allPrimitives && paramKeys.length > 0) {
          message = paramKeys
            .map((k) => `${k}: ${this.params[k]}`)
            .join('\n');
        } else {
          message = JSON.stringify(this.params);
        }
      }

      // 3. Send the message, passing in our state
      const response = await this.clientManager.sendMessage(
        this.definition.name,
        message,
        {
          contextId: this.contextId,
          taskId: this.taskId,
        },
      );

      // 4. Update our state
      this.contextId = response.contextId;
      this.taskId = response.taskId;

      // 5. Extract the result text
      const resultData = (response as any).result;
      let outputText = '';

      if (resultData.kind === 'message') {
        outputText = extractMessageText(resultData);
      } else if (resultData.kind === 'task') {
        outputText = extractTaskText(resultData);
      } else {
        outputText = JSON.stringify(resultData);
      }

      return {
        llmContent: [{ text: outputText }],
        returnDisplay: outputText,
      };
    } catch (error: any) {
      const errorMessage = `Error calling remote agent: ${error.message}`;
      return {
        llmContent: [{ text: errorMessage }],
        returnDisplay: errorMessage,
        error: { message: errorMessage },
      };
    }
  }
}
