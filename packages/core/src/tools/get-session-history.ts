/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { GET_SESSION_HISTORY_TOOL_NAME } from './tool-names.js';
import { GET_SESSION_HISTORY_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

class GetSessionHistoryInvocation extends BaseToolInvocation<
  Record<string, never>,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: Record<string, never>,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  getDescription(): string {
    return 'Retrieving current session chat history';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const client = this.config.getGeminiClient();
    if (!client) {
      throw new Error('GeminiClient not initialized.');
    }

    const history = client.getHistory();
    let historyText = '';

    for (const turn of history) {
      historyText += `\n--- Role: ${turn.role} ---\n`;
      if (turn.parts) {
        for (const part of turn.parts) {
          if (part.text) {
            historyText += `${part.text}\n`;
          } else if (part.functionCall) {
            historyText += `[Tool Call: ${part.functionCall.name} with args: ${JSON.stringify(part.functionCall.args)}]\n`;
          } else if (part.functionResponse) {
            // Include function response safely
            const responseText = JSON.stringify(part.functionResponse.response);
            historyText += `[Tool Response: ${part.functionResponse.name} - ${responseText.substring(0, 1000)}${responseText.length > 1000 ? '...' : ''}]\n`;
          }
        }
      }
    }

    return {
      llmContent: historyText || 'No history found.',
      returnDisplay: 'Successfully retrieved session history.',
    };
  }
}

export class GetSessionHistoryTool extends BaseDeclarativeTool<
  Record<string, never>,
  ToolResult
> {
  static readonly Name = GET_SESSION_HISTORY_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      GetSessionHistoryTool.Name,
      'GetSessionHistory',
      GET_SESSION_HISTORY_DEFINITION.base.description!,
      Kind.Think,
      GET_SESSION_HISTORY_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: Record<string, never>,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    return new GetSessionHistoryInvocation(
      this.config,
      params,
      messageBus,
      toolName ?? this.name,
      displayName ?? this.displayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(GET_SESSION_HISTORY_DEFINITION, modelId);
  }
}
