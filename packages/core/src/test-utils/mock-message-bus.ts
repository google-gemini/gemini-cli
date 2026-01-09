/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type Message,
  type HookExecutionRequest,
  type HookExecutionResponse,
} from '../confirmation-bus/types.js';

/**
 * Mock MessageBus for testing hook execution through MessageBus
 */
export class MockMessageBus {
  private subscriptions = new Map<
    MessageBusType,
    Set<(message: Message) => void>
  >();
  publishedMessages: Message[] = [];
  hookRequests: HookExecutionRequest[] = [];
  hookResponses: HookExecutionResponse[] = [];
  defaultToolDecision: 'allow' | 'deny' | 'ask_user' = 'allow';

  /**
   * Mock request method (for hooks)
   */
  request = vi.fn(
    async <TRequest extends Message, TResponse extends Message>(
      message: TRequest,
    ): Promise<TResponse> => {
      this.publish(message);
      // Return a default success response
      return {
        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
        correlationId: message.correlationId,
        success: true,
        output: {
          decision: 'allow',
        },
      } as unknown as TResponse;
    },
  );

  /**
   * Mock publish method that captures messages and simulates responses
   */
  publish = vi.fn((message: Message) => {
    this.publishedMessages.push(message);

    // Capture hook-specific messages
    if (message.type === MessageBusType.HOOK_EXECUTION_REQUEST) {
      this.hookRequests.push(message);

      // Auto-respond with success for testing
      const response: HookExecutionResponse = {
        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
        correlationId: message.correlationId,
        success: true,
        output: {
          decision: 'allow',
          reason: 'Mock hook execution successful',
        },
      };
      this.hookResponses.push(response);

      // Emit response to subscribers
      this.emit(MessageBusType.HOOK_EXECUTION_RESPONSE, response);
    }

    // Handle tool confirmation requests
    if (message.type === MessageBusType.TOOL_CONFIRMATION_REQUEST) {
      if (this.defaultToolDecision === 'allow') {
        this.emit(MessageBusType.TOOL_CONFIRMATION_RESPONSE, {
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: message.correlationId,
          confirmed: true,
        });
      } else if (this.defaultToolDecision === 'deny') {
        this.emit(MessageBusType.TOOL_CONFIRMATION_RESPONSE, {
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: message.correlationId,
          confirmed: false,
        });
      } else {
        // ask_user
        this.emit(MessageBusType.TOOL_CONFIRMATION_RESPONSE, {
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: message.correlationId,
          confirmed: false,
          requiresUserConfirmation: true,
        });
      }
    }

    // Emit the message to subscribers (mimicking real MessageBus behavior)
    this.emit(message.type, message);
  });

  /**
   * Mock subscribe method that stores listeners
   */
  subscribe = vi.fn(
    <T extends Message>(type: T['type'], listener: (message: T) => void) => {
      if (!this.subscriptions.has(type)) {
        this.subscriptions.set(type, new Set());
      }
      this.subscriptions.get(type)!.add(listener as (message: Message) => void);
    },
  );

  /**
   * Mock unsubscribe method
   */
  unsubscribe = vi.fn(
    <T extends Message>(type: T['type'], listener: (message: T) => void) => {
      const listeners = this.subscriptions.get(type);
      if (listeners) {
        listeners.delete(listener as (message: Message) => void);
      }
    },
  );

  /**
   * Emit a message to subscribers (for testing)
   */
  private emit(type: MessageBusType, message: Message) {
    const listeners = this.subscriptions.get(type);
    if (listeners) {
      listeners.forEach((listener) => listener(message));
    }
  }

  /**
   * Manually trigger a hook response (for testing custom scenarios)
   */
  triggerHookResponse(
    correlationId: string,
    success: boolean,
    output?: Record<string, unknown>,
    error?: Error,
  ) {
    const response: HookExecutionResponse = {
      type: MessageBusType.HOOK_EXECUTION_RESPONSE,
      correlationId,
      success,
      output,
      error,
    };
    this.hookResponses.push(response);
    this.emit(MessageBusType.HOOK_EXECUTION_RESPONSE, response);
  }

  /**
   * Get the last hook request published
   */
  getLastHookRequest(): HookExecutionRequest | undefined {
    return this.hookRequests[this.hookRequests.length - 1];
  }

  /**
   * Get all hook requests for a specific event
   */
  getHookRequestsForEvent(eventName: string): HookExecutionRequest[] {
    return this.hookRequests.filter((req) => req.eventName === eventName);
  }

  /**
   * Clear all captured messages (for test isolation)
   */
  clear() {
    this.publishedMessages = [];
    this.hookRequests = [];
    this.hookResponses = [];
    this.subscriptions.clear();
  }

  /**
   * Verify that a hook execution request was published
   */
  expectHookRequest(
    eventName: string,
    input?: Partial<Record<string, unknown>>,
  ) {
    const request = this.hookRequests.find(
      (req) => req.eventName === eventName,
    );
    if (!request) {
      throw new Error(
        `Expected hook request for event "${eventName}" but none was found`,
      );
    }

    if (input) {
      Object.entries(input).forEach(([key, value]) => {
        if (request.input[key] !== value) {
          throw new Error(
            `Expected hook input.${key} to be ${JSON.stringify(value)} but got ${JSON.stringify(request.input[key])}`,
          );
        }
      });
    }

    return request;
  }
}

/**
 * Create a mock MessageBus for testing
 */
export function createMockMessageBus(): MessageBus {
  return new MockMessageBus() as unknown as MessageBus;
}

/**
 * Get the MockMessageBus instance from a mocked MessageBus
 */
export function getMockMessageBusInstance(
  messageBus: MessageBus,
): MockMessageBus {
  return messageBus as unknown as MockMessageBus;
}
