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
import { STASH_CONTEXT_TOOL_NAME, STASH_CONTEXT_DEFINITION } from './definitions/coreTools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';

interface StashContextParams {
  archive_key: string;
  summary: string;
  tool_call_id_to_stash: string;
}

const STASH_THRESHOLD_TOKENS = 2000;

class StashContextToolInvocation extends BaseToolInvocation<
  StashContextParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: StashContextParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  getDescription(): string {
    return `stashing context for "${this.params.archive_key}"`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { archive_key, summary, tool_call_id_to_stash } = this.params;
    const chat = this.config.getGeminiClient().getChat();
    const history = chat.getHistory();

    for (let i = 0; i < history.length; i++) {
      const content = history[i];
      if (content.role !== 'user' || !content.parts) {
        continue;
      }

      for (let j = 0; j < content.parts.length; j++) {
        const part = content.parts[j];
        if (!part.functionResponse) {
          continue;
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const functionResponse = part.functionResponse as unknown as {
          id?: string;
          name: string;
          response: object;
        };

        // Strict ID matching as requested by review
        if (functionResponse.id === tool_call_id_to_stash) {
          const tokens = estimateTokenCountSync([part]);
          if (tokens < STASH_THRESHOLD_TOKENS) {
            return {
              llmContent: JSON.stringify({
                success: false,
                error: `Tool output is only ~${tokens} tokens. Stashing is only allowed for outputs > ${STASH_THRESHOLD_TOKENS} tokens to prevent unnecessary overhead.`,
              }),
              returnDisplay: `Stash skipped: Output is too small (~${tokens} tokens).`,
            };
          }

          const stashedContent = JSON.stringify(functionResponse.response);
          this.config.stashContext(archive_key, stashedContent);

          // Create a new history array with the modified part to maintain immutability
          const newHistory = [...history];
          const newContent = { ...newHistory[i] };
          const newParts = [...(newContent.parts || [])];
          newParts[j] = {
            functionResponse: {
              ...functionResponse,
              response: {
                summary,
                stashed_in_archive: true,
                archive_key,
              },
            },
          };
          newContent.parts = newParts;
          newHistory[i] = newContent;

          chat.setHistory(newHistory);
          const msg = `Successfully stashed content under key "${archive_key}" and updated history with summary.`;
          return {
            llmContent: JSON.stringify({ success: true, message: msg }),
            returnDisplay: msg,
          };
        }
      }
    }

    // If we get here, the tool call was not found
    return {
      llmContent: JSON.stringify({
        success: false,
        error: `Could not find tool call with ID "${tool_call_id_to_stash}" in history.`,
      }),
      returnDisplay: `Failed to stash context: Tool call ID not found.`,
    };
  }
}

export class StashContextTool extends BaseDeclarativeTool<
  StashContextParams,
  ToolResult
> {
  static readonly Name = STASH_CONTEXT_TOOL_NAME;

  constructor(private readonly config: Config, messageBus: MessageBus) {
    super(
      StashContextTool.Name,
      'StashContext',
      STASH_CONTEXT_DEFINITION.base.description!,
      Kind.Think,
      STASH_CONTEXT_DEFINITION.base.parametersJsonSchema,
      messageBus,
      false, // No confirmation needed as it's a context management tool
    );
  }

  protected createInvocation(
    params: StashContextParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    return new StashContextToolInvocation(
      this.config,
      params,
      messageBus,
      toolName ?? this.name,
      displayName ?? this.displayName,
    );
  }
}
