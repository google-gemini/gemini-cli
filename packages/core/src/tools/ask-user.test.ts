/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AskUserTool,
  isCompletedAskUserTool,
  type AskUserParams,
  type AskUserInvocation,
} from './ask-user.js';
import { QuestionType, type Question } from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { ASK_USER_DISPLAY_NAME } from './tool-names.js';

describe('AskUserTool Helpers', () => {
  describe('isCompletedAskUserTool', () => {
    it('returns false for non-AskUser tools', () => {
      expect(isCompletedAskUserTool('other-tool', 'Success')).toBe(false);
    });

    it('returns true for Success status', () => {
      expect(isCompletedAskUserTool(ASK_USER_DISPLAY_NAME, 'Success')).toBe(
        true,
      );
    });

    it('returns true for Error status', () => {
      expect(isCompletedAskUserTool(ASK_USER_DISPLAY_NAME, 'Error')).toBe(true);
    });

    it('returns true for Canceled status', () => {
      expect(isCompletedAskUserTool(ASK_USER_DISPLAY_NAME, 'Canceled')).toBe(
        true,
      );
    });

    it('returns false for in-progress statuses', () => {
      expect(isCompletedAskUserTool(ASK_USER_DISPLAY_NAME, 'Executing')).toBe(
        false,
      );
      expect(isCompletedAskUserTool(ASK_USER_DISPLAY_NAME, 'Pending')).toBe(
        false,
      );
    });
  });
});

describe('AskUserTool', () => {
  let mockMessageBus: MessageBus;
  let tool: AskUserTool;

  beforeEach(() => {
    mockMessageBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
    tool = new AskUserTool(mockMessageBus);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('ask_user');
    expect(tool.displayName).toBe('Ask User');
  });

  describe('createInvocation and normalization', () => {
    it('should unescape double-escaped newlines in question parameters', async () => {
      const params: AskUserParams = {
        questions: [
          {
            question: 'Line 1\\nLine 2',
            header: 'Header\\nTest',
            placeholder: 'Placeholder\\nTest',
            type: QuestionType.CHOICE,
            options: [
              { label: 'Option\\n1', description: 'Desc\\n1' },
              { label: 'Option\\n2', description: 'Desc\\n2' },
            ],
          },
        ],
      };

      const invocation = (
        tool as unknown as {
          createInvocation: (
            params: AskUserParams,
            messageBus: MessageBus,
            toolName: string,
            toolDisplayName: string,
          ) => AskUserInvocation;
        }
      ).createInvocation(params, mockMessageBus, 'ask_user', 'Ask User');
      const details = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      if (!details || details.type !== 'ask_user') {
        throw new Error('Expected ask_user details');
      }

      expect(details.questions[0].question).toBe('Line 1\nLine 2');
      expect(details.questions[0].header).toBe('Header\nTest');
      expect(details.questions[0].placeholder).toBe('Placeholder\nTest');
      expect(details.questions[0].options?.[0].label).toBe('Option\n1');
      expect(details.questions[0].options?.[0].description).toBe('Desc\n1');
    });

    it('should handle carriage returns and literal newlines', async () => {
      const params: AskUserParams = {
        questions: [
          {
            question: 'Line 1\\r\\nLine 2\nLine 3',
            header: 'Header',
            type: QuestionType.TEXT,
          },
        ],
      };
      const invocation = (
        tool as unknown as {
          createInvocation: (
            params: AskUserParams,
            messageBus: MessageBus,
            toolName: string,
            toolDisplayName: string,
          ) => AskUserInvocation;
        }
      ).createInvocation(params, mockMessageBus, 'ask_user', 'Ask User');
      const details = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      if (!details || details.type !== 'ask_user') {
        throw new Error('Expected ask_user details');
      }

      expect(details.questions[0].question).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  describe('validateToolParams', () => {
    it('should return error if questions is missing', () => {
      // @ts-expect-error - Intentionally invalid params
      const result = tool.validateToolParams({});
      expect(result).toContain("must have required property 'questions'");
    });

    it('should return error if questions array is empty', () => {
      const result = tool.validateToolParams({ questions: [] });
      expect(result).toContain('must NOT have fewer than 1 items');
    });

    it('should return error if questions array exceeds max', () => {
      const questions = Array(5).fill({
        question: 'Test?',
        header: 'Test',
        type: QuestionType.CHOICE,
        options: [
          { label: 'A', description: 'A' },
          { label: 'B', description: 'B' },
        ],
      });
      const result = tool.validateToolParams({ questions });
      expect(result).toContain('must NOT have more than 4 items');
    });

    it('should return error if question field is missing', () => {
      const result = tool.validateToolParams({
        questions: [{ header: 'Test' } as unknown as Question],
      });
      expect(result).toContain("must have required property 'question'");
    });

    it('should return error if header field is missing', () => {
      const result = tool.validateToolParams({
        questions: [{ question: 'Test?' } as unknown as Question],
      });
      expect(result).toContain("must have required property 'header'");
    });

    it('should return error if options has fewer than 2 items', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Test?',
            header: 'Test',
            type: QuestionType.CHOICE,
            options: [{ label: 'A', description: 'A' }],
          },
        ],
      });
      expect(result).toContain(
        "type='choice' requires 'options' array with 2-4 items",
      );
    });

    it('should return error if options has more than 4 items', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Test?',
            header: 'Test',
            type: QuestionType.CHOICE,
            options: [
              { label: 'A', description: 'A' },
              { label: 'B', description: 'B' },
              { label: 'C', description: 'C' },
              { label: 'D', description: 'D' },
              { label: 'E', description: 'E' },
            ],
          },
        ],
      });
      expect(result).toContain("'options' array must have at most 4 items");
    });

    it('should return null for valid params', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Which approach?',
            header: 'Approach',
            type: QuestionType.CHOICE,
            options: [
              { label: 'A', description: 'Option A' },
              { label: 'B', description: 'Option B' },
            ],
          },
        ],
      });
      expect(result).toBeNull();
    });

    it('should return error if choice type has no options', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Pick one?',
            header: 'Choice',
            type: QuestionType.CHOICE,
          },
        ],
      });
      expect(result).toContain("type='choice' requires 'options'");
    });

    it('should return error if type is missing', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Pick one?',
            header: 'Choice',
          } as unknown as Question,
        ],
      });
      expect(result).toContain("must have required property 'type'");
    });

    it('should accept text type without options', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Enter your name?',
            header: 'Name',
            type: QuestionType.TEXT,
          },
        ],
      });
      expect(result).toBeNull();
    });

    it('should accept yesno type without options', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Do you want to proceed?',
            header: 'Confirm',
            type: QuestionType.YESNO,
          },
        ],
      });
      expect(result).toBeNull();
    });

    it('should accept placeholder for choice type', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Which language?',
            header: 'Language',
            type: QuestionType.CHOICE,
            options: [
              { label: 'TypeScript', description: 'Typed JavaScript' },
              { label: 'JavaScript', description: 'Dynamic language' },
            ],
            placeholder: 'Type another language...',
          },
        ],
      });
      expect(result).toBeNull();
    });

    it('should return error if option has empty label', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Pick one?',
            header: 'Choice',
            type: QuestionType.CHOICE,
            options: [
              { label: '', description: 'Empty label' },
              { label: 'B', description: 'Option B' },
            ],
          },
        ],
      });
      expect(result).toContain("'label' is required");
    });

    it('should return error if option is missing description', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Pick one?',
            header: 'Choice',
            type: QuestionType.CHOICE,
            options: [
              { label: 'A' } as { label: string; description: string },
              { label: 'B', description: 'Option B' },
            ],
          },
        ],
      });
      expect(result).toContain("must have required property 'description'");
    });
  });

  describe('validateBuildAndExecute', () => {
    it('should hide validation errors from returnDisplay', async () => {
      const params = {
        questions: [],
      };

      const result = await tool.validateBuildAndExecute(
        params,
        new AbortController().signal,
      );

      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe(ToolErrorType.INVALID_TOOL_PARAMS);
      expect(result.returnDisplay).toBe('');
    });

    it('should NOT hide non-validation errors (if any were to occur)', async () => {
      const validateParamsSpy = vi
        .spyOn(tool, 'validateToolParams')
        .mockReturnValue(null);

      const params = {
        questions: [
          { question: 'Valid?', header: 'Valid', type: QuestionType.TEXT },
        ],
      };

      const mockInvocation = {
        execute: vi.fn().mockRejectedValue(new Error('Some execution error')),
        params,
        getDescription: vi.fn().mockReturnValue(''),
        toolLocations: vi.fn().mockReturnValue([]),
        shouldConfirmExecute: vi.fn().mockResolvedValue(false),
      };

      const buildSpy = vi.spyOn(tool, 'build').mockReturnValue(mockInvocation);

      const result = await tool.validateBuildAndExecute(
        params,
        new AbortController().signal,
      );

      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
      expect(result.returnDisplay).toBe('Some execution error');

      buildSpy.mockRestore();
      validateParamsSpy.mockRestore();
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should return confirmation details with normalized questions', async () => {
      const questions: Question[] = [
        {
          question: 'How should we proceed with this task?',
          header: 'Approach',
          type: QuestionType.CHOICE,
          options: [
            {
              label: 'Quick fix (Recommended)',
              description:
                'Apply the most direct solution to resolve the immediate issue.',
            },
            {
              label: 'Comprehensive refactor',
              description:
                'Restructure the affected code for better long-term maintainability.',
            },
          ],
          multiSelect: false,
        },
      ];

      const invocation = tool.build({ questions });
      const details = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(details).not.toBe(false);
      if (details && details.type === 'ask_user') {
        expect(details.title).toBe('Ask User');
        expect(details.questions).toEqual(questions);
        expect(typeof details.onConfirm).toBe('function');
      } else {
        // Type guard for TypeScript
        expect(details).toBeTruthy();
      }
    });

    it('should use provided question type', async () => {
      const questions: Question[] = [
        {
          question: 'Which approach?',
          header: 'Approach',
          type: QuestionType.CHOICE,
          options: [
            { label: 'Option A', description: 'First option' },
            { label: 'Option B', description: 'Second option' },
          ],
        },
      ];

      const invocation = tool.build({ questions });
      const details = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      if (details && details.type === 'ask_user') {
        expect(details.questions[0].type).toBe(QuestionType.CHOICE);
      }
    });
  });

  describe('execute', () => {
    it('should return user answers after confirmation', async () => {
      const questions: Question[] = [
        {
          question: 'How should we proceed with this task?',
          header: 'Approach',
          type: QuestionType.CHOICE,
          options: [
            {
              label: 'Quick fix (Recommended)',
              description:
                'Apply the most direct solution to resolve the immediate issue.',
            },
            {
              label: 'Comprehensive refactor',
              description:
                'Restructure the affected code for better long-term maintainability.',
            },
          ],
          multiSelect: false,
        },
      ];

      const invocation = tool.build({ questions });
      const details = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      // Simulate confirmation with answers
      if (details && 'onConfirm' in details) {
        const answers = { '0': 'Quick fix (Recommended)' };
        await details.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
          answers,
        });
      }

      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toBe(
        '**User answered:**\n' +
          '  Approach: How should we proceed with this task?\n' +
          '    → Quick fix (Recommended)',
      );
      expect(JSON.parse(result.llmContent as string)).toEqual({
        answers: { '0': 'Quick fix (Recommended)' },
      });
      expect(result.data).toEqual({
        ask_user: {
          question_types: [QuestionType.CHOICE],
          dismissed: false,
          empty_submission: false,
          answer_count: 1,
        },
      });
    });

    it('should retain the question text in returnDisplay after answering (#29021)', async () => {
      // Regression test: once the dialog closes, the tool description is hidden
      // in the UI, so the result display is the only place the question survives.
      const questionText =
        'The subagent failed because the build step timed out. Would you like to retry it?';
      const invocation = tool.build({
        questions: [
          {
            question: questionText,
            header: 'Retry Subagent',
            type: QuestionType.YESNO,
          },
        ],
      });
      const details = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      if (details && 'onConfirm' in details) {
        await details.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
          answers: { '0': 'Yes' },
        });
      }

      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toContain(questionText);
      expect(result.returnDisplay).toContain('Yes');
    });

    describe('returnDisplay formatting', () => {
      const answerAndExecute = async (
        questions: Question[],
        answers: { [questionIndex: string]: string },
      ) => {
        const invocation = tool.build({ questions });
        const details = await invocation.shouldConfirmExecute(
          new AbortController().signal,
        );
        if (details && 'onConfirm' in details) {
          await details.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
            answers,
          });
        }
        return invocation.execute({
          abortSignal: new AbortController().signal,
        });
      };

      it('should pair each question with its answer, in order', async () => {
        const result = await answerAndExecute(
          [
            {
              question: 'Which database would you like to use?',
              header: 'Database',
              type: QuestionType.CHOICE,
              options: [
                { label: 'PostgreSQL', description: 'Relational' },
                { label: 'SQLite', description: 'Embedded' },
              ],
            },
            {
              question: 'What is the name of your new project?',
              header: 'Project Name',
              type: QuestionType.TEXT,
            },
          ],
          { '0': 'PostgreSQL', '1': 'my-app' },
        );

        expect(result.returnDisplay).toBe(
          '**User answered:**\n' +
            '  Database: Which database would you like to use?\n' +
            '    → PostgreSQL\n' +
            '  Project Name: What is the name of your new project?\n' +
            '    → my-app',
        );
      });

      it('should align continuation lines of multi-line answers under the answer', async () => {
        const result = await answerAndExecute(
          [
            {
              question: 'Any additional feedback?',
              header: 'Feedback',
              type: QuestionType.TEXT,
            },
          ],
          { '0': 'First line\nSecond line' },
        );

        expect(result.returnDisplay).toBe(
          '**User answered:**\n' +
            '  Feedback: Any additional feedback?\n' +
            '    → First line\n' +
            '      Second line',
        );
      });

      it('should indent continuation lines of multi-line questions', async () => {
        const result = await answerAndExecute(
          [
            {
              question: 'The build failed.\nRetry it?',
              header: 'Retry',
              type: QuestionType.YESNO,
            },
          ],
          { '0': 'Yes' },
        );

        expect(result.returnDisplay).toBe(
          '**User answered:**\n' +
            '  Retry: The build failed.\n' +
            '  Retry it?\n' +
            '    → Yes',
        );
      });

      it('should fall back to a positional label when an answer has no matching question', async () => {
        const result = await answerAndExecute(
          [
            {
              question: 'Proceed?',
              header: 'Confirm',
              type: QuestionType.YESNO,
            },
          ],
          { '0': 'Yes', '5': 'Orphaned answer' },
        );

        expect(result.returnDisplay).toBe(
          '**User answered:**\n' +
            '  Confirm: Proceed?\n' +
            '    → Yes\n' +
            '  Q5\n' +
            '    → Orphaned answer',
        );
      });

      it('should fall back to a positional label when the header is whitespace-only', async () => {
        const result = await answerAndExecute(
          [
            {
              question: 'Proceed?',
              header: '   ',
              type: QuestionType.YESNO,
            },
          ],
          { '0': 'Yes' },
        );

        expect(result.returnDisplay).toBe(
          '**User answered:**\n  Q0: Proceed?\n    → Yes',
        );
      });

      it('should not crash when an answer value is not a string at runtime', async () => {
        const result = await answerAndExecute(
          [
            {
              question: 'Proceed?',
              header: 'Confirm',
              type: QuestionType.YESNO,
            },
          ],
          { '0': undefined as unknown as string },
        );

        expect(result.returnDisplay).toBe(
          '**User answered:**\n  Confirm: Proceed?\n    → ',
        );
      });
    });

    it('should display message when user submits without answering', async () => {
      const questions: Question[] = [
        {
          question: 'Which approach?',
          header: 'Approach',
          type: QuestionType.CHOICE,
          options: [
            { label: 'Option A', description: 'First option' },
            { label: 'Option B', description: 'Second option' },
          ],
        },
      ];

      const invocation = tool.build({ questions });
      const details = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      // Simulate confirmation with empty answers
      if (details && 'onConfirm' in details) {
        await details.onConfirm(ToolConfirmationOutcome.ProceedOnce, {
          answers: {},
        });
      }

      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toBe(
        'User submitted without answering questions.',
      );
      expect(JSON.parse(result.llmContent as string)).toEqual({ answers: {} });
      expect(result.data).toEqual({
        ask_user: {
          question_types: [QuestionType.CHOICE],
          dismissed: false,
          empty_submission: true,
          answer_count: 0,
        },
      });
    });

    it('should handle cancellation', async () => {
      const invocation = tool.build({
        questions: [
          {
            question: 'Which sections of the documentation should be updated?',
            header: 'Docs',
            type: QuestionType.CHOICE,
            options: [
              {
                label: 'User Guide',
                description: 'Update the main user-facing documentation.',
              },
              {
                label: 'API Reference',
                description: 'Update the detailed API documentation.',
              },
            ],
            multiSelect: true,
          },
        ],
      });

      const details = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      // Simulate cancellation
      if (details && 'onConfirm' in details) {
        await details.onConfirm(ToolConfirmationOutcome.Cancel);
      }

      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toBe('User dismissed dialog');
      expect(result.llmContent).toBe(
        'User dismissed ask_user dialog without answering.',
      );
      expect(result.data).toEqual({
        ask_user: {
          question_types: [QuestionType.CHOICE],
          dismissed: true,
        },
      });
    });
  });
});
