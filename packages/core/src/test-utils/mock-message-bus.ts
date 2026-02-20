/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType, type Message } from '../confirmation-bus/types.js';

/**
 * Mock MessageBus for testing hook execution through MessageBus
 */
export class MockMessageBus extends EventEmitter {
  publishedMessages: Message[] = [];
  defaultToolDecision: 'allow' | 'deny' | 'ask_user' = 'allow';

  constructor() {
    super();
  }

  /**
   * Mock publish method that captures messages and simulates responses
   */
  publish = vi.fn((message: Message) => {
    this.publishedMessages.push(message);

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
    return Promise.resolve();
  });

  /**
   * Mock subscribe method that stores listeners
   */
  subscribe = vi.fn(
    <T extends Message>(type: T['type'], listener: (message: T) => void) => {
      this.on(type, listener);
    },
  );

  /**
   * Mock unsubscribe method
   */
  unsubscribe = vi.fn(
    <T extends Message>(type: T['type'], listener: (message: T) => void) => {
      this.off(type, listener);
    },
  );

  /**
   * Clear all captured messages (for test isolation)
   */
  clear() {
    this.publishedMessages = [];
    this.removeAllListeners();
  }
}

/**
 * Create a mock MessageBus for testing
 */
export function createMockMessageBus(): MessageBus {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return new MockMessageBus() as unknown as MessageBus;
}

/**
 * Get the MockMessageBus instance from a mocked MessageBus
 */
export function getMockMessageBusInstance(
  messageBus: MessageBus,
): MockMessageBus {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return messageBus as unknown as MockMessageBus;
}
