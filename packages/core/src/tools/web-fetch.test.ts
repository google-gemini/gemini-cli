/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { WebFetchTool } from './web-fetch.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import { ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import * as fetchUtils from '../utils/fetch.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import {
  MessageBusType,
  type ToolConfirmationResponse,
} from '../confirmation-bus/types.js';
import { randomUUID } from 'node:crypto';

const mockGenerateContent = vi.fn();
const mockGetGeminiClient = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));

vi.mock('../utils/fetch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof fetchUtils>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
    isPrivateIp: vi.fn(),
  };
});

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(),
}));

describe('WebFetchTool', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.resetAllMocks();
    mockConfig = {
      getApprovalMode: vi.fn(),
      setApprovalMode: vi.fn(),
      getProxy: vi.fn(),
      getGeminiClient: mockGetGeminiClient,
    } as unknown as Config;
  });

  describe('execute', () => {
    it('should return WEB_FETCH_NO_URL_IN_PROMPT when no URL is in the prompt for fallback', async () => {
      vi.spyOn(fetchUtils, 'isPrivateIp').mockReturnValue(true);
      const tool = new WebFetchTool(mockConfig);
      const params = { prompt: 'no url here' };
      expect(() => tool.build(params)).toThrow(
        "The 'prompt' must contain at least one valid URL (starting with http:// or https://).",
      );
    });

    it('should return WEB_FETCH_FALLBACK_FAILED on fallback fetch failure', async () => {
      vi.spyOn(fetchUtils, 'isPrivateIp').mockReturnValue(true);
      vi.spyOn(fetchUtils, 'fetchWithTimeout').mockRejectedValue(
        new Error('fetch failed'),
      );
      const tool = new WebFetchTool(mockConfig);
      const params = { prompt: 'fetch https://private.ip' };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error?.type).toBe(ToolErrorType.WEB_FETCH_FALLBACK_FAILED);
    });

    it('should return WEB_FETCH_PROCESSING_ERROR on general processing failure', async () => {
      vi.spyOn(fetchUtils, 'isPrivateIp').mockReturnValue(false);
      mockGenerateContent.mockRejectedValue(new Error('API error'));
      const tool = new WebFetchTool(mockConfig);
      const params = { prompt: 'fetch https://public.ip' };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error?.type).toBe(ToolErrorType.WEB_FETCH_PROCESSING_ERROR);
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should return confirmation details with the correct prompt and urls', async () => {
      const tool = new WebFetchTool(mockConfig);
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);
      const confirmationDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(confirmationDetails).toEqual({
        type: 'info',
        title: 'Confirm Web Fetch',
        prompt: 'fetch https://example.com',
        urls: ['https://example.com'],
        onConfirm: expect.any(Function),
      });
    });

    it('should convert github urls to raw format', async () => {
      const tool = new WebFetchTool(mockConfig);
      const params = {
        prompt:
          'fetch https://github.com/google/gemini-react/blob/main/README.md',
      };
      const invocation = tool.build(params);
      const confirmationDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(confirmationDetails).toEqual({
        type: 'info',
        title: 'Confirm Web Fetch',
        prompt:
          'fetch https://github.com/google/gemini-react/blob/main/README.md',
        urls: [
          'https://raw.githubusercontent.com/google/gemini-react/main/README.md',
        ],
        onConfirm: expect.any(Function),
      });
    });

    it('should return false if approval mode is AUTO_EDIT', async () => {
      vi.spyOn(mockConfig, 'getApprovalMode').mockReturnValue(
        ApprovalMode.AUTO_EDIT,
      );
      const tool = new WebFetchTool(mockConfig);
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);
      const confirmationDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(confirmationDetails).toBe(false);
    });

    it('should call setApprovalMode when onConfirm is called with ProceedAlways', async () => {
      const tool = new WebFetchTool(mockConfig);
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);
      const confirmationDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      if (
        confirmationDetails &&
        typeof confirmationDetails === 'object' &&
        'onConfirm' in confirmationDetails
      ) {
        await confirmationDetails.onConfirm(
          ToolConfirmationOutcome.ProceedAlways,
        );
      }

      expect(mockConfig.setApprovalMode).toHaveBeenCalledWith(
        ApprovalMode.AUTO_EDIT,
      );
    });
  });

  describe('Message Bus Integration', () => {
    let policyEngine: PolicyEngine;
    let messageBus: MessageBus;
    let mockUUID: Mock;

    beforeEach(() => {
      policyEngine = new PolicyEngine();
      messageBus = new MessageBus(policyEngine);
      mockUUID = vi.mocked(randomUUID);
      mockUUID.mockReturnValue('test-correlation-id');
    });

    it('should use message bus for confirmation when available', async () => {
      const tool = new WebFetchTool(mockConfig, messageBus);
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);

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
          name: 'WebFetchToolInvocation',
          args: { prompt: 'fetch https://example.com' },
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

    it('should reject promise when confirmation is denied via message bus', async () => {
      const tool = new WebFetchTool(mockConfig, messageBus);
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);

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

    it('should handle timeout gracefully', async () => {
      vi.useFakeTimers();

      const tool = new WebFetchTool(mockConfig, messageBus);
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);

      const confirmationPromise = invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      // Fast-forward past timeout
      vi.advanceTimersByTime(30000);

      const result = await confirmationPromise;
      expect(result).toBe(false);

      vi.useRealTimers();
    });

    it('should handle abort signal during confirmation', async () => {
      const tool = new WebFetchTool(mockConfig, messageBus);
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);

      const abortController = new AbortController();
      const confirmationPromise = invocation.shouldConfirmExecute(
        abortController.signal,
      );

      // Abort the operation
      abortController.abort();

      await expect(confirmationPromise).rejects.toThrow(
        'Tool confirmation aborted',
      );
    });

    it('should fall back to legacy confirmation when no message bus', async () => {
      const tool = new WebFetchTool(mockConfig); // No message bus
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      // Should use legacy confirmation flow (returns confirmation details, not false)
      expect(result).not.toBe(false);
      expect(result).toHaveProperty('type', 'info');
    });

    it('should ignore responses with wrong correlation ID', async () => {
      vi.useFakeTimers();

      const tool = new WebFetchTool(mockConfig, messageBus);
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);

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

    it('should handle message bus publish errors gracefully', async () => {
      const tool = new WebFetchTool(mockConfig, messageBus);
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);

      // Mock publish to throw error
      vi.spyOn(messageBus, 'publish').mockImplementation(() => {
        throw new Error('Message bus error');
      });

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(result).toBe(false); // Should gracefully fall back
    });

    it('should execute normally after confirmation approval', async () => {
      vi.spyOn(fetchUtils, 'isPrivateIp').mockReturnValue(false);
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'Fetched content from https://example.com' }],
              role: 'model',
            },
          },
        ],
      });

      const tool = new WebFetchTool(mockConfig, messageBus);
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);

      const subscribeSpy = vi.spyOn(messageBus, 'subscribe');

      // Start confirmation
      const confirmationPromise = invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      // Approve via message bus
      const responseHandler = subscribeSpy.mock.calls[0][1];
      responseHandler({
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId: 'test-correlation-id',
        confirmed: true,
      });

      await confirmationPromise;

      // Execute the tool
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Fetched content');
    });
  });
});
