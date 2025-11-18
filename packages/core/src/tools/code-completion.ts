/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { GeminiClient } from '../core/client.js';

export const CODE_COMPLETION_TOOL_NAME = 'code_completion';

interface CodeCompletionParams {
  /**
   * The file path where code completion is requested
   */
  file_path: string;

  /**
   * The existing code context before the cursor
   */
  prefix: string;

  /**
   * The existing code context after the cursor (optional)
   */
  suffix?: string;

  /**
   * The programming language of the file
   */
  language?: string;

  /**
   * Additional context or instructions for the completion
   */
  context?: string;
}

class CodeCompletionInvocation extends BaseToolInvocation<
  CodeCompletionParams,
  ToolResult
> {
  constructor(
    params: CodeCompletionParams,
    messageBus: MessageBus | undefined,
    toolName: string | undefined,
    toolDisplayName: string | undefined,
    private readonly geminiClient: GeminiClient,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return `Generate code completion for ${this.params.file_path}${
      this.params.language ? ` (${this.params.language})` : ''
    }`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      const { file_path, prefix, suffix, language, context } = this.params;

      // Build the prompt for code completion
      let prompt = `You are a code completion assistant. Generate code to complete the following context.\n\n`;

      if (language) {
        prompt += `Language: ${language}\n`;
      }

      prompt += `File: ${file_path}\n\n`;

      if (context) {
        prompt += `Additional Context: ${context}\n\n`;
      }

      prompt += `Code before cursor:\n\`\`\`\n${prefix}\n\`\`\`\n\n`;

      if (suffix) {
        prompt += `Code after cursor:\n\`\`\`\n${suffix}\n\`\`\`\n\n`;
      }

      prompt += `Generate the most appropriate code completion. Return ONLY the code that should be inserted, without any explanations or markdown formatting.`;

      // Use Gemini Flash for fast completions
      const response = await this.geminiClient.generateContent(
        [{ role: 'user', parts: [{ text: prompt }] }],
        {},
        signal,
        'gemini-2.0-flash-exp',
      );

      if (!response.text) {
        throw new Error('No completion generated');
      }

      const completion = response.text.trim();

      const displayMessage = `## Code Completion for ${file_path}\n\n\`\`\`${language || ''}\n${completion}\n\`\`\``;

      return {
        llmContent: `Code completion generated successfully:\n${completion}`,
        returnDisplay: displayMessage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error generating code completion: ${errorMessage}`,
        returnDisplay: `❌ Failed to generate code completion: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}

export class CodeCompletionTool extends BaseDeclarativeTool<
  CodeCompletionParams,
  ToolResult
> {
  constructor(
    messageBus: MessageBus | undefined,
    private readonly geminiClient: GeminiClient,
  ) {
    super(
      CODE_COMPLETION_TOOL_NAME,
      'Code Completion',
      'Generate intelligent code completions using Gemini AI. Provides context-aware suggestions for completing code in any programming language.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The file path where code completion is requested',
          },
          prefix: {
            type: 'string',
            description: 'The existing code context before the cursor',
          },
          suffix: {
            type: 'string',
            description:
              'The existing code context after the cursor (optional)',
          },
          language: {
            type: 'string',
            description:
              'The programming language of the file (e.g., typescript, python, java)',
          },
          context: {
            type: 'string',
            description:
              'Additional context or instructions for the completion',
          },
        },
        required: ['file_path', 'prefix'],
      },
      true, // isOutputMarkdown
      false, // canUpdateOutput
      messageBus,
    );
  }

  protected createInvocation(
    params: CodeCompletionParams,
    messageBus?: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<CodeCompletionParams, ToolResult> {
    return new CodeCompletionInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.geminiClient,
    );
  }

  protected override validateToolParamValues(
    params: CodeCompletionParams,
  ): string | null {
    if (!params.file_path || params.file_path.trim().length === 0) {
      return 'file_path must be a non-empty string';
    }

    if (!params.prefix || params.prefix.trim().length === 0) {
      return 'prefix must be a non-empty string';
    }

    return null;
  }
}
