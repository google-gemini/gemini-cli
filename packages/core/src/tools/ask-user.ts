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
  type ToolAskUserConfirmationDetails,
  type ToolConfirmationPayload,
  ToolConfirmationOutcome,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { QuestionType, type Question } from '../confirmation-bus/types.js';
import { ASK_USER_TOOL_NAME, ASK_USER_DISPLAY_NAME } from './tool-names.js';

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
      ASK_USER_DISPLAY_NAME,
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
                  default: 'choice',
                  description:
                    "Question type: 'choice' (default) for multiple-choice with options, 'text' for free-form input, 'yesno' for Yes/No confirmation.",
                },
                options: {
                  type: 'array',
                  description:
                    "The selectable choices for 'choice' type questions. Provide 2-4 options. An 'Other' option is automatically added. Not needed for 'text' or 'yesno' types.",
                  items: {
                    type: 'object',
                    required: ['label', 'description'],
                    properties: {
                      label: {
                        type: 'string',
                        description:
                          'The display text for this option (1-5 words). Example: "OAuth 2.0"',
                      },
                      description: {
                        type: 'string',
                        description:
                          'Brief explanation of this option. Example: "Industry standard, supports SSO"',
                      },
                    },
                  },
                },
                multiSelect: {
                  type: 'boolean',
                  description:
                    "Only applies when type='choice'. Set to true to allow selecting multiple options.",
                },
                placeholder: {
                  type: 'string',
                  description:
                    "Only applies when type='text'. Hint text shown in the input field.",
                },
              },
            },
          },
        },
      },
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: AskUserParams,
  ): string | null {
    if (!params.questions || params.questions.length === 0) {
      return 'At least one question is required.';
    }

    for (let i = 0; i < params.questions.length; i++) {
      const q = params.questions[i];
      const questionType = q.type ?? QuestionType.CHOICE;

      // Validate that 'choice' type has options
      if (questionType === QuestionType.CHOICE) {
        if (!q.options || q.options.length < 2) {
          return `Question ${i + 1}: type='choice' requires 'options' array with 2-4 items.`;
        }
        if (q.options.length > 4) {
          return `Question ${i + 1}: 'options' array must have at most 4 items.`;
        }
      }

      // Validate option structure if provided
      if (q.options) {
        for (let j = 0; j < q.options.length; j++) {
          const opt = q.options[j];
          if (
            !opt.label ||
            typeof opt.label !== 'string' ||
            !opt.label.trim()
          ) {
            return `Question ${i + 1}, option ${j + 1}: 'label' is required and must be a non-empty string.`;
          }
          if (
            opt.description === undefined ||
            typeof opt.description !== 'string'
          ) {
            return `Question ${i + 1}, option ${j + 1}: 'description' is required and must be a string.`;
          }
        }
      }
    }

    return null;
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
  private confirmationOutcome: ToolConfirmationOutcome | null = null;
  private userAnswers: { [questionIndex: string]: string } = {};

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolAskUserConfirmationDetails | false> {
    const normalizedQuestions = this.params.questions.map((q) => ({
      ...q,
      type: q.type ?? QuestionType.CHOICE,
    }));

    return {
      type: 'ask_user',
      title: 'Ask User',
      questions: normalizedQuestions,
      hideToolIdentity: true,
      onConfirm: async (
        outcome: ToolConfirmationOutcome,
        payload?: ToolConfirmationPayload,
      ) => {
        this.confirmationOutcome = outcome;
        if (payload?.answers) {
          this.userAnswers = payload.answers;
        }
      },
    };
  }

  getDescription(): string {
    return `Asking user: ${this.params.questions.map((q) => q.question).join(', ')}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    if (this.confirmationOutcome === ToolConfirmationOutcome.Cancel) {
      return {
        llmContent: 'User dismissed ask user dialog without answering.',
        returnDisplay: 'User dismissed dialog',
      };
    }

    const answerEntries = Object.entries(this.userAnswers);
    const hasAnswers = answerEntries.length > 0;

    const returnDisplay = hasAnswers
      ? `**User answered:**\n${answerEntries
          .map(([index, answer]) => {
            const question = this.params.questions[parseInt(index, 10)];
            const category = question?.header ?? `Q${index}`;
            return `  ${category} → ${answer}`;
          })
          .join('\n')}`
      : 'User submitted without answering questions.';

    return {
      llmContent: JSON.stringify({ answers: this.userAnswers }),
      returnDisplay,
    };
  }
}
