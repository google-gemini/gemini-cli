/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { awaitConfirmation } from './confirmation.js';
import {
  MessageBusType,
  type ToolConfirmationResponse,
  type Message,
} from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ToolConfirmationOutcome } from '../tools/tools.js';

describe('awaitConfirmation', () => {
  let mockMessageBus: MessageBus;
  let listeners: Record<string, (message: Message) => void> = {};

  beforeEach(() => {
    listeners = {};
    mockMessageBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((type, listener) => {
        listeners[type] = listener as (message: Message) => void;
      }),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
  });

  const emitResponse = (response: ToolConfirmationResponse) => {
    const listener = listeners[MessageBusType.TOOL_CONFIRMATION_RESPONSE];
    if (listener) {
      listener(response);
    }
  };

  it('should resolve when confirmed response matches correlationId', async () => {
    const correlationId = 'test-correlation-id';
    const abortController = new AbortController();

    const promise = awaitConfirmation(
      mockMessageBus,
      correlationId,
      abortController.signal,
    );

    expect(mockMessageBus.subscribe).toHaveBeenCalledWith(
      MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      expect.any(Function),
    );

    // Simulate response
    emitResponse({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId,
      confirmed: true,
    });

    const result = await promise;
    expect(result).toEqual({
      outcome: ToolConfirmationOutcome.ProceedOnce,
      payload: undefined,
    });
    expect(mockMessageBus.unsubscribe).toHaveBeenCalled();
  });

  it('should resolve with mapped outcome when confirmed is false', async () => {
    const correlationId = 'id-123';
    const abortController = new AbortController();

    const promise = awaitConfirmation(
      mockMessageBus,
      correlationId,
      abortController.signal,
    );

    emitResponse({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId,
      confirmed: false,
    });

    const result = await promise;
    expect(result.outcome).toBe(ToolConfirmationOutcome.Cancel);
  });

  it('should resolve with explicit outcome if provided', async () => {
    const correlationId = 'id-456';
    const abortController = new AbortController();

    const promise = awaitConfirmation(
      mockMessageBus,
      correlationId,
      abortController.signal,
    );

    emitResponse({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId,
      confirmed: true,
      outcome: ToolConfirmationOutcome.ProceedAlways,
    });

    const result = await promise;
    expect(result.outcome).toBe(ToolConfirmationOutcome.ProceedAlways);
  });

  it('should resolve with payload', async () => {
    const correlationId = 'id-payload';
    const abortController = new AbortController();
    const payload = { newContent: 'updated' };

    const promise = awaitConfirmation(
      mockMessageBus,
      correlationId,
      abortController.signal,
    );

    emitResponse({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId,
      confirmed: true,
      outcome: ToolConfirmationOutcome.ModifyWithEditor,
      payload,
    });

    const result = await promise;
    expect(result.payload).toEqual(payload);
  });

  it('should ignore responses with different correlation IDs', async () => {
    const correlationId = 'my-id';
    const abortController = new AbortController();

    let resolved = false;
    const promise = awaitConfirmation(
      mockMessageBus,
      correlationId,
      abortController.signal,
    ).then((r) => {
      resolved = true;
      return r;
    });

    // Emit wrong ID
    emitResponse({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId: 'wrong-id',
      confirmed: true,
    });

    // Allow microtasks to process
    await new Promise((r) => setTimeout(r, 0));
    expect(resolved).toBe(false);

    // Emit correct ID
    emitResponse({
      type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      correlationId,
      confirmed: true,
    });

    await expect(promise).resolves.toBeDefined();
  });

  it('should reject when abort signal is triggered', async () => {
    const correlationId = 'abort-id';
    const abortController = new AbortController();

    const promise = awaitConfirmation(
      mockMessageBus,
      correlationId,
      abortController.signal,
    );

    abortController.abort();

    await expect(promise).rejects.toThrow('Operation cancelled');
    expect(mockMessageBus.unsubscribe).toHaveBeenCalled();
  });

  it('should reject immediately if signal is already aborted', async () => {
    const correlationId = 'pre-abort-id';
    const abortController = new AbortController();
    abortController.abort();

    const promise = awaitConfirmation(
      mockMessageBus,
      correlationId,
      abortController.signal,
    );

    await expect(promise).rejects.toThrow('Operation cancelled');
    expect(mockMessageBus.subscribe).not.toHaveBeenCalled();
  });

  it('should cleanup and reject if subscribe throws', async () => {
    const error = new Error('Subscribe failed');
    vi.mocked(mockMessageBus.subscribe).mockImplementationOnce(() => {
      throw error;
    });

    const abortController = new AbortController();
    const promise = awaitConfirmation(
      mockMessageBus,
      'fail-id',
      abortController.signal,
    );

    await expect(promise).rejects.toThrow(error);
    expect(mockMessageBus.unsubscribe).toHaveBeenCalled();
  });
});
