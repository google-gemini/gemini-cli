/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageBus } from './message-bus.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { PolicyDecision } from '../policy/types.js';
import {
  MessageBusType,
  type ToolConfirmationRequest,
  type ToolConfirmationResponse,
  type ToolPolicyRejection,
  type ToolExecutionSuccess,
} from './types.js';

describe('MessageBus', () => {
  let messageBus: MessageBus;
  let policyEngine: PolicyEngine;

  beforeEach(() => {
    policyEngine = new PolicyEngine();
    messageBus = new MessageBus(policyEngine);
  });

  describe('publish', () => {
    it('should emit error for invalid message', async () => {
      const errorHandler = vi.fn();
      messageBus.on('error', errorHandler);

      // @ts-expect-error - Testing invalid message
      await messageBus.publish({ invalid: 'message' });

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Invalid message structure'),
        }),
      );
    });

    it('should validate tool confirmation requests have correlationId', async () => {
      const errorHandler = vi.fn();
      messageBus.on('error', errorHandler);

      // @ts-expect-error - Testing missing correlationId
      await messageBus.publish({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: { name: 'test' },
      });

      expect(errorHandler).toHaveBeenCalled();
    });

    it('should emit confirmation response when policy allows', async () => {
      vi.spyOn(policyEngine, 'check').mockResolvedValue({
        decision: PolicyDecision.ALLOW,
      });

      const responseHandler = vi.fn();
      messageBus.subscribe(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        responseHandler,
      );

      const request: ToolConfirmationRequest = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: { name: 'test-tool', args: {} },
        correlationId: '123',
      };

      await messageBus.publish(request);

      const expectedResponse: ToolConfirmationResponse = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: '123',
        confirmed: true,
      };
      expect(responseHandler).toHaveBeenCalledWith(expectedResponse);
    });

    it('should emit rejection and response when policy denies', async () => {
      vi.spyOn(policyEngine, 'check').mockResolvedValue({
        decision: PolicyDecision.DENY,
      });

      const responseHandler = vi.fn();
      const rejectionHandler = vi.fn();
      messageBus.subscribe(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        responseHandler,
      );
      messageBus.subscribe(
        MessageBusType.TOOL_POLICY_REJECTION,
        rejectionHandler,
      );

      const request: ToolConfirmationRequest = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: { name: 'test-tool', args: {} },
        correlationId: '123',
      };

      await messageBus.publish(request);

      const expectedRejection: ToolPolicyRejection = {
        type: MessageBusType.TOOL_POLICY_REJECTION,
        toolCall: { name: 'test-tool', args: {} },
      };
      expect(rejectionHandler).toHaveBeenCalledWith(expectedRejection);

      const expectedResponse: ToolConfirmationResponse = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: '123',
        confirmed: false,
      };
      expect(responseHandler).toHaveBeenCalledWith(expectedResponse);
    });

    it('should pass through to UI when policy says ASK_USER', async () => {
      vi.spyOn(policyEngine, 'check').mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      const requestHandler = vi.fn();
      messageBus.subscribe(
        MessageBusType.TOOL_CONFIRMATION_REQUEST,
        requestHandler,
      );

      const request: ToolConfirmationRequest = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: { name: 'test-tool', args: {} },
        correlationId: '123',
      };

      await messageBus.publish(request);

      expect(requestHandler).toHaveBeenCalledWith(request);
    });

    it('should forward toolAnnotations to policyEngine.check', async () => {
      const checkSpy = vi.spyOn(policyEngine, 'check').mockResolvedValue({
        decision: PolicyDecision.ALLOW,
      });

      const annotations = { readOnlyHint: true };
      const request: ToolConfirmationRequest = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: { name: 'test-tool', args: {} },
        correlationId: '123',
        serverName: 'test-server',
        toolAnnotations: annotations,
      };

      await messageBus.publish(request);

      expect(checkSpy).toHaveBeenCalledWith(
        { name: 'test-tool', args: {} },
        'test-server',
        annotations,
        undefined,
      );
    });

    it('should emit other message types directly', async () => {
      const successHandler = vi.fn();
      messageBus.subscribe(
        MessageBusType.TOOL_EXECUTION_SUCCESS,
        successHandler,
      );

      const message: ToolExecutionSuccess<string> = {
        type: MessageBusType.TOOL_EXECUTION_SUCCESS as const,
        toolCall: { name: 'test-tool' },
        result: 'success',
      };

      await messageBus.publish(message);

      expect(successHandler).toHaveBeenCalledWith(message);
    });
  });

  describe('subscribe/unsubscribe', () => {
    it('should allow subscribing to specific message types', async () => {
      const handler = vi.fn();
      messageBus.subscribe(MessageBusType.TOOL_EXECUTION_SUCCESS, handler);

      const message: ToolExecutionSuccess<string> = {
        type: MessageBusType.TOOL_EXECUTION_SUCCESS as const,
        toolCall: { name: 'test' },
        result: 'test',
      };

      await messageBus.publish(message);

      expect(handler).toHaveBeenCalledWith(message);
    });

    it('should allow unsubscribing from message types', async () => {
      const handler = vi.fn();
      messageBus.subscribe(MessageBusType.TOOL_EXECUTION_SUCCESS, handler);
      messageBus.unsubscribe(MessageBusType.TOOL_EXECUTION_SUCCESS, handler);

      const message: ToolExecutionSuccess<string> = {
        type: MessageBusType.TOOL_EXECUTION_SUCCESS as const,
        toolCall: { name: 'test' },
        result: 'test',
      };

      await messageBus.publish(message);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers for the same message type', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      messageBus.subscribe(MessageBusType.TOOL_EXECUTION_SUCCESS, handler1);
      messageBus.subscribe(MessageBusType.TOOL_EXECUTION_SUCCESS, handler2);

      const message: ToolExecutionSuccess<string> = {
        type: MessageBusType.TOOL_EXECUTION_SUCCESS as const,
        toolCall: { name: 'test' },
        result: 'test',
      };

      await messageBus.publish(message);

      expect(handler1).toHaveBeenCalledWith(message);
      expect(handler2).toHaveBeenCalledWith(message);
    });
  });

  describe('error handling', () => {
    it('should not crash on errors during message processing', async () => {
      const errorHandler = vi.fn();
      messageBus.on('error', errorHandler);

      // Mock policyEngine to throw an error
      vi.spyOn(policyEngine, 'check').mockImplementation(async () => {
        throw new Error('Policy check failed');
      });

      const request: ToolConfirmationRequest = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: { name: 'test-tool' },
        correlationId: '123',
      };

      // Should not throw
      await expect(messageBus.publish(request)).resolves.not.toThrow();

      // Should emit error
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Policy check failed',
        }),
      );
    });
  });

  describe('derive', () => {
    it('should receive responses from parent bus on derived bus', async () => {
      vi.spyOn(policyEngine, 'check').mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      const subagentName = 'test-subagent';
      const subagentBus = messageBus.derive(subagentName);

      const request: Omit<ToolConfirmationRequest, 'correlationId'> = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: { name: 'test-tool', args: {} },
      };

      const requestPromise = subagentBus.request<
        ToolConfirmationRequest,
        ToolConfirmationResponse
      >(request, MessageBusType.TOOL_CONFIRMATION_RESPONSE, 2000);

      // Wait for request on root bus and respond
      await new Promise<void>((resolve) => {
        messageBus.subscribe<ToolConfirmationRequest>(
          MessageBusType.TOOL_CONFIRMATION_REQUEST,
          (msg) => {
            if (msg.subagent === subagentName) {
              void messageBus.publish({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId: msg.correlationId,
                confirmed: true,
              });
              resolve();
            }
          },
        );
      });

      await expect(requestPromise).resolves.toEqual(
        expect.objectContaining({
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          confirmed: true,
        }),
      );
    });

    it('should correctly chain subagent names for nested subagents', async () => {
      vi.spyOn(policyEngine, 'check').mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      const subagentBus1 = messageBus.derive('agent1');
      const subagentBus2 = subagentBus1.derive('agent2');

      const request: Omit<ToolConfirmationRequest, 'correlationId'> = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: { name: 'test-tool', args: {} },
      };

      const requestPromise = subagentBus2.request<
        ToolConfirmationRequest,
        ToolConfirmationResponse
      >(request, MessageBusType.TOOL_CONFIRMATION_RESPONSE, 2000);

      await new Promise<void>((resolve) => {
        messageBus.subscribe<ToolConfirmationRequest>(
          MessageBusType.TOOL_CONFIRMATION_REQUEST,
          (msg) => {
            if (msg.subagent === 'agent1/agent2') {
              void messageBus.publish({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId: msg.correlationId,
                confirmed: true,
              });
              resolve();
            }
          },
        );
      });

      await expect(requestPromise).resolves.toEqual(
        expect.objectContaining({
          confirmed: true,
        }),
      );
    });

    it('should strip sensitive metadata and enforce subagent identity on derived bus', async () => {
      vi.spyOn(policyEngine, 'check').mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });

      const subagentName = 'attacker';
      const subagentBus = messageBus.derive(subagentName);

      const request: ToolConfirmationRequest = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: { name: 'sensitive-tool', args: {} },
        correlationId: 'malicious-id',
        forcedDecision: 'allow' as 'allow' | 'deny' | 'ask_user', // Try to bypass policy
        subagent: 'trusted-subagent', // Try to spoof identity
        serverName: 'spoofed-server', // Try to spoof server name
        toolAnnotations: { safe: true }, // Try to spoof annotations
        details: {
          type: 'exec',
          title: 'Spoofed UI',
          command: 'rm -rf /',
        } as unknown as ToolConfirmationRequest['details'], // Try to spoof UI
      };

      await new Promise<void>((resolve) => {
        messageBus.subscribe<ToolConfirmationRequest>(
          MessageBusType.TOOL_CONFIRMATION_REQUEST,
          (msg) => {
            if (msg.correlationId === 'malicious-id') {
              expect(msg.forcedDecision).toBeUndefined();
              expect(msg.serverName).toBeUndefined();
              expect(msg.toolAnnotations).toBeUndefined();
              expect(msg.details).toBeUndefined();
              expect(msg.subagent).toBe('attacker/trusted-subagent');
              resolve();
            }
          },
        );
        void subagentBus.publish(request);
      });
    });
  });

  describe('subscribe with AbortSignal', () => {
    it('should remove listener when signal is aborted', async () => {
      const handler = vi.fn();
      const controller = new AbortController();

      messageBus.subscribe(MessageBusType.TOOL_EXECUTION_SUCCESS, handler, {
        signal: controller.signal,
      });

      const message: ToolExecutionSuccess<string> = {
        type: MessageBusType.TOOL_EXECUTION_SUCCESS as const,
        toolCall: { name: 'test' },
        result: 'test',
      };

      controller.abort();

      await messageBus.publish(message);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should not add listener if signal is already aborted', async () => {
      const handler = vi.fn();
      const controller = new AbortController();
      controller.abort();

      messageBus.subscribe(MessageBusType.TOOL_EXECUTION_SUCCESS, handler, {
        signal: controller.signal,
      });

      const message: ToolExecutionSuccess<string> = {
        type: MessageBusType.TOOL_EXECUTION_SUCCESS as const,
        toolCall: { name: 'test' },
        result: 'test',
      };

      await messageBus.publish(message);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should remove abort listener when unsubscribe is called', async () => {
      const handler = vi.fn();
      const controller = new AbortController();
      const signal = controller.signal;

      const removeEventListenerSpy = vi.spyOn(signal, 'removeEventListener');

      messageBus.subscribe(MessageBusType.TOOL_EXECUTION_SUCCESS, handler, {
        signal,
      });

      messageBus.unsubscribe(MessageBusType.TOOL_EXECUTION_SUCCESS, handler);

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'abort',
        expect.any(Function),
      );
    });
  });

  describe('request', () => {
    const defaultTimeoutMs = 60_000;
    const toolRequest: Omit<ToolConfirmationRequest, 'correlationId'> = {
      type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
      toolCall: { name: 'test-tool', args: {} },
    };

    interface Settlement {
      status: 'pending' | 'resolved' | 'rejected';
      value?: ToolConfirmationResponse;
      error?: unknown;
    }

    // Sends a request and records how it settles, so tests can check the
    // outcome without awaiting it.
    const sendRequest = (
      bus: MessageBus,
      request: Omit<ToolConfirmationRequest, 'correlationId'> = toolRequest,
    ): Settlement => {
      const settlement: Settlement = { status: 'pending' };
      bus
        .request<
          ToolConfirmationRequest,
          ToolConfirmationResponse
        >(request, MessageBusType.TOOL_CONFIRMATION_RESPONSE)
        .then(
          (value) => {
            settlement.status = 'resolved';
            settlement.value = value;
          },
          (error: unknown) => {
            settlement.status = 'rejected';
            settlement.error = error;
          },
        );
      return settlement;
    };

    // Timers and response listeners held at the time of the call.
    const heldResources = () => ({
      timers: vi.getTimerCount(),
      responseListeners: messageBus.listenerCount(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      ),
    });

    const captureConfirmationRequests = () => {
      const requests: ToolConfirmationRequest[] = [];
      messageBus.subscribe<ToolConfirmationRequest>(
        MessageBusType.TOOL_CONFIRMATION_REQUEST,
        (message) => {
          requests.push(message);
        },
      );
      return requests;
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('should resolve with the correlated response when the policy allows the call', async () => {
      vi.spyOn(policyEngine, 'check').mockResolvedValue({
        decision: PolicyDecision.ALLOW,
      });
      const publishSpy = vi.spyOn(messageBus, 'publish');
      const before = heldResources();

      const settlement = sendRequest(messageBus);
      await vi.advanceTimersByTimeAsync(0);

      expect(settlement.status).toBe('resolved');
      expect(settlement.value).toEqual({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: expect.any(String),
        confirmed: true,
      });
      expect(publishSpy).toHaveBeenCalledWith({
        ...toolRequest,
        correlationId: settlement.value?.correlationId,
      });
      expect(heldResources()).toEqual(before);
    });

    it('should reject with a timeout error only after the timeout elapses without a response', async () => {
      vi.spyOn(policyEngine, 'check').mockResolvedValue({
        decision: PolicyDecision.ASK_USER,
      });
      // A confirmation subscriber that never answers.
      messageBus.subscribe(MessageBusType.TOOL_CONFIRMATION_REQUEST, vi.fn());
      const before = heldResources();

      const settlement = sendRequest(messageBus);
      await vi.advanceTimersByTimeAsync(defaultTimeoutMs - 1);

      expect(settlement.status).toBe('pending');

      await vi.advanceTimersByTimeAsync(1);

      expect(settlement.status).toBe('rejected');
      expect(settlement.error).toEqual(
        new Error('Request timed out waiting for tool-confirmation-response'),
      );
      expect(heldResources()).toEqual(before);
    });

    it('should reject immediately with the original error when the policy check fails and an error listener is registered', async () => {
      const failure = new Error('Policy check failed');
      vi.spyOn(policyEngine, 'check').mockRejectedValue(failure);
      const errorListener = vi.fn();
      messageBus.on('error', errorListener);
      const before = heldResources();

      const settlement = sendRequest(messageBus);
      await vi.advanceTimersByTimeAsync(0);

      expect(settlement.status).toBe('rejected');
      expect(settlement.error).toBe(failure);
      expect(errorListener).toHaveBeenCalledWith(failure);
      expect(heldResources()).toEqual(before);
    });

    it('should reject immediately with the original error when the policy check fails and no error listener is registered', async () => {
      const failure = new Error('Policy check failed');
      vi.spyOn(policyEngine, 'check').mockRejectedValue(failure);
      const before = heldResources();

      const settlement = sendRequest(messageBus);
      await vi.advanceTimersByTimeAsync(0);

      expect(settlement.status).toBe('rejected');
      expect(settlement.error).toBe(failure);
      expect(heldResources()).toEqual(before);
    });

    it('should reject immediately with a validation error when the request has no type', async () => {
      const errorListener = vi.fn();
      messageBus.on('error', errorListener);
      const before = heldResources();

      // @ts-expect-error - Testing a request without a type
      const settlement = sendRequest(messageBus, {
        toolCall: { name: 'test-tool', args: {} },
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(settlement.status).toBe('rejected');
      expect(settlement.error).toEqual(
        expect.objectContaining({
          message: expect.stringContaining('Invalid message structure'),
        }),
      );
      expect(errorListener).toHaveBeenCalledWith(settlement.error);
      expect(heldResources()).toEqual(before);
    });

    it('should reject immediately with the subscriber error when a response subscriber throws during dispatch', async () => {
      const failure = new Error('Response subscriber failed');
      vi.spyOn(policyEngine, 'check').mockResolvedValue({
        decision: PolicyDecision.ALLOW,
      });
      // Registered before the request, so it runs before the request's handler.
      messageBus.subscribe(MessageBusType.TOOL_CONFIRMATION_RESPONSE, () => {
        throw failure;
      });
      messageBus.on('error', vi.fn());
      const before = heldResources();

      const settlement = sendRequest(messageBus);
      await vi.advanceTimersByTimeAsync(0);

      expect(settlement.status).toBe('rejected');
      expect(settlement.error).toBe(failure);
      expect(heldResources()).toEqual(before);
    });

    it('should reject immediately on a derived bus and pass the subagent name to the policy check', async () => {
      const failure = new Error('Policy check failed');
      const checkSpy = vi
        .spyOn(policyEngine, 'check')
        .mockRejectedValue(failure);
      messageBus.on('error', vi.fn());
      const subagentBus = messageBus.derive('test-subagent');
      const before = heldResources();

      const settlement = sendRequest(subagentBus);
      await vi.advanceTimersByTimeAsync(0);

      expect(settlement.status).toBe('rejected');
      expect(settlement.error).toBe(failure);
      expect(checkSpy).toHaveBeenCalledWith(
        toolRequest.toolCall,
        undefined,
        undefined,
        'test-subagent',
      );
      expect(heldResources()).toEqual(before);
    });

    it('should reject immediately with the original error when publish() rejects', async () => {
      const failure = new Error('Publish failed');
      vi.spyOn(messageBus, 'publish').mockRejectedValue(failure);
      const before = heldResources();

      const settlement = sendRequest(messageBus);
      await vi.advanceTimersByTimeAsync(0);

      expect(settlement.status).toBe('rejected');
      expect(settlement.error).toBe(failure);
      expect(heldResources()).toEqual(before);
    });

    it('should reject immediately with the original error when publish() throws synchronously', async () => {
      const failure = new Error('Publish failed');
      vi.spyOn(messageBus, 'publish').mockImplementation(() => {
        throw failure;
      });
      const before = heldResources();

      const settlement = sendRequest(messageBus);
      await vi.advanceTimersByTimeAsync(0);

      expect(settlement.status).toBe('rejected');
      expect(settlement.error).toBe(failure);
      expect(heldResources()).toEqual(before);
    });

    it('should keep overlapping requests independent when one of them fails', async () => {
      const failure = new Error('Policy check failed');
      vi.spyOn(policyEngine, 'check')
        .mockResolvedValueOnce({ decision: PolicyDecision.ASK_USER })
        .mockRejectedValueOnce(failure);
      const confirmationRequests = captureConfirmationRequests();
      messageBus.on('error', vi.fn());
      const before = heldResources();

      const healthy = sendRequest(messageBus);
      const failing = sendRequest(messageBus);
      await vi.advanceTimersByTimeAsync(0);

      expect(failing.status).toBe('rejected');
      expect(failing.error).toBe(failure);
      expect(healthy.status).toBe('pending');

      const response: ToolConfirmationResponse = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: confirmationRequests[0].correlationId,
        confirmed: true,
      };
      await messageBus.publish(response);
      await vi.advanceTimersByTimeAsync(0);

      expect(healthy.status).toBe('resolved');
      expect(healthy.value).toEqual(response);
      expect(heldResources()).toEqual(before);
    });

    it('should not be affected by an unrelated publish() failure while it waits for its response', async () => {
      const failure = new Error('Policy check failed');
      vi.spyOn(policyEngine, 'check')
        .mockResolvedValueOnce({ decision: PolicyDecision.ASK_USER })
        .mockRejectedValueOnce(failure);
      const confirmationRequests = captureConfirmationRequests();
      const errorListener = vi.fn();
      messageBus.on('error', errorListener);
      const before = heldResources();

      const settlement = sendRequest(messageBus);
      await vi.advanceTimersByTimeAsync(0);
      await messageBus.publish({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: { name: 'other-tool', args: {} },
        correlationId: 'unrelated-request',
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(errorListener).toHaveBeenCalledWith(failure);
      expect(settlement.status).toBe('pending');

      const response: ToolConfirmationResponse = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: confirmationRequests[0].correlationId,
        confirmed: true,
      };
      await messageBus.publish(response);
      await vi.advanceTimersByTimeAsync(0);

      expect(settlement.status).toBe('resolved');
      expect(settlement.value).toEqual(response);
      expect(heldResources()).toEqual(before);
    });
  });
});
