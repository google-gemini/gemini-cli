/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { getDebugSessionManager } from '../debug/session-store.js';
import type {
  ToolConfirmationOutcome,
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolCallConfirmationDetails,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { DEBUG_EVALUATE_TOOL_NAME } from './tool-names.js';

interface DebugEvaluateParams {
  expression: string;
  frame_id?: number;
  context?: 'watch' | 'repl' | 'hover' | 'clipboard' | string;
}

class DebugEvaluateInvocation extends BaseToolInvocation<
  DebugEvaluateParams,
  ToolResult
> {
  getDescription(): string {
    return `Evaluate expression: ${this.params.expression}`;
  }

  override async shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const details = await this.getConfirmationDetails(abortSignal);
    return details;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm Debug Evaluate',
      prompt: `Evaluate expression in a live debug target: ${this.params.expression}`,
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {},
    };
    return confirmationDetails;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const result = await manager.evaluate(
      this.params.expression,
      this.params.frame_id,
      this.params.context,
    );

    return {
      llmContent: `${result.result}`,
      returnDisplay: `Evaluated expression: ${this.params.expression}`,
    };
  }
}

export class DebugEvaluateTool extends BaseDeclarativeTool<
  DebugEvaluateParams,
  ToolResult
> {
  static readonly Name = DEBUG_EVALUATE_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_EVALUATE_TOOL_NAME,
      'DebugEvaluate',
      'Evaluate an expression in the current debug context.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          expression: { type: 'string' },
          frame_id: { type: 'number' },
          context: { type: 'string' },
        },
        required: ['expression'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugEvaluateParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugEvaluateParams, ToolResult> {
    return new DebugEvaluateInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
