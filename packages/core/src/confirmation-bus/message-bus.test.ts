/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
});
