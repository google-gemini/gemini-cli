/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { getDebugSessionManager } from '../debug/session-store.js';
import { buildAnalysisPrompt, formatScopes } from '../debug/debug-analyzer.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { DEBUG_VARIABLES_TOOL_NAME } from './tool-names.js';

interface DebugVariablesParams {
  frame_id: number;
  scope?: string;
}

class DebugVariablesInvocation extends BaseToolInvocation<
  DebugVariablesParams,
  ToolResult
> {
  getDescription(): string {
    return `Inspect variables for frame ${this.params.frame_id}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const scopes = await manager.getScopes(this.params.frame_id);

    const normalizedScope = this.params.scope?.toLowerCase();
    const selectedScopes = normalizedScope
      ? scopes.filter((scope) => scope.name.toLowerCase() === normalizedScope)
      : scopes;

    const expanded = await Promise.all(
      selectedScopes.map(async (scope) => ({
        scope,
        variables: await manager.getVariables(scope.variablesReference),
      })),
    );

    const formatted = formatScopes(expanded);
    const session = manager.requireSession();
    const stack = await manager.getStackTrace(session.stoppedThreadId, 5);
    const analysisPrompt = buildAnalysisPrompt({
      stackTrace: stack,
      variables: expanded,
      stoppedReason: session.stoppedReason,
    });

    return {
      llmContent: `${formatted}\n\n${analysisPrompt}`,
      returnDisplay: `Retrieved variables for frame ${this.params.frame_id}.`,
    };
  }
}

export class DebugVariablesTool extends BaseDeclarativeTool<
  DebugVariablesParams,
  ToolResult
> {
  static readonly Name = DEBUG_VARIABLES_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_VARIABLES_TOOL_NAME,
      'DebugVariables',
      'Inspect variables for a stack frame and summarize state for root-cause analysis.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          frame_id: { type: 'number' },
          scope: { type: 'string' },
        },
        required: ['frame_id'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugVariablesParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugVariablesParams, ToolResult> {
    return new DebugVariablesInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
