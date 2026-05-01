/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageBus } from './message-bus.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { PolicyDecision } from '../policy/types.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  MessageBusType,
  type Message,
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

      await expect(
        messageBus.publish({ invalid: 'message' } as unknown as Message),
      ).rejects.toThrow('Invalid message structure');

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Invalid message structure'),
        }),
      );
    });

    it('should validate tool confirmation requests have correlationId', async () => {
      const errorHandler = vi.fn();
      messageBus.on('error', errorHandler);

      await expect(
        messageBus.publish({
          type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
          toolCall: { name: 'test' },
        } as unknown as Message),
      ).rejects.toThrow('Invalid message structure');

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

    it('should sanitize sensitive data in error messages', async () => {
      const errorHandler = vi.fn();
      messageBus.on('error', errorHandler);

      const invalidMessage = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: {
          name: 'test-tool',
          args: { password: 'secret-password' },
        },
        // missing correlationId makes it invalid
      } as unknown as Message;

      await expect(messageBus.publish(invalidMessage)).rejects.toThrow(
        /\[REDACTED\]/,
      );
      await expect(messageBus.publish(invalidMessage)).rejects.not.toThrow(
        /secret-password/,
      );

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('[REDACTED]'),
        }),
      );
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.not.stringContaining('secret-password'),
        }),
      );
    });

    it('should sanitize sensitive data in debug logs', async () => {
      const debugSpy = vi.spyOn(debugLogger, 'debug');
      // @ts-expect-error - access private member for test
      messageBus.debug = true;

      const message: ToolExecutionSuccess<string> = {
        type: MessageBusType.TOOL_EXECUTION_SUCCESS as const,
        toolCall: {
          name: 'test-tool',
          args: { api_key: 'my-api-key' },
        },
        result: 'success',
      };

      await messageBus.publish(message);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[REDACTED]'),
      );
      expect(debugSpy).toHaveBeenCalledWith(
        expect.not.stringContaining('my-api-key'),
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

      // Should throw
      await expect(messageBus.publish(request)).rejects.toThrow(
        'Policy check failed',
      );

      // Should emit error
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Policy check failed',
        }),
      );
    });
  });

  describe('request', () => {
    it('should fail fast if publish fails', async () => {
      // Mock publish to throw
      vi.spyOn(messageBus, 'publish').mockRejectedValue(
        new Error('Publish failed'),
      );

      const request: Omit<ToolConfirmationRequest, 'correlationId'> = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: { name: 'test-tool', args: {} },
      };

      const start = Date.now();
      const requestPromise = messageBus.request(
        request,
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        60000,
      );

      await expect(requestPromise).rejects.toThrow('Publish failed');
      const duration = Date.now() - start;

      // Should have failed way before the 60s timeout
      expect(duration).toBeLessThan(1000);
    });

    it('should handle timeout if no response is received', async () => {
      const request: Message = {
        type: MessageBusType.SUBAGENT_ACTIVITY,
        subagentName: 'test',
        activity: {
          id: '1',
          type: 'thought',
          status: 'running',
          content: 'thinking',
        },
      };

      const requestPromise = messageBus.request(
        request,
        MessageBusType.ASK_USER_RESPONSE,
        10, // 10ms timeout
      );

      await expect(requestPromise).rejects.toThrow(
        /Request timed out waiting for ask-user-response/,
      );
    });
  });

  describe('pattern resiliency', () => {
    it('should handle publish returning non-promise (mock behavior)', () => {
      // @ts-expect-error - mock returning undefined
      vi.spyOn(messageBus, 'publish').mockReturnValue(undefined);

      const publishAndCatch = () => {
        const p = messageBus.publish({
          type: MessageBusType.TOOL_CALLS_UPDATE,
          toolCalls: [],
          schedulerId: 'test',
        } as Message);

        if (p instanceof Promise) {
          p.catch(() => {});
        }
      };

      expect(publishAndCatch).not.toThrow();
    });

    it('should handle publish throwing synchronously (mock behavior)', () => {
      vi.spyOn(messageBus, 'publish').mockImplementation(() => {
        throw new Error('Sync throw');
      });

      const publishAndCatch = () => {
        try {
          const p = messageBus.publish({
            type: MessageBusType.TOOL_CALLS_UPDATE,
            toolCalls: [],
            schedulerId: 'test',
          } as Message);

          if (p instanceof Promise) {
            p.catch(() => {});
          }
        } catch {
          // handled
        }
      };

      expect(publishAndCatch).not.toThrow();
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
              const p = messageBus.publish({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId: msg.correlationId,
                confirmed: true,
              });
              if (p instanceof Promise) {
                p.catch(() => {});
              }
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
              const p = messageBus.publish({
                type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
                correlationId: msg.correlationId,
                confirmed: true,
              });
              if (p instanceof Promise) {
                p.catch(() => {});
              }
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
});
