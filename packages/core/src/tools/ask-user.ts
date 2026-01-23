/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  type ToolResult,
  Kind,
  type ToolCallConfirmationDetails,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  QuestionType,
  type Question,
  type AskUserRequest,
  type AskUserResponse,
} from '../confirmation-bus/types.js';
import { randomUUID } from 'node:crypto';
import { ASK_USER_TOOL_NAME } from './tool-names.js';

export interface AskUserParams {
  questions: Question[];
}

export class AskUserTool extends BaseDeclarativeTool<
  AskUserParams,
  ToolResult
> {
  constructor(messageBus: MessageBus) {
    super(
      ASK_USER_TOOL_NAME,
      'Ask User',
      'Ask the user one or more questions to gather preferences, clarify requirements, or make decisions.',
      Kind.Communicate,
      {
        type: 'object',
        required: ['questions'],
        properties: {
          questions: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            items: {
              type: 'object',
              required: ['question', 'header'],
              properties: {
                question: {
                  type: 'string',
                  description:
                    'The complete question to ask the user. Should be clear, specific, and end with a question mark.',
                },
                header: {
                  type: 'string',
                  maxLength: 12,
                  description:
                    'Very short label displayed as a chip/tag (max 12 chars). Examples: "Auth method", "Library", "Approach".',
                },
                type: {
                  type: 'string',
                  enum: ['choice', 'text', 'yesno'],
                  description:
                    "Question type. 'choice' (default) shows selectable options, 'text' shows a free-form text input, 'yesno' shows a binary Yes/No choice.",
                },
                options: {
                  type: 'array',
                  description:
                    "Required for 'choice' type, ignored for 'text' and 'yesno'. The available choices (2-4 options). Do NOT include an 'Other' option - one is automatically added for 'choice' type.",
                  minItems: 2,
                  maxItems: 4,
                  items: {
                    type: 'object',
                    required: ['label', 'description'],
                    properties: {
                      label: {
                        type: 'string',
                        description:
                          'The display text for this option that the user will see and select. Should be concise (1-5 words) and clearly describe the choice.',
                      },
                      description: {
                        type: 'string',
                        description:
                          'Explanation of what this option means or what will happen if chosen. Useful for providing context about trade-offs or implications.',
                      },
                    },
                  },
                },
                multiSelect: {
                  type: 'boolean',
                  description:
                    "Only applies to 'choice' type. Set to true to allow multiple selections.",
                },
                placeholder: {
                  type: 'string',
                  description:
                    "Optional hint text for 'text' type input field.",
                },
              },
            },
          },
        },
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: AskUserParams,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
  ): AskUserInvocation {
    return new AskUserInvocation(params, messageBus, toolName, toolDisplayName);
  }
}

export class AskUserInvocation extends BaseToolInvocation<
  AskUserParams,
  ToolResult
> {
  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return false;
  }

  getDescription(): string {
    return `Asking user: ${this.params.questions.map((q) => q.question).join(', ')}`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const correlationId = randomUUID();

    const request: AskUserRequest = {
      type: MessageBusType.ASK_USER_REQUEST,
      questions: this.params.questions.map((q) => ({
        ...q,
        type: q.type ?? QuestionType.CHOICE,
      })),
      correlationId,
    };

    return new Promise<ToolResult>((resolve, reject) => {
      const responseHandler = (response: AskUserResponse): void => {
        if (response.correlationId === correlationId) {
          cleanup();

          // Build formatted key-value display
          const formattedAnswers = Object.entries(response.answers)
            .map(([index, answer]) => {
              const question = this.params.questions[parseInt(index, 10)];
              const category = question?.header ?? `Q${index}`;
              return `  ${category} → ${answer}`;
            })
            .join('\n');

          const returnDisplay = `User answered:\n${formattedAnswers}`;

          resolve({
            llmContent: JSON.stringify({ answers: response.answers }),
            returnDisplay,
          });
        }
      };

      const cleanup = () => {
        if (responseHandler) {
          this.messageBus.unsubscribe(
            MessageBusType.ASK_USER_RESPONSE,
            responseHandler,
          );
        }
        signal.removeEventListener('abort', abortHandler);
      };

      const abortHandler = () => {
        cleanup();
        resolve({
          llmContent: 'Tool execution cancelled by user.',
          returnDisplay: 'Cancelled',
          error: {
            message: 'Cancelled',
          },
        });
      };

      if (signal.aborted) {
        abortHandler();
        return;
      }

      signal.addEventListener('abort', abortHandler);
      this.messageBus.subscribe(
        MessageBusType.ASK_USER_RESPONSE,
        responseHandler,
      );

      // Publish request
      this.messageBus.publish(request).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }
}
