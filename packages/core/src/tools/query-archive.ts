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
import { QUERY_ARCHIVE_TOOL_NAME, QUERY_ARCHIVE_DEFINITION } from './definitions/coreTools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { PromptProvider } from '../prompts/promptProvider.js';
import { LlmRole } from '../telemetry/types.js';
import { DEFAULT_GEMINI_FLASH_LITE_MODEL } from '../config/models.js';
import { getResponseText } from '../utils/partUtils.js';

interface QueryArchiveParams {
  archive_key: string;
  query: string;
}

/**
 * Escapes XML-like tags to prevent prompt injection.
 */
function sanitizeTags(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

class QueryArchiveToolInvocation extends BaseToolInvocation<
  QueryArchiveParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: QueryArchiveParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  getDescription(): string {
    return `querying archive "${this.params.archive_key}"`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const { archive_key, query } = this.params;
    const stashedContent = this.config.retrieveStashedContext(archive_key);

    if (!stashedContent) {
      return {
        llmContent: JSON.stringify({ 
          success: false, 
          error: `Archive key "${archive_key}" not found.` 
        }),
        returnDisplay: `Query failed: Archive key "${archive_key}" not found.`,
      };
    }

    const promptProvider = new PromptProvider();
    const systemInstruction = promptProvider.getArchiveQueryPrompt();
    
    // Sanitize inputs to prevent prompt injection via tag-breaking
    const sanitizedQuery = sanitizeTags(query);
    const sanitizedContent = sanitizeTags(stashedContent);

    const userPrompt = `<query>${sanitizedQuery}</query>\n\n<stashed_content>\n${sanitizedContent}\n</stashed_content>`;

    try {
      const baseLlmClient = this.config.getBaseLlmClient();
      
      // Use a timeout to prevent hanging the CLI if the background call is slow
      const timeoutSignal = AbortSignal.timeout(30000);
      const linkedSignal = AbortSignal.any([signal, timeoutSignal]);

      // Use BaseLlmClient for stateless utility call
      // Use Flash Lite for efficiency as suggested by review
      const response = await baseLlmClient.generateContent({
        modelConfigKey: { model: DEFAULT_GEMINI_FLASH_LITE_MODEL },
        contents: [
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        systemInstruction,
        abortSignal: linkedSignal,
        promptId: this.config.getSessionId(),
        role: LlmRole.UTILITY_TOOL
      });

      const resultText = getResponseText(response) || 'No information found.';

      return {
        llmContent: JSON.stringify({ 
          success: true, 
          result: resultText 
        }),
        returnDisplay: `Retrieved from archive "${archive_key}": ${resultText}`,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          llmContent: JSON.stringify({ 
            success: false, 
            error: 'Query archive request timed out after 30 seconds.' 
          }),
          returnDisplay: 'Error querying archive: Request timed out.',
        };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: JSON.stringify({ 
          success: false, 
          error: `Failed to query archive. Detail: ${errorMessage}` 
        }),
        returnDisplay: `Error querying archive: ${errorMessage}`,
      };
    }
  }
}

export class QueryArchiveTool extends BaseDeclarativeTool<
  QueryArchiveParams,
  ToolResult
> {
  static readonly Name = QUERY_ARCHIVE_TOOL_NAME;

  constructor(private readonly config: Config, messageBus: MessageBus) {
    super(
      QueryArchiveTool.Name,
      'QueryArchive',
      QUERY_ARCHIVE_DEFINITION.base.description!,
      Kind.Think,
      QUERY_ARCHIVE_DEFINITION.base.parametersJsonSchema,
      messageBus,
      false,
    );
  }

  protected createInvocation(
    params: QueryArchiveParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    return new QueryArchiveToolInvocation(
      this.config,
      params,
      messageBus,
      toolName ?? this.name,
      displayName ?? this.displayName,
    );
  }
}
