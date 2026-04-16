/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSqueezSummarizer, checkSqueezHealth } from './squeezSummarizer.js';
import type { ToolResult } from '../tools/tools.js';
import type { Config } from '../config/config.js';
import type { GeminiClient } from '../core/client.js';
import { debugLogger } from './debugLogger.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock debugLogger
vi.mock('./debugLogger.js', () => ({
  debugLogger: {
    warn: vi.fn(),
  },
}));

describe('squeezSummarizer', () => {
  let mockConfig: Config;
  let mockGeminiClient: GeminiClient;
  let abortSignal: AbortSignal;

  beforeEach(() => {
    mockConfig = {} as Config;
    mockGeminiClient = {} as GeminiClient;
    abortSignal = new AbortController().signal;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSqueezSummarizer', () => {
    it('should extract relevant lines from squeez response with XML tags', async () => {
      const squeezResponse = {
        choices: [
          {
            message: {
              content:
                '<relevant_lines>\ntests/test_auth.py::test_token_refresh FAILED\n\ndef test_token_refresh(self):\n    token = self.client.get_token(expired=True)\n>   refreshed = self.client.refresh(token)\nE   AuthenticationError: Token refresh window expired\n</relevant_lines>',
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(squeezResponse),
      });

      const summarizer = createSqueezSummarizer({
        serverUrl: 'http://localhost:8000/v1',
      });

      const result: ToolResult = {
        llmContent: 'Output: lots of verbose test output...',
        returnDisplay: 'test output',
        data: { command: 'pytest tests/ -v' },
      };

      const summary = await summarizer(
        mockConfig,
        result,
        mockGeminiClient,
        abortSignal,
      );

      expect(summary).toContain('test_token_refresh');
      expect(summary).toContain('AuthenticationError');
      expect(mockFetch).toHaveBeenCalledOnce();

      // Verify the API call
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:8000/v1/chat/completions');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('default');
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].content).toContain('pytest tests/ -v');
    });

    it('should use custom model name when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '<relevant_lines>\nfiltered output\n</relevant_lines>' } }],
          }),
      });

      const summarizer = createSqueezSummarizer({
        serverUrl: 'http://localhost:8000/v1',
        model: 'KRLabsOrg/squeez-2b',
      });

      const result: ToolResult = {
        llmContent: 'raw output',
        returnDisplay: 'output',
      };

      await summarizer(mockConfig, result, mockGeminiClient, abortSignal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('KRLabsOrg/squeez-2b');
    });

    it('should include API key in Authorization header when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '<relevant_lines>\nresult\n</relevant_lines>' } }],
          }),
      });

      const summarizer = createSqueezSummarizer({
        serverUrl: 'http://localhost:8000/v1',
        apiKey: 'test-api-key',
      });

      const result: ToolResult = { llmContent: 'output', returnDisplay: 'output' };
      await summarizer(mockConfig, result, mockGeminiClient, abortSignal);

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer test-api-key');
    });

    it('should return raw content when XML tags are not present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'just plain filtered output' } }],
          }),
      });

      const summarizer = createSqueezSummarizer({
        serverUrl: 'http://localhost:8000/v1',
      });

      const result: ToolResult = { llmContent: 'raw', returnDisplay: 'raw' };
      const summary = await summarizer(mockConfig, result, mockGeminiClient, abortSignal);

      expect(summary).toBe('just plain filtered output');
    });

    it('should fall back to original output when squeez server fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const summarizer = createSqueezSummarizer({
        serverUrl: 'http://localhost:8000/v1',
      });

      const result: ToolResult = {
        llmContent: 'original output that should be preserved',
        returnDisplay: 'output',
      };

      const summary = await summarizer(mockConfig, result, mockGeminiClient, abortSignal);

      expect(summary).toBe('original output that should be preserved');
      expect(debugLogger.warn).toHaveBeenCalled();
    });

    it('should fall back to original output on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const summarizer = createSqueezSummarizer({
        serverUrl: 'http://localhost:8000/v1',
      });

      const result: ToolResult = {
        llmContent: 'fallback content',
        returnDisplay: 'output',
      };

      const summary = await summarizer(mockConfig, result, mockGeminiClient, abortSignal);

      expect(summary).toBe('fallback content');
      expect(debugLogger.warn).toHaveBeenCalled();
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      mockFetch.mockRejectedValueOnce({ name: 'AbortError' });

      const summarizer = createSqueezSummarizer({
        serverUrl: 'http://localhost:8000/v1',
      });

      const result: ToolResult = { llmContent: 'output', returnDisplay: 'output' };
      const summary = await summarizer(
        mockConfig,
        result,
        mockGeminiClient,
        controller.signal,
      );

      expect(summary).toBe('output');
    });

    it('should handle non-string llmContent by stringifying', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: '<relevant_lines>\nfiltered\n</relevant_lines>' } }],
          }),
      });

      const summarizer = createSqueezSummarizer({
        serverUrl: 'http://localhost:8000/v1',
      });

      const result: ToolResult = {
        llmContent: ['part1', 'part2'] as unknown as string,
        returnDisplay: 'output',
      };

      await summarizer(mockConfig, result, mockGeminiClient, abortSignal);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[1].content).toContain('part1');
    });
  });

  describe('checkSqueezHealth', () => {
    it('should return true when server is reachable', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const healthy = await checkSqueezHealth('http://localhost:8000/v1');

      expect(healthy).toBe(true);
    });

    it('should return false when server is not reachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const healthy = await checkSqueezHealth('http://localhost:8000/v1');

      expect(healthy).toBe(false);
    });

    it('should return false when server returns error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

      const healthy = await checkSqueezHealth('http://localhost:8000/v1');

      expect(healthy).toBe(false);
    });
  });
});
