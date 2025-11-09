/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseToolInvocation, type ToolResult } from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  type Message,
  MessageBusType,
  type ToolConfirmationRequest,
  type ToolConfirmationResponse,
} from '../confirmation-bus/types.js';

class TestBaseToolInvocation extends BaseToolInvocation<object, ToolResult> {
  getDescription(): string {
    return 'test description';
  }
  async execute(): Promise<ToolResult> {
    return { llmContent: [], returnDisplay: '' };
  }
}

describe('BaseToolInvocation', () => {
  let messageBus: MessageBus;
  let abortController: AbortController;

  beforeEach(() => {
    messageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
    abortController = new AbortController();
  });

  it('should propagate serverName to ToolConfirmationRequest', async () => {
    const serverName = 'test-server';
    const tool = new TestBaseToolInvocation(
      {},
      messageBus,
      'test-tool',
      'Test Tool',
      serverName,
    );

    let capturedRequest: ToolConfirmationRequest | undefined;
    vi.mocked(messageBus.publish).mockImplementation((request: Message) => {
      if (request.type === MessageBusType.TOOL_CONFIRMATION_REQUEST) {
        capturedRequest = request;
      }
    });

    let responseHandler:
      | ((response: ToolConfirmationResponse) => void)
      | undefined;
    vi.mocked(messageBus.subscribe).mockImplementation(
      (type: MessageBusType, handler: (message: Message) => void) => {
        if (type === MessageBusType.TOOL_CONFIRMATION_RESPONSE) {
          responseHandler = handler as (
            response: ToolConfirmationResponse,
          ) => void;
        }
      },
    );

    const confirmationPromise = tool.shouldConfirmExecute(
      abortController.signal,
    );

    // Wait for microtasks to ensure publish is called
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(messageBus.publish).toHaveBeenCalledTimes(1);
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.type).toBe(
      MessageBusType.TOOL_CONFIRMATION_REQUEST,
    );
    expect(capturedRequest?.serverName).toBe(serverName);

    // Simulate response to finish the promise cleanly
    if (responseHandler && capturedRequest) {
      responseHandler({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: capturedRequest.correlationId,
        confirmed: true,
      });
    }

    await confirmationPromise;
  });

  it('should NOT propagate serverName if not provided', async () => {
    const tool = new TestBaseToolInvocation(
      {},
      messageBus,
      'test-tool',
      'Test Tool',
      // no serverName
    );

    let capturedRequest: ToolConfirmationRequest | undefined;
    vi.mocked(messageBus.publish).mockImplementation((request: Message) => {
      if (request.type === MessageBusType.TOOL_CONFIRMATION_REQUEST) {
        capturedRequest = request;
      }
    });

    // We need to mock subscribe to avoid hanging if we want to await the promise,
    // but for this test we just need to check publish.
    // We'll abort to clean up.
    const confirmationPromise = tool.shouldConfirmExecute(
      abortController.signal,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(messageBus.publish).toHaveBeenCalledTimes(1);
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.serverName).toBeUndefined();

    abortController.abort();
    try {
      await confirmationPromise;
    } catch {
      // ignore abort error
    }
  });
});
