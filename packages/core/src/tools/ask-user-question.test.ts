/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AskUserQuestionTool } from './ask-user-question.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

describe('AskUserQuestionTool', () => {
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    mockMessageBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
  });

  it('should have correct metadata', () => {
    const tool = new AskUserQuestionTool(mockMessageBus);
    expect(tool.name).toBe('ask_user_question');
    expect(tool.displayName).toBe('Ask User Question');
  });

  it('should publish ASK_USER_QUESTION_REQUEST and wait for response', async () => {
    const tool = new AskUserQuestionTool(mockMessageBus);
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

    // Verify publish called
    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.ASK_USER_QUESTION_REQUEST,
        questions,
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
      MessageBusType.ASK_USER_QUESTION_RESPONSE,
      expect.any(Function),
    );

    // Simulate response
    const subscribeCall = vi
      .mocked(mockMessageBus.subscribe)
      .mock.calls.find(
        (call) => call[0] === MessageBusType.ASK_USER_QUESTION_RESPONSE,
      );
    const handler = subscribeCall![1];

    const answers = { '0': 'Quick fix (Recommended)' };
    handler({
      type: MessageBusType.ASK_USER_QUESTION_RESPONSE,
      correlationId,
      answers,
    });

    const result = await executePromise;
    expect(result.returnDisplay).toContain('User answered');
    expect(JSON.parse(result.llmContent as string)).toEqual({ answers });
  });

  it('should handle cancellation', async () => {
    const tool = new AskUserQuestionTool(mockMessageBus);
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
