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

export const ERROR_HANDLER_TOOL_NAME = 'handle_error';

interface ErrorHandlerParams {
  /**
   * The error message or stack trace
   */
  error_message: string;

  /**
   * The file path where the error occurred
   */
  file_path?: string;

  /**
   * The line number where the error occurred
   */
  line_number?: number;

  /**
   * The programming language or runtime
   */
  language?: string;

  /**
   * The code context around the error
   */
  code_context?: string;

  /**
   * Additional error details (e.g., error type, module, function)
   */
  error_type?: string;

  /**
   * Whether to suggest fixes automatically
   */
  suggest_fix?: boolean;
}

class ErrorHandlerInvocation extends BaseToolInvocation<
  ErrorHandlerParams,
  ToolResult
> {
  constructor(
    params: ErrorHandlerParams,
    messageBus: MessageBus | undefined,
    toolName: string | undefined,
    toolDisplayName: string | undefined,
    private readonly geminiClient: GeminiClient,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    const location = this.params.file_path
      ? ` in ${this.params.file_path}${this.params.line_number ? `:${this.params.line_number}` : ''}`
      : '';
    return `Analyze and handle error${location}`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      const {
        error_message,
        file_path,
        line_number,
        language,
        code_context,
        error_type,
        suggest_fix = true,
      } = this.params;

      // Build comprehensive error analysis prompt
      let prompt = `You are an expert debugging assistant. Analyze the following error and provide:\n`;
      prompt += `1. Root cause analysis\n`;
      prompt += `2. Explanation of what went wrong\n`;
      if (suggest_fix) {
        prompt += `3. Suggested fixes with code examples\n`;
        prompt += `4. Best practices to prevent similar errors\n`;
      }
      prompt += `\n`;

      if (file_path) {
        prompt += `File: ${file_path}\n`;
      }

      if (line_number) {
        prompt += `Line: ${line_number}\n`;
      }

      if (language) {
        prompt += `Language/Runtime: ${language}\n`;
      }

      if (error_type) {
        prompt += `Error Type: ${error_type}\n`;
      }

      prompt += `\nError Message:\n${error_message}\n`;

      if (code_context) {
        prompt += `\nCode Context:\n\`\`\`${language || ''}\n${code_context}\n\`\`\`\n`;
      }

      prompt += `\nProvide a comprehensive analysis in markdown format.`;

      // Use Gemini for error analysis
      const response = await this.geminiClient.generateContent(
        [{ role: 'user', parts: [{ text: prompt }] }],
        {},
        signal,
        'gemini-2.5-pro-002',
      );

      if (!response.text) {
        throw new Error('No error analysis generated');
      }

      const analysis = response.text.trim();

      // Build display message
      let displayMessage = `## Error Analysis\n\n`;

      if (file_path) {
        displayMessage += `**Location:** ${file_path}${line_number ? `:${line_number}` : ''}\n`;
      }

      if (error_type) {
        displayMessage += `**Error Type:** ${error_type}\n`;
      }

      if (language) {
        displayMessage += `**Language:** ${language}\n`;
      }

      displayMessage += `\n**Error Message:**\n\`\`\`\n${error_message}\n\`\`\`\n\n`;
      displayMessage += `---\n\n${analysis}`;

      return {
        llmContent: `Error analysis completed:\n${analysis}`,
        returnDisplay: displayMessage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error analyzing the error: ${errorMessage}`,
        returnDisplay: `❌ Failed to analyze error: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}

export class ErrorHandlerTool extends BaseDeclarativeTool<
  ErrorHandlerParams,
  ToolResult
> {
  constructor(
    messageBus: MessageBus | undefined,
    private readonly geminiClient: GeminiClient,
  ) {
    super(
      ERROR_HANDLER_TOOL_NAME,
      'Error Handler',
      'Intelligent error analysis and debugging assistance using Gemini AI. Provides root cause analysis, explanations, and suggested fixes for code errors.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          error_message: {
            type: 'string',
            description:
              'The error message or stack trace to analyze. Include the full error output for best results.',
          },
          file_path: {
            type: 'string',
            description: 'The file path where the error occurred (if known)',
          },
          line_number: {
            type: 'number',
            description: 'The line number where the error occurred (if known)',
          },
          language: {
            type: 'string',
            description:
              'The programming language or runtime (e.g., typescript, python, java, nodejs)',
          },
          code_context: {
            type: 'string',
            description:
              'The code context around where the error occurred. Include a few lines before and after for better analysis.',
          },
          error_type: {
            type: 'string',
            description:
              'The specific error type if known (e.g., TypeError, SyntaxError, RuntimeError)',
          },
          suggest_fix: {
            type: 'boolean',
            description:
              'Whether to generate suggested fixes. Default is true.',
          },
        },
        required: ['error_message'],
      },
      true, // isOutputMarkdown
      false, // canUpdateOutput
      messageBus,
    );
  }

  protected createInvocation(
    params: ErrorHandlerParams,
    messageBus?: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<ErrorHandlerParams, ToolResult> {
    return new ErrorHandlerInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.geminiClient,
    );
  }

  protected override validateToolParamValues(
    params: ErrorHandlerParams,
  ): string | null {
    if (!params.error_message || params.error_message.trim().length === 0) {
      return 'error_message must be a non-empty string';
    }

    if (params.line_number !== undefined && params.line_number < 1) {
      return 'line_number must be a positive integer';
    }

    return null;
  }
}
