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
    // TODO: Implement confirmation logic for remote agents.
    return false;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    // TODO: Implement remote agent invocation logic.
    throw new Error(`Remote agent invocation not implemented.`);
  }
}
