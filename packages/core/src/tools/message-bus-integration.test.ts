/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest';
import {
  BaseToolInvocation,
  BaseDeclarativeTool,
  Kind,
  type ToolResult,
} from './tools.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import {
  MessageBusType,
  type ToolConfirmationResponse,
} from '../confirmation-bus/types.js';
import { randomUUID } from 'node:crypto';

// Mock crypto module
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
}));

interface TestParams {
  testParam: string;
}

interface TestResult extends ToolResult {
  testValue: string;
}

class TestToolInvocation extends BaseToolInvocation<TestParams, TestResult> {
  getDescription(): string {
    return `Test tool with param: ${this.params.testParam}`;
  }

  async execute(): Promise<TestResult> {
    return {
      llmContent: `Executed with ${this.params.testParam}`,
      returnDisplay: `Test result: ${this.params.testParam}`,
      testValue: this.params.testParam,
    };
  }

  override async shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<false> {
    // This conditional is here to allow testing of the case where there is no message bus.
    if (this.messageBus) {
      const decision = await this.getMessageBusDecision(abortSignal);
      if (decision === 'ALLOW') {
        return false;
      }
      if (decision === 'DENY') {
        throw new Error('Tool execution denied by policy');
      }
    }
    return false;
  }
}

class TestTool extends BaseDeclarativeTool<TestParams, TestResult> {
  constructor(messageBus?: MessageBus) {
    super(
      'test-tool',
      'Test Tool',
      'A test tool for message bus integration',
      Kind.Other,
      {
        type: 'object',
        properties: {
          testParam: { type: 'string' },
        },
        required: ['testParam'],
      },
      true,
      false,
      messageBus,
    );
  }

  protected createInvocation(params: TestParams, messageBus?: MessageBus) {
    return new TestToolInvocation(params, messageBus);
  }
}

describe('Message Bus Integration', () => {
  let policyEngine: PolicyEngine;
  let messageBus: MessageBus;
  let mockUUID: Mock;

  beforeEach(() => {
    vi.resetAllMocks();
    policyEngine = new PolicyEngine();
    messageBus = new MessageBus(policyEngine);
    mockUUID = vi.mocked(randomUUID);
    mockUUID.mockReturnValue('test-correlation-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('BaseToolInvocation with MessageBus', () => {
    it('should use message bus for confirmation when available', async () => {
      const tool = new TestTool(messageBus);
      const invocation = tool.build({ testParam: 'test-value' });

      // Mock message bus publish and subscribe
      const publishSpy = vi.spyOn(messageBus, 'publish');
      const subscribeSpy = vi.spyOn(messageBus, 'subscribe');
      const unsubscribeSpy = vi.spyOn(messageBus, 'unsubscribe');

      // Start confirmation process
      const confirmationPromise = invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      // Verify confirmation request was published
      expect(publishSpy).toHaveBeenCalledWith({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: {
          name: 'TestToolInvocation',
          args: { testParam: 'test-value' },
        },
        correlationId: 'test-correlation-id',
      });

      // Verify subscription to response
      expect(subscribeSpy).toHaveBeenCalledWith(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        expect.any(Function),
      );

      // Simulate confirmation response
      const responseHandler = subscribeSpy.mock.calls[0][1];
      const response: ToolConfirmationResponse = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'test-correlation-id',
        confirmed: true,
      };

      responseHandler(response);

      const result = await confirmationPromise;
      expect(result).toBe(false); // No further confirmation needed
      expect(unsubscribeSpy).toHaveBeenCalled();
    });

    it('should reject promise when confirmation is denied', async () => {
      const tool = new TestTool(messageBus);
      const invocation = tool.build({ testParam: 'test-value' });

      const subscribeSpy = vi.spyOn(messageBus, 'subscribe');

      const confirmationPromise = invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      // Simulate denial response
      const responseHandler = subscribeSpy.mock.calls[0][1];
      const response: ToolConfirmationResponse = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'test-correlation-id',
        confirmed: false,
      };

      responseHandler(response);

      // Should reject with error when denied
      await expect(confirmationPromise).rejects.toThrow(
        'Tool execution denied by policy',
      );
    });

    it('should handle timeout', async () => {
      vi.useFakeTimers();

      const tool = new TestTool(messageBus);
      const invocation = tool.build({ testParam: 'test-value' });

      const confirmationPromise = invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      // Fast-forward past timeout
      vi.advanceTimersByTime(30000);

      const result = await confirmationPromise;
      expect(result).toBe(false);

      vi.useRealTimers();
    });

    it('should handle abort signal', async () => {
      const tool = new TestTool(messageBus);
      const invocation = tool.build({ testParam: 'test-value' });

      const abortController = new AbortController();
      const confirmationPromise = invocation.shouldConfirmExecute(
        abortController.signal,
      );

      // Abort the operation
      abortController.abort();

      await expect(confirmationPromise).rejects.toThrow(
        'Tool execution denied by policy',
      );
    });

    it('should fall back to default behavior when no message bus', async () => {
      const tool = new TestTool(); // No message bus
      const invocation = tool.build({ testParam: 'test-value' });

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(result).toBe(false);
    });

    it('should ignore responses with wrong correlation ID', async () => {
      vi.useFakeTimers();

      const tool = new TestTool(messageBus);
      const invocation = tool.build({ testParam: 'test-value' });

      const subscribeSpy = vi.spyOn(messageBus, 'subscribe');
      const confirmationPromise = invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      // Send response with wrong correlation ID
      const responseHandler = subscribeSpy.mock.calls[0][1];
      const wrongResponse: ToolConfirmationResponse = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'wrong-id',
        confirmed: true,
      };

      responseHandler(wrongResponse);

      // Should timeout since correct response wasn't received
      vi.advanceTimersByTime(30000);
      const result = await confirmationPromise;
      expect(result).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with existing tools that do not use message bus', async () => {
      const tool = new TestTool(); // No message bus
      const invocation = tool.build({ testParam: 'test-value' });

      // Should execute normally
      const result = await invocation.execute(new AbortController().signal);
      expect(result.testValue).toBe('test-value');
      expect(result.llmContent).toBe('Executed with test-value');
    });

    it('should work with tools that have message bus but use default confirmation', async () => {
      const tool = new TestTool(messageBus);
      const invocation = tool.build({ testParam: 'test-value' });

      // Should execute normally even with message bus available
      const result = await invocation.execute(new AbortController().signal);
      expect(result.testValue).toBe('test-value');
      expect(result.llmContent).toBe('Executed with test-value');
    });
  });

  describe('Error Handling', () => {
    it('should handle message bus publish errors gracefully', async () => {
      const tool = new TestTool(messageBus);
      const invocation = tool.build({ testParam: 'test-value' });

      // Mock publish to throw error
      vi.spyOn(messageBus, 'publish').mockImplementation(() => {
        throw new Error('Message bus error');
      });

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(result).toBe(false); // Should gracefully fall back
    });
  });
});
