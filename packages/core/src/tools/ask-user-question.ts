/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type AskUserQuestionRequest,
  type AskUserQuestionResponse,
} from '../confirmation-bus/types.js';
import { ASK_USER_QUESTION_TOOL_NAME } from './tool-names.js';
import { randomUUID } from 'node:crypto';

const DESCRIPTION = `Ask the user one or more questions during task execution to get clarification or preferences.

Use this tool when you need to:
- Clarify ambiguous instructions from the user
- Get user preferences on implementation choices (e.g., "Should I use SQLite or PostgreSQL?")
- Offer multiple valid approaches and let the user decide
- Confirm assumptions before proceeding with significant changes

Each question can have 2-4 predefined options with descriptions, and users can always provide custom input via "Other".

**Important:**
- Only ask questions when genuinely needed for decision-making
- Keep questions clear and concise
- Provide meaningful option descriptions to help users decide
- Limit to 1-4 questions per call to avoid overwhelming the user`;

// Zod schemas for validation
const QuestionOptionSchema = z.object({
  label: z
    .string()
    .min(1)
    .max(50)
    .describe('Display text for this option (1-5 words)'),
  description: z
    .string()
    .min(1)
    .max(200)
    .describe('Explanation of what this option means or entails'),
});

const QuestionSchema = z.object({
  question: z
    .string()
    .min(5)
    .max(500)
    .describe(
      'The complete question to ask. Should be clear, specific, and end with a question mark.',
    ),
  header: z
    .string()
    .min(1)
    .max(12)
    .describe(
      'Short label displayed as a chip/tag (max 12 chars). Example: "Auth method", "Database", "Approach"',
    ),
  options: z
    .array(QuestionOptionSchema)
    .min(2)
    .max(4)
    .describe(
      'The available choices for this question. Must have 2-4 options. An "Other" option for custom input is automatically added.',
    ),
  multiSelect: z
    .boolean()
    .optional()
    .describe(
      'Set to true to allow the user to select multiple options. Default: false (single selection only)',
    ),
});

const AskUserQuestionParamsSchema = z.object({
  questions: z
    .array(QuestionSchema)
    .min(1)
    .max(4)
    .describe('1-4 questions to ask the user'),
});

export type AskUserQuestionParams = z.infer<typeof AskUserQuestionParamsSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

/**
 * Tool for asking users questions during task execution.
 * Enables interactive clarification and decision-making.
 */
export class AskUserQuestionTool extends BaseDeclarativeTool<
  AskUserQuestionParams,
  ToolResult
> {
  constructor(_config: Config, messageBus?: MessageBus) {
    super(
      ASK_USER_QUESTION_TOOL_NAME,
      'Ask User Question',
      DESCRIPTION,
      Kind.Think,
      zodToJsonSchema(AskUserQuestionParamsSchema),
      /* isOutputMarkdown */ false,
      /* canUpdateOutput */ false,
      messageBus,
    );
  }

  protected createInvocation(
    params: AskUserQuestionParams,
  ): AskUserQuestionInvocation {
    return new AskUserQuestionInvocation(params, this.messageBus);
  }
}

/**
 * Invocation instance for ask_user_question tool.
 * Handles user interaction via MESSAGE_BUS.
 */
class AskUserQuestionInvocation extends BaseToolInvocation<
  AskUserQuestionParams,
  ToolResult
> {
  constructor(params: AskUserQuestionParams, messageBus?: MessageBus) {
    super(params, messageBus, ASK_USER_QUESTION_TOOL_NAME);
  }

  getDescription(): string {
    const questionCount = this.params.questions.length;
    const firstQuestion = this.params.questions[0];
    return questionCount === 1
      ? `Asking user: ${firstQuestion.header} - ${firstQuestion.question.slice(0, 60)}${firstQuestion.question.length > 60 ? '...' : ''}`
      : `Asking user ${questionCount} questions: ${this.params.questions.map((q) => q.header).join(', ')}`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    if (!this.messageBus) {
      return {
        llmContent: 'Error: Cannot ask user questions in non-interactive mode.',
        returnDisplay: 'Error: ask_user_question requires interactive mode',
        error: {
          message: 'Non-interactive mode does not support user questions',
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }

    try {
      const answers = await this.requestUserInput(
        this.params.questions,
        signal,
      );

      // Format for LLM
      const llmContent = this.formatAnswersForLLM(answers);
      const displayContent = this.formatAnswersForDisplay(answers);

      return {
        llmContent: [{ text: llmContent }],
        returnDisplay: displayContent,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        llmContent: `Failed to get user response: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }

  /**
   * Request user input via MESSAGE_BUS.
   * Returns a promise that resolves when user completes all questions.
   */
  private async requestUserInput(
    questions: Question[],
    signal: AbortSignal,
  ): Promise<Record<string, string | string[]>> {
    return new Promise((resolve, reject) => {
      const correlationId = randomUUID();
      let responseReceived = false;

      // Handle abort
      const abortHandler = () => {
        if (!responseReceived) {
          reject(new Error('User question request aborted'));
        }
      };
      signal.addEventListener('abort', abortHandler);

      // Subscribe to response
      const responseHandler = (response: AskUserQuestionResponse) => {
        if (response.correlationId === correlationId) {
          responseReceived = true;
          signal.removeEventListener('abort', abortHandler);
          this.messageBus!.unsubscribe(
            MessageBusType.ASK_USER_QUESTION_RESPONSE,
            responseHandler,
          );
          resolve(response.answers);
        }
      };

      this.messageBus!.subscribe<AskUserQuestionResponse>(
        MessageBusType.ASK_USER_QUESTION_RESPONSE,
        responseHandler,
      );

      // Publish request
      const request: AskUserQuestionRequest = {
        type: MessageBusType.ASK_USER_QUESTION_REQUEST,
        correlationId,
        questions,
      };

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.messageBus!.publish(request);
    });
  }

  /**
   * Format answers for LLM consumption.
   */
  private formatAnswersForLLM(
    answers: Record<string, string | string[]>,
  ): string {
    return JSON.stringify({ answers }, null, 2);
  }

  /**
   * Format answers for display to user.
   */
  private formatAnswersForDisplay(
    answers: Record<string, string | string[]>,
  ): string {
    const lines = ['User Responses:'];

    for (const [questionId, answer] of Object.entries(answers)) {
      const questionIndex =
        parseInt(questionId.replace('question_', ''), 10) - 1;
      const question = this.params.questions[questionIndex];

      if (Array.isArray(answer)) {
        lines.push(`  ${question.header}: ${answer.join(', ')}`);
      } else {
        lines.push(`  ${question.header}: ${answer}`);
      }
    }

    return lines.join('\n');
  }
}
