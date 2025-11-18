/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { FunctionCall } from '@google/genai';
import {
  MessageBusType,
  type ToolConfirmationRequest,
  type ToolConfirmationResponse,
  type ToolPolicyRejection,
  type ToolExecutionSuccess,
  type ToolExecutionFailure,
  type Message,
} from './types.js';

describe('confirmation-bus types', () => {
  describe('MessageBusType enum', () => {
    it('should have TOOL_CONFIRMATION_REQUEST type', () => {
      expect(MessageBusType.TOOL_CONFIRMATION_REQUEST).toBe(
        'tool-confirmation-request',
      );
    });

    it('should have TOOL_CONFIRMATION_RESPONSE type', () => {
      expect(MessageBusType.TOOL_CONFIRMATION_RESPONSE).toBe(
        'tool-confirmation-response',
      );
    });

    it('should have TOOL_POLICY_REJECTION type', () => {
      expect(MessageBusType.TOOL_POLICY_REJECTION).toBe(
        'tool-policy-rejection',
      );
    });

    it('should have TOOL_EXECUTION_SUCCESS type', () => {
      expect(MessageBusType.TOOL_EXECUTION_SUCCESS).toBe(
        'tool-execution-success',
      );
    });

    it('should have TOOL_EXECUTION_FAILURE type', () => {
      expect(MessageBusType.TOOL_EXECUTION_FAILURE).toBe(
        'tool-execution-failure',
      );
    });

    it('should have exactly 5 message types', () => {
      const types = Object.keys(MessageBusType);
      expect(types).toHaveLength(5);
    });

    it('should use kebab-case for all values', () => {
      const values = Object.values(MessageBusType);
      values.forEach((value) => {
        expect(value).toMatch(/^[a-z]+(-[a-z]+)*$/);
      });
    });
  });

  describe('ToolConfirmationRequest interface', () => {
    it('should accept valid confirmation request', () => {
      const request: ToolConfirmationRequest = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: { name: 'testTool', args: {} } as FunctionCall,
        correlationId: 'test-id-123',
      };

      expect(request.type).toBe('tool-confirmation-request');
      expect(request.correlationId).toBe('test-id-123');
      expect(request.toolCall).toBeDefined();
    });

    it('should have correct type field', () => {
      const request: ToolConfirmationRequest = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: {} as FunctionCall,
        correlationId: 'id',
      };

      expect(request.type).toBe(MessageBusType.TOOL_CONFIRMATION_REQUEST);
    });
  });

  describe('ToolConfirmationResponse interface', () => {
    it('should accept confirmed response', () => {
      const response: ToolConfirmationResponse = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'test-id',
        confirmed: true,
      };

      expect(response.confirmed).toBe(true);
    });

    it('should accept rejected response', () => {
      const response: ToolConfirmationResponse = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'test-id',
        confirmed: false,
      };

      expect(response.confirmed).toBe(false);
    });
  });

  describe('ToolPolicyRejection interface', () => {
    it('should accept valid policy rejection', () => {
      const rejection: ToolPolicyRejection = {
        type: MessageBusType.TOOL_POLICY_REJECTION,
        toolCall: { name: 'blockedTool', args: {} } as FunctionCall,
      };

      expect(rejection.type).toBe('tool-policy-rejection');
      expect(rejection.toolCall).toBeDefined();
    });
  });

  describe('ToolExecutionSuccess interface', () => {
    it('should accept success with generic result', () => {
      const success: ToolExecutionSuccess<string> = {
        type: MessageBusType.TOOL_EXECUTION_SUCCESS,
        toolCall: { name: 'tool', args: {} } as FunctionCall,
        result: 'success result',
      };

      expect(success.result).toBe('success result');
    });

    it('should accept success with object result', () => {
      const success: ToolExecutionSuccess<{ data: number }> = {
        type: MessageBusType.TOOL_EXECUTION_SUCCESS,
        toolCall: {} as FunctionCall,
        result: { data: 42 },
      };

      expect(success.result.data).toBe(42);
    });

    it('should accept success with unknown result type', () => {
      const success: ToolExecutionSuccess = {
        type: MessageBusType.TOOL_EXECUTION_SUCCESS,
        toolCall: {} as FunctionCall,
        result: { any: 'data' },
      };

      expect(success.result).toBeDefined();
    });
  });

  describe('ToolExecutionFailure interface', () => {
    it('should accept failure with Error', () => {
      const failure: ToolExecutionFailure<Error> = {
        type: MessageBusType.TOOL_EXECUTION_FAILURE,
        toolCall: {} as FunctionCall,
        error: new Error('Test error'),
      };

      expect(failure.error).toBeInstanceOf(Error);
      expect(failure.error.message).toBe('Test error');
    });

    it('should accept failure with custom error type', () => {
      const failure: ToolExecutionFailure<{ code: number; message: string }> = {
        type: MessageBusType.TOOL_EXECUTION_FAILURE,
        toolCall: {} as FunctionCall,
        error: { code: 500, message: 'Server error' },
      };

      expect(failure.error.code).toBe(500);
    });

    it('should accept failure with default Error type', () => {
      const failure: ToolExecutionFailure = {
        type: MessageBusType.TOOL_EXECUTION_FAILURE,
        toolCall: {} as FunctionCall,
        error: new Error('Default error'),
      };

      expect(failure.error).toBeDefined();
    });
  });

  describe('Message union type', () => {
    it('should accept ToolConfirmationRequest', () => {
      const message: Message = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: {} as FunctionCall,
        correlationId: 'id',
      };

      expect(message.type).toBe('tool-confirmation-request');
    });

    it('should accept ToolConfirmationResponse', () => {
      const message: Message = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'id',
        confirmed: true,
      };

      expect(message.type).toBe('tool-confirmation-response');
    });

    it('should accept ToolPolicyRejection', () => {
      const message: Message = {
        type: MessageBusType.TOOL_POLICY_REJECTION,
        toolCall: {} as FunctionCall,
      };

      expect(message.type).toBe('tool-policy-rejection');
    });

    it('should accept ToolExecutionSuccess', () => {
      const message: Message = {
        type: MessageBusType.TOOL_EXECUTION_SUCCESS,
        toolCall: {} as FunctionCall,
        result: 'success',
      };

      expect(message.type).toBe('tool-execution-success');
    });

    it('should accept ToolExecutionFailure', () => {
      const message: Message = {
        type: MessageBusType.TOOL_EXECUTION_FAILURE,
        toolCall: {} as FunctionCall,
        error: new Error(),
      };

      expect(message.type).toBe('tool-execution-failure');
    });

    it('should allow type discrimination', () => {
      const messages: Message[] = [
        {
          type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
          toolCall: {} as FunctionCall,
          correlationId: 'id1',
        },
        {
          type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          correlationId: 'id2',
          confirmed: true,
        },
      ];

      messages.forEach((msg) => {
        if (msg.type === MessageBusType.TOOL_CONFIRMATION_REQUEST) {
          expect(msg.correlationId).toBeDefined();
          expect(msg.toolCall).toBeDefined();
        } else if (msg.type === MessageBusType.TOOL_CONFIRMATION_RESPONSE) {
          expect(msg.confirmed).toBeDefined();
        }
      });
    });
  });

  describe('type safety', () => {
    it('should ensure type field matches interface', () => {
      const request: ToolConfirmationRequest = {
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: {} as FunctionCall,
        correlationId: 'id',
      };

      // TypeScript should enforce this at compile time
      expect(request.type).toBe(MessageBusType.TOOL_CONFIRMATION_REQUEST);
    });

    it('should handle all message types in switch', () => {
      const handleMessage = (msg: Message): string => {
        switch (msg.type) {
          case MessageBusType.TOOL_CONFIRMATION_REQUEST:
            return 'request';
          case MessageBusType.TOOL_CONFIRMATION_RESPONSE:
            return 'response';
          case MessageBusType.TOOL_POLICY_REJECTION:
            return 'rejection';
          case MessageBusType.TOOL_EXECUTION_SUCCESS:
            return 'success';
          case MessageBusType.TOOL_EXECUTION_FAILURE:
            return 'failure';
          default:
            return 'unknown';
        }
      };

      const msg: Message = {
        type: MessageBusType.TOOL_EXECUTION_SUCCESS,
        toolCall: {} as FunctionCall,
        result: 'test',
      };

      expect(handleMessage(msg)).toBe('success');
    });
  });
});
