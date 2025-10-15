/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebFetchTool, parsePrompt } from './web-fetch.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import { ToolConfirmationOutcome } from './tools.js';
import { ToolErrorType } from './tool-error.js';
import * as fetchUtils from '../utils/fetch.js';
import {
  logWebFetchFallbackAttempt,
  WebFetchFallbackAttemptEvent,
} from '../telemetry/index.js';

const mockGenerateContent = vi.fn();
const mockGetGeminiClient = vi.fn(() => ({
  generateContent: mockGenerateContent,
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

  it('should detect URLs wrapped in punctuation as malformed', () => {
    const prompt = 'Read (https://example.com)';
    const { validUrls, errors } = parsePrompt(prompt);

    expect(validUrls).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Malformed URL detected');
    expect(errors[0]).toContain('(https://example.com)');
  });

  it('should detect unsupported protocols (httpshttps://)', () => {
    const prompt =
      'Summarize httpshttps://github.com/JuliaLang/julia/issues/58346';
    const { validUrls, errors } = parsePrompt(prompt);

    expect(validUrls).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Unsupported protocol');
    expect(errors[0]).toContain(
      'httpshttps://github.com/JuliaLang/julia/issues/58346',
    );
  });

  it('should detect unsupported protocols (ftp://)', () => {
    const prompt = 'ftp://example.com/file.txt';
    const { validUrls, errors } = parsePrompt(prompt);

    expect(validUrls).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Unsupported protocol');
  });

  it('should detect malformed URLs', () => {
    // http:// is not a valid URL in Node's new URL()
    const prompt = 'http://';
    const { validUrls, errors } = parsePrompt(prompt);

    expect(validUrls).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Malformed URL detected');
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

  beforeEach(() => {
    vi.resetAllMocks();
    mockConfig = {
      getApprovalMode: vi.fn(),
      setApprovalMode: vi.fn(),
      getProxy: vi.fn(),
      getGeminiClient: mockGetGeminiClient,
    } as unknown as Config;
  });

  describe('validateToolParamValues', () => {
    it('should throw if prompt is empty', () => {
      const tool = new WebFetchTool(mockConfig);
      expect(() => tool.build({ prompt: '' })).toThrow(
        "The 'prompt' parameter cannot be empty",
      );
    });

    it('should throw if prompt contains no URLs', () => {
      const tool = new WebFetchTool(mockConfig);
      expect(() => tool.build({ prompt: 'hello world' })).toThrow(
        "The 'prompt' must contain at least one valid URL",
      );
    });

    it('should throw if prompt contains malformed URLs (httpshttps://)', () => {
      const tool = new WebFetchTool(mockConfig);
      const prompt = 'fetch httpshttps://example.com';
      expect(() => tool.build({ prompt })).toThrow('Error(s) in prompt URLs:');
    });

    it('should pass if prompt contains at least one valid URL', () => {
      const tool = new WebFetchTool(mockConfig);
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

      const tool = new WebFetchTool(mockConfig);
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

      const tool = new WebFetchTool(mockConfig);
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

  describe('shouldConfirmExecute', () => {
    it('should return confirmation details with the correct prompt and parsed urls', async () => {
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
        urls: ['https://example.com/'],
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
});
