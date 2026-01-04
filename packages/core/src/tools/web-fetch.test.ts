/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { WebFetchTool, parsePrompt } from './web-fetch.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../policy/types.js';
import { ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import {
  createMockMessageBus,
  getMockMessageBusInstance,
} from '../test-utils/mock-message-bus.js';
import * as fetchUtils from '../utils/fetch.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import {
  MessageBusType,
  type ToolConfirmationResponse,
} from '../confirmation-bus/types.js';
import { randomUUID } from 'node:crypto';
import {
  logWebFetchFallbackAttempt,
  WebFetchFallbackAttemptEvent,
} from '../telemetry/index.js';
import { convert } from 'html-to-text';

const mockGenerateContent = vi.fn();
const mockGetGeminiClient = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));

vi.mock('html-to-text', () => ({
  convert: vi.fn((text) => `Converted: ${text}`),
}));

vi.mock('../telemetry/index.js', () => ({
  logWebFetchFallbackAttempt: vi.fn(),
  WebFetchFallbackAttemptEvent: vi.fn(),
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

describe('parsePrompt', () => {
  it('should extract valid URLs separated by whitespace', () => {
    const prompt = 'Go to https://example.com and http://google.com';
    const { validUrls, errors } = parsePrompt(prompt);

    expect(errors).toHaveLength(0);
    expect(validUrls).toHaveLength(2);
    expect(validUrls[0]).toBe('https://example.com/');
    expect(validUrls[1]).toBe('http://google.com/');
  });

  it('should accept URLs with trailing punctuation', () => {
    const prompt = 'Check https://example.com.';
    const { validUrls, errors } = parsePrompt(prompt);

    expect(errors).toHaveLength(0);
    expect(validUrls).toHaveLength(1);
    expect(validUrls[0]).toBe('https://example.com./');
  });

  it.each([
    {
      name: 'URLs wrapped in punctuation',
      prompt: 'Read (https://example.com)',
      expectedErrorContent: ['Malformed URL detected', '(https://example.com)'],
    },
    {
      name: 'unsupported protocols (httpshttps://)',
      prompt: 'Summarize httpshttps://github.com/JuliaLang/julia/issues/58346',
      expectedErrorContent: [
        'Unsupported protocol',
        'httpshttps://github.com/JuliaLang/julia/issues/58346',
      ],
    },
    {
      name: 'unsupported protocols (ftp://)',
      prompt: 'ftp://example.com/file.txt',
      expectedErrorContent: ['Unsupported protocol'],
    },
    {
      name: 'malformed URLs (http://)',
      prompt: 'http://',
      expectedErrorContent: ['Malformed URL detected'],
    },
  ])('should detect $name as errors', ({ prompt, expectedErrorContent }) => {
    const { validUrls, errors } = parsePrompt(prompt);

    expect(validUrls).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expectedErrorContent.forEach((content) => {
      expect(errors[0]).toContain(content);
    });
  });

  it('should handle prompts with no URLs', () => {
    const prompt = 'hello world';
    const { validUrls, errors } = parsePrompt(prompt);

    expect(validUrls).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it('should handle mixed valid and invalid URLs', () => {
    const prompt = 'Valid: https://google.com, Invalid: ftp://bad.com';
    const { validUrls, errors } = parsePrompt(prompt);

    expect(validUrls).toHaveLength(1);
    expect(validUrls[0]).toBe('https://google.com,/');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('ftp://bad.com');
  });
});

describe('WebFetchTool', () => {
  let mockConfig: Config;
  let bus: MessageBus;

  beforeEach(() => {
    vi.resetAllMocks();
    bus = createMockMessageBus();
    getMockMessageBusInstance(bus).defaultToolDecision = 'ask_user';
    mockConfig = {
      getApprovalMode: vi.fn(),
      setApprovalMode: vi.fn(),
      getProxy: vi.fn(),
      getGeminiClient: mockGetGeminiClient,
      getRetryFetchErrors: vi.fn().mockReturnValue(false),
      modelConfigService: {
        getResolvedConfig: vi.fn().mockImplementation(({ model }) => ({
          model,
          generateContentConfig: {},
        })),
      },
      isInteractive: () => false,
    } as unknown as Config;
  });

  describe('validateToolParamValues', () => {
    it.each([
      {
        name: 'empty prompt',
        prompt: '',
        expectedError: "The 'prompt' parameter cannot be empty",
      },
      {
        name: 'prompt with no URLs',
        prompt: 'hello world',
        expectedError: "The 'prompt' must contain at least one valid URL",
      },
      {
        name: 'prompt with malformed URLs',
        prompt: 'fetch httpshttps://example.com',
        expectedError: 'Error(s) in prompt URLs:',
      },
    ])('should throw if $name', ({ prompt, expectedError }) => {
      const tool = new WebFetchTool(mockConfig, bus);
      expect(() => tool.build({ prompt })).toThrow(expectedError);
    });

    it('should pass if prompt contains at least one valid URL', () => {
      const tool = new WebFetchTool(mockConfig, bus);
      expect(() =>
        tool.build({ prompt: 'fetch https://example.com' }),
      ).not.toThrow();
    });
  });

  describe('execute', () => {
    it('should return WEB_FETCH_FALLBACK_FAILED on fallback fetch failure', async () => {
      vi.spyOn(fetchUtils, 'isPrivateIp').mockReturnValue(true);
      vi.spyOn(fetchUtils, 'fetchWithTimeout').mockRejectedValue(
        new Error('fetch failed'),
      );
      const tool = new WebFetchTool(mockConfig, bus);
      const params = { prompt: 'fetch https://private.ip' };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error?.type).toBe(ToolErrorType.WEB_FETCH_FALLBACK_FAILED);
    });

    it('should return WEB_FETCH_PROCESSING_ERROR on general processing failure', async () => {
      vi.spyOn(fetchUtils, 'isPrivateIp').mockReturnValue(false);
      mockGenerateContent.mockRejectedValue(new Error('API error'));
      const tool = new WebFetchTool(mockConfig, bus);
      const params = { prompt: 'fetch https://public.ip' };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.error?.type).toBe(ToolErrorType.WEB_FETCH_PROCESSING_ERROR);
    });

    it('should log telemetry when falling back due to private IP', async () => {
      vi.spyOn(fetchUtils, 'isPrivateIp').mockReturnValue(true);
      // Mock fetchWithTimeout to succeed so fallback proceeds
      vi.spyOn(fetchUtils, 'fetchWithTimeout').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('some content'),
      } as Response);
      mockGenerateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'fallback response' }] } }],
      });

      const tool = new WebFetchTool(mockConfig, bus);
      const params = { prompt: 'fetch https://private.ip' };
      const invocation = tool.build(params);
      await invocation.execute(new AbortController().signal);

      expect(logWebFetchFallbackAttempt).toHaveBeenCalledWith(
        mockConfig,
        expect.any(WebFetchFallbackAttemptEvent),
      );
      expect(WebFetchFallbackAttemptEvent).toHaveBeenCalledWith('private_ip');
    });

    it('should log telemetry when falling back due to primary fetch failure', async () => {
      vi.spyOn(fetchUtils, 'isPrivateIp').mockReturnValue(false);
      // Mock primary fetch to return empty response, triggering fallback
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [],
      });
      // Mock fetchWithTimeout to succeed so fallback proceeds
      vi.spyOn(fetchUtils, 'fetchWithTimeout').mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('some content'),
      } as Response);
      // Mock fallback LLM call
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ text: 'fallback response' }] } }],
      });

      const tool = new WebFetchTool(mockConfig, bus);
      const params = { prompt: 'fetch https://public.ip' };
      const invocation = tool.build(params);
      await invocation.execute(new AbortController().signal);

      expect(logWebFetchFallbackAttempt).toHaveBeenCalledWith(
        mockConfig,
        expect.any(WebFetchFallbackAttemptEvent),
      );
      expect(WebFetchFallbackAttemptEvent).toHaveBeenCalledWith(
        'primary_failed',
      );
    });
  });

  describe('execute (fallback)', () => {
    beforeEach(() => {
      // Force fallback by mocking primary fetch to fail
      vi.spyOn(fetchUtils, 'isPrivateIp').mockReturnValue(false);
      mockGenerateContent.mockResolvedValueOnce({
        candidates: [],
      });
    });

    it.each([
      {
        name: 'HTML content using html-to-text',
        content: '<html><body><h1>Hello</h1></body></html>',
        contentType: 'text/html; charset=utf-8',
        shouldConvert: true,
      },
      {
        name: 'raw text for JSON content',
        content: '{"key": "value"}',
        contentType: 'application/json',
        shouldConvert: false,
      },
      {
        name: 'raw text for plain text content',
        content: 'Just some text.',
        contentType: 'text/plain',
        shouldConvert: false,
      },
      {
        name: 'content with no Content-Type header as HTML',
        content: '<p>No header</p>',
        contentType: null,
        shouldConvert: true,
      },
    ])(
      'should handle $name',
      async ({ content, contentType, shouldConvert }) => {
        const headers = contentType
          ? new Headers({ 'content-type': contentType })
          : new Headers();

        vi.spyOn(fetchUtils, 'fetchWithTimeout').mockResolvedValue({
          ok: true,
          headers,
          text: () => Promise.resolve(content),
        } as Response);

        // Mock fallback LLM call to return the content passed to it
        mockGenerateContent.mockImplementationOnce(async (_, req) => ({
          candidates: [
            { content: { parts: [{ text: req[0].parts[0].text }] } },
          ],
        }));

        const tool = new WebFetchTool(mockConfig, bus);
        const params = { prompt: 'fetch https://example.com' };
        const invocation = tool.build(params);
        const result = await invocation.execute(new AbortController().signal);

        if (shouldConvert) {
          expect(convert).toHaveBeenCalledWith(content, {
            wordwrap: false,
            selectors: [
              { selector: 'a', options: { ignoreHref: true } },
              { selector: 'img', format: 'skip' },
            ],
          });
          expect(result.llmContent).toContain(`Converted: ${content}`);
        } else {
          expect(convert).not.toHaveBeenCalled();
          expect(result.llmContent).toContain(content);
        }
      },
    );
  });

  describe('shouldConfirmExecute', () => {
    it('should return confirmation details with the correct prompt and parsed urls', async () => {
      const tool = new WebFetchTool(mockConfig, bus);
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);
      const confirmationDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(confirmationDetails).toEqual({
        type: 'info',
        title: 'Confirm Web Fetch',
        prompt: 'fetch https://example.com',
        urls: ['https://example.com/'],
        onConfirm: expect.any(Function),
      });
    });

    it('should convert github urls to raw format', async () => {
      const tool = new WebFetchTool(mockConfig, bus);
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
      const tool = new WebFetchTool(mockConfig, bus);
      const params = { prompt: 'fetch https://example.com' };
      const invocation = tool.build(params);
      const confirmationDetails = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(confirmationDetails).toBe(false);
    });

    it('should call setApprovalMode when onConfirm is called with ProceedAlways', async () => {
      const tool = new WebFetchTool(mockConfig, bus);
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

    const createToolWithMessageBus = (customBus?: MessageBus) => {
      const tool = new WebFetchTool(mockConfig, customBus ?? bus);
      const params = { prompt: 'fetch https://example.com' };
      return { tool, invocation: tool.build(params) };
    };

    const simulateMessageBusResponse = (
      subscribeSpy: ReturnType<typeof vi.spyOn>,
      confirmed: boolean,
      correlationId = 'test-correlation-id',
    ) => {
      const responseHandler = subscribeSpy.mock.calls[0][1] as (
        response: ToolConfirmationResponse,
      ) => void;
      const response: ToolConfirmationResponse = {
        type: MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        correlationId,
        confirmed,
      };
      responseHandler(response);
    };

    beforeEach(() => {
      policyEngine = new PolicyEngine();
      messageBus = new MessageBus(policyEngine);
      mockUUID = vi.mocked(randomUUID);
      mockUUID.mockReturnValue('test-correlation-id');
    });

    it('should use message bus for confirmation when available', async () => {
      const { invocation } = createToolWithMessageBus(messageBus);
      const publishSpy = vi.spyOn(messageBus, 'publish');
      const subscribeSpy = vi.spyOn(messageBus, 'subscribe');
      const unsubscribeSpy = vi.spyOn(messageBus, 'unsubscribe');

      const confirmationPromise = invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(publishSpy).toHaveBeenCalledWith({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: {
          name: 'web_fetch',
          args: { prompt: 'fetch https://example.com' },
        },
        correlationId: 'test-correlation-id',
      });

      expect(subscribeSpy).toHaveBeenCalledWith(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        expect.any(Function),
      );

      simulateMessageBusResponse(subscribeSpy, true);

      const result = await confirmationPromise;
      expect(result).toBe(false);
      expect(unsubscribeSpy).toHaveBeenCalled();
    });

    it('should reject promise when confirmation is denied via message bus', async () => {
      const { invocation } = createToolWithMessageBus(messageBus);
      const subscribeSpy = vi.spyOn(messageBus, 'subscribe');

      const confirmationPromise = invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      simulateMessageBusResponse(subscribeSpy, false);

      await expect(confirmationPromise).rejects.toThrow(
        'Tool execution for "WebFetch" denied by policy.',
      );
    });

    it('should handle timeout gracefully', async () => {
      vi.useFakeTimers();
      const { invocation } = createToolWithMessageBus(messageBus);
      const confirmationPromise = invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      await vi.advanceTimersByTimeAsync(30000);
      const result = await confirmationPromise;
      expect(result).not.toBe(false);
      expect(result).toHaveProperty('type', 'info');

      vi.useRealTimers();
    });

    it('should handle abort signal during confirmation', async () => {
      const { invocation } = createToolWithMessageBus(messageBus);
      const abortController = new AbortController();
      const confirmationPromise = invocation.shouldConfirmExecute(
        abortController.signal,
      );

      abortController.abort();

      await expect(confirmationPromise).rejects.toThrow(
        'Tool execution for "WebFetch" denied by policy.',
      );
    });

    it('should ignore responses with wrong correlation ID', async () => {
      vi.useFakeTimers();
      const { invocation } = createToolWithMessageBus(messageBus);
      const subscribeSpy = vi.spyOn(messageBus, 'subscribe');
      const confirmationPromise = invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      simulateMessageBusResponse(subscribeSpy, true, 'wrong-id');

      await vi.advanceTimersByTimeAsync(30000);
      const result = await confirmationPromise;
      expect(result).not.toBe(false);
      expect(result).toHaveProperty('type', 'info');

      vi.useRealTimers();
    });

    it('should handle message bus publish errors gracefully', async () => {
      const { invocation } = createToolWithMessageBus(messageBus);
      vi.spyOn(messageBus, 'publish').mockImplementation(() => {
        throw new Error('Message bus error');
      });

      const result = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(result).toBe(false);
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

      const { invocation } = createToolWithMessageBus(messageBus);
      const subscribeSpy = vi.spyOn(messageBus, 'subscribe');

      const confirmationPromise = invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      simulateMessageBusResponse(subscribeSpy, true);

      await confirmationPromise;

      const result = await invocation.execute(new AbortController().signal);
      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Fetched content');
    });
  });
});
