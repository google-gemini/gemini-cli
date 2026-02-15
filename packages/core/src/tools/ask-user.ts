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
import { ToolErrorType } from './tool-error.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { QuestionType, type Question } from '../confirmation-bus/types.js';
import { ASK_USER_TOOL_NAME, ASK_USER_DISPLAY_NAME } from './tool-names.js';
import { ASK_USER_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

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
      ASK_USER_DEFINITION.base.description!,
      Kind.Communicate,
      ASK_USER_DEFINITION.base.parametersJsonSchema,
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
      const questionType = q.type;

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

  override async validateBuildAndExecute(
    params: AskUserParams,
    abortSignal: AbortSignal,
  ): Promise<ToolResult> {
    const result = await super.validateBuildAndExecute(params, abortSignal);
    if (
      result.error &&
      result.error.type === ToolErrorType.INVALID_TOOL_PARAMS
    ) {
      return {
        ...result,
        returnDisplay: '',
      };
    }
    return result;
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(ASK_USER_DEFINITION, modelId);
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
      type: q.type,
    }));

    return {
      type: 'ask_user',
      title: 'Ask User',
      questions: normalizedQuestions,
      onConfirm: async (
        outcome: ToolConfirmationOutcome,
        payload?: ToolConfirmationPayload,
      ) => {
        this.confirmationOutcome = outcome;
        if (payload && 'answers' in payload) {
          this.userAnswers = payload.answers;
        }
      },
    };
  }

  getDescription(): string {
    return `Asking user: ${this.params.questions.map((q) => q.question).join(', ')}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const questionTypes = this.params.questions.map((q) => q.type);

    if (this.confirmationOutcome === ToolConfirmationOutcome.Cancel) {
      return {
        llmContent: 'User dismissed ask_user dialog without answering.',
        returnDisplay: 'User dismissed dialog',
        data: {
          ask_user: {
            question_types: questionTypes,
            dismissed: true,
          },
        },
      };
    }

    const answerEntries = Object.entries(this.userAnswers);
    const hasAnswers = answerEntries.length > 0;

    const metrics: Record<string, unknown> = {
      ask_user: {
        question_types: questionTypes,
        dismissed: false,
        empty_submission: !hasAnswers,
        answer_count: answerEntries.length,
      },
    };

    const returnDisplay = hasAnswers
      ? `**User answered:**\n${answerEntries
          .map(([index, answer]) => {
            const question = this.params.questions[parseInt(index, 10)];
            const category = question?.header ?? `Q${index}`;
            const prefix = `  ${category} → `;
            const indent = ' '.repeat(prefix.length);

            const lines = answer.split('\n');
            return prefix + lines.join('\n' + indent);
          })
          .join('\n')}`
      : 'User submitted without answering questions.';

    return {
      llmContent: JSON.stringify({ answers: this.userAnswers }),
      returnDisplay,
      data: metrics,
    };
  }
}

/**
 * Returns true if the tool name and status correspond to a completed 'Ask User' tool call.
 */
export function isCompletedAskUserTool(name: string, status: string): boolean {
  return (
    name === ASK_USER_DISPLAY_NAME &&
    ['Success', 'Error', 'Canceled'].includes(status)
  );
}
