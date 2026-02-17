/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AskUserTool, isCompletedAskUserTool } from './ask-user.js';
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

    it('should return error if header exceeds max length', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Test?',
            header: 'This is way too long',
            type: QuestionType.CHOICE,
          },
        ],
      });
      expect(result).toContain('must NOT have more than 16 characters');
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
        questions: [
          {
            question: 'Test?',
            header: 'This is way too long',
            type: QuestionType.TEXT,
          },
        ],
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

      const result = await invocation.execute(new AbortController().signal);
      expect(result.returnDisplay).toContain('User answered:');
      expect(result.returnDisplay).toContain(
        '  Approach → Quick fix (Recommended)',
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

      const result = await invocation.execute(new AbortController().signal);
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

      const result = await invocation.execute(new AbortController().signal);
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
