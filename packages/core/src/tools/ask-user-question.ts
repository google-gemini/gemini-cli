/**
 * @license
 * Copyright 2025 Google LLC
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
  type Question,
  type AskUserQuestionRequest,
  type AskUserQuestionResponse,
} from '../confirmation-bus/types.js';
import { randomUUID } from 'node:crypto';
import { ASK_USER_QUESTION_TOOL_NAME } from './tool-names.js';

export interface AskUserQuestionParams {
  questions: Question[];
}

export class AskUserQuestionTool extends BaseDeclarativeTool<
  AskUserQuestionParams,
  ToolResult
> {
  constructor(messageBus: MessageBus) {
    super(
      ASK_USER_QUESTION_TOOL_NAME,
      'Ask User Question',
      'Ask the user one or more questions to gather preferences, clarify requirements, or make decisions.',
      Kind.Other,
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
              required: ['question', 'header', 'options', 'multiSelect'],
              properties: {
                question: {
                  type: 'string',
                  description:
                    'The complete question to ask the user. Should be clear, specific, and end with a question mark. Example: "Which library should we use for date formatting?" If multiSelect is true, phrase it accordingly, e.g. "Which features do you want to enable?"',
                },
                header: {
                  type: 'string',
                  description:
                    'Very short label displayed as a chip/tag (max 12 chars). Examples: "Auth method", "Library", "Approach".',
                },
                options: {
                  type: 'array',
                  description:
                    'The available choices for this question. MUST have exactly 2-4 options (no more, no less). If you have more than 4 choices, consolidate them or split into multiple questions. Do NOT include an "Other" option - one is automatically added by the UI.',
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
                    'Set to true to allow the user to select multiple options instead of just one. Use when choices are not mutually exclusive.',
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
    params: AskUserQuestionParams,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
  ): AskUserQuestionInvocation {
    return new AskUserQuestionInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
    );
  }
}

export class AskUserQuestionInvocation extends BaseToolInvocation<
  AskUserQuestionParams,
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

    const request: AskUserQuestionRequest = {
      type: MessageBusType.ASK_USER_QUESTION_REQUEST,
      questions: this.params.questions,
      correlationId,
    };

    return new Promise<ToolResult>((resolve, reject) => {
      const responseHandler = (response: AskUserQuestionResponse): void => {
        if (response.correlationId === correlationId) {
          cleanup();
          resolve({
            llmContent: JSON.stringify({ answers: response.answers }),
            returnDisplay: `User answered: ${JSON.stringify(response.answers)}`,
          });
        }
      };

      const cleanup = () => {
        if (responseHandler) {
          this.messageBus.unsubscribe(
            MessageBusType.ASK_USER_QUESTION_RESPONSE,
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
        MessageBusType.ASK_USER_QUESTION_RESPONSE,
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
