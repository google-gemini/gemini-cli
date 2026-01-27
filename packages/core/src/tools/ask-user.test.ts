/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AskUserTool } from './ask-user.js';
import {
  MessageBusType,
  QuestionType,
  type Question,
} from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

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
        questions: [{ question: 'Test?', header: 'This is way too long' }],
      });
      expect(result).toContain('must NOT have more than 12 characters');
    });

    it('should return error if options has fewer than 2 items', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Test?',
            header: 'Test',
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

    it('should return error if type is omitted and options missing (defaults to choice)', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Pick one?',
            header: 'Choice',
            // type omitted, defaults to 'choice'
            // options missing
          },
        ],
      });
      expect(result).toContain("type='choice' requires 'options'");
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

    it('should return error if option has empty label', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Pick one?',
            header: 'Choice',
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

  it('should publish ASK_USER_REQUEST and wait for response', async () => {
    const questions = [
      {
        question: 'How should we proceed with this task?',
        header: 'Approach',
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
    const executePromise = invocation.execute(new AbortController().signal);

    // Verify publish called with normalized questions (type defaults to CHOICE)
    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.ASK_USER_REQUEST,
        questions: questions.map((q) => ({
          ...q,
          type: QuestionType.CHOICE,
        })),
      }),
    );

    // Get the correlation ID from the published message
    const publishCall = vi.mocked(mockMessageBus.publish).mock.calls[0][0] as {
      correlationId: string;
    };
    const correlationId = publishCall.correlationId;
    expect(correlationId).toBeDefined();

    // Verify subscribe called
    expect(mockMessageBus.subscribe).toHaveBeenCalledWith(
      MessageBusType.ASK_USER_RESPONSE,
      expect.any(Function),
    );

    // Simulate response
    const subscribeCall = vi
      .mocked(mockMessageBus.subscribe)
      .mock.calls.find((call) => call[0] === MessageBusType.ASK_USER_RESPONSE);
    const handler = subscribeCall![1];

    const answers = { '0': 'Quick fix (Recommended)' };
    handler({
      type: MessageBusType.ASK_USER_RESPONSE,
      correlationId,
      answers,
    });

    const result = await executePromise;
    expect(result.returnDisplay).toContain('User answered:');
    expect(result.returnDisplay).toContain(
      '  Approach → Quick fix (Recommended)',
    );
    expect(JSON.parse(result.llmContent as string)).toEqual({ answers });
  });

  it('should display message when user submits without answering', async () => {
    const questions = [
      {
        question: 'Which approach?',
        header: 'Approach',
        options: [
          { label: 'Option A', description: 'First option' },
          { label: 'Option B', description: 'Second option' },
        ],
      },
    ];

    const invocation = tool.build({ questions });
    const executePromise = invocation.execute(new AbortController().signal);

    // Get the correlation ID from the published message
    const publishCall = vi.mocked(mockMessageBus.publish).mock.calls[0][0] as {
      correlationId: string;
    };
    const correlationId = publishCall.correlationId;

    // Simulate response with empty answers
    const subscribeCall = vi
      .mocked(mockMessageBus.subscribe)
      .mock.calls.find((call) => call[0] === MessageBusType.ASK_USER_RESPONSE);
    const handler = subscribeCall![1];

    handler({
      type: MessageBusType.ASK_USER_RESPONSE,
      correlationId,
      answers: {},
    });

    const result = await executePromise;
    expect(result.returnDisplay).toBe(
      'User submitted without answering questions.',
    );
    expect(JSON.parse(result.llmContent as string)).toEqual({ answers: {} });
  });

  it('should handle cancellation', async () => {
    const invocation = tool.build({
      questions: [
        {
          question: 'Which sections of the documentation should be updated?',
          header: 'Docs',
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

    const controller = new AbortController();
    const executePromise = invocation.execute(controller.signal);

    controller.abort();

    const result = await executePromise;
    expect(result.error?.message).toBe('Cancelled');
  });
});
