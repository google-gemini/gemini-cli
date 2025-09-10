/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WebSearchToolParams } from './web-search.js';
import { WebSearchTool } from './web-search.js';
import type { Config } from '../config/config.js';
import { GeminiClient } from '../core/client.js';
import { ToolErrorType } from './tool-error.js';
import { ToolConfirmationOutcome } from './tools.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import { PolicyDecision } from '../policy/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { EventEmitter } from 'node:events';

// Mock GeminiClient and Config constructor
vi.mock('../core/client.js');
vi.mock('../config/config.js');

describe('WebSearchTool', () => {
  const abortSignal = new AbortController().signal;
  let mockGeminiClient: GeminiClient;
  let mockPolicyEngine: PolicyEngine;
  let mockMessageBus: MessageBus;
  let tool: WebSearchTool;
  let mockConfigInstance: Config;

  beforeEach(() => {
    // Create mock PolicyEngine
    mockPolicyEngine = {
      check: vi.fn().mockReturnValue(PolicyDecision.ASK_USER),
    } as unknown as PolicyEngine;
    
    // Create mock MessageBus
    mockMessageBus = new EventEmitter() as unknown as MessageBus;
    
    mockConfigInstance = {
      getGeminiClient: () => mockGeminiClient,
      getProxy: () => undefined,
      getPolicyEngine: () => mockPolicyEngine,
      getMessageBus: () => mockMessageBus,
    } as unknown as Config;
    mockGeminiClient = new GeminiClient(mockConfigInstance);
    tool = new WebSearchTool(mockConfigInstance);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('build', () => {
    it('should return an invocation for a valid query', () => {
      const params: WebSearchToolParams = { query: 'test query' };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
    });

    it('should throw an error for an empty query', () => {
      const params: WebSearchToolParams = { query: '' };
      expect(() => tool.build(params)).toThrow(
        "The 'query' parameter cannot be empty.",
      );
    });

    it('should throw an error for a query with only whitespace', () => {
      const params: WebSearchToolParams = { query: '   ' };
      expect(() => tool.build(params)).toThrow(
        "The 'query' parameter cannot be empty.",
      );
    });
  });

  describe('getDescription', () => {
    it('should return a description of the search', () => {
      const params: WebSearchToolParams = { query: 'test query' };
      const invocation = tool.build(params);
      expect(invocation.getDescription()).toBe(
        'Searching the web for: "test query"',
      );
    });
  });

  describe('execute', () => {
    it('should return search results for a successful query', async () => {
      const params: WebSearchToolParams = { query: 'successful query' };
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Here are your results.' }],
            },
          },
        ],
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toBe(
        'Web search results for "successful query":\n\nHere are your results.',
      );
      expect(result.returnDisplay).toBe(
        'Search results for "successful query" returned.',
      );
      expect(result.sources).toBeUndefined();
    });

    it('should handle no search results found', async () => {
      const params: WebSearchToolParams = { query: 'no results query' };
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: '' }],
            },
          },
        ],
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toBe(
        'No search results or information found for query: "no results query"',
      );
      expect(result.returnDisplay).toBe('No information found.');
    });

    it('should return a WEB_SEARCH_FAILED error on failure', async () => {
      const params: WebSearchToolParams = { query: 'error query' };
      const testError = new Error('API Failure');
      (mockGeminiClient.generateContent as Mock).mockRejectedValue(testError);

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.error?.type).toBe(ToolErrorType.WEB_SEARCH_FAILED);
      expect(result.llmContent).toContain('Error:');
      expect(result.llmContent).toContain('API Failure');
      expect(result.returnDisplay).toBe('Error performing web search.');
    });

    it('should correctly format results with sources and citations', async () => {
      const params: WebSearchToolParams = { query: 'grounding query' };
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'This is a test response.' }],
            },
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: 'https://example.com', title: 'Example Site' } },
                { web: { uri: 'https://google.com', title: 'Google' } },
              ],
              groundingSupports: [
                {
                  segment: { startIndex: 5, endIndex: 14 },
                  groundingChunkIndices: [0],
                },
                {
                  segment: { startIndex: 15, endIndex: 24 },
                  groundingChunkIndices: [0, 1],
                },
              ],
            },
          },
        ],
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      const expectedLlmContent = `Web search results for "grounding query":

This is a test[1] response.[1][2]

Sources:
[1] Example Site (https://example.com)
[2] Google (https://google.com)`;

      expect(result.llmContent).toBe(expectedLlmContent);
      expect(result.returnDisplay).toBe(
        'Search results for "grounding query" returned.',
      );
      expect(result.sources).toHaveLength(2);
    });

    it('should insert markers at correct byte positions for multibyte text', async () => {
      const params: WebSearchToolParams = { query: 'multibyte query' };
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'こんにちは! Gemini CLI✨️' }],
            },
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    title: 'Japanese Greeting',
                    uri: 'https://example.test/japanese-greeting',
                  },
                },
                {
                  web: {
                    title: 'google-gemini/gemini-cli',
                    uri: 'https://github.com/google-gemini/gemini-cli',
                  },
                },
                {
                  web: {
                    title: 'Gemini CLI: your open-source AI agent',
                    uri: 'https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/',
                  },
                },
              ],
              groundingSupports: [
                {
                  segment: {
                    // Byte range of "こんにちは!" (utf-8 encoded)
                    startIndex: 0,
                    endIndex: 16,
                  },
                  groundingChunkIndices: [0],
                },
                {
                  segment: {
                    // Byte range of "Gemini CLI✨️" (utf-8 encoded)
                    startIndex: 17,
                    endIndex: 33,
                  },
                  groundingChunkIndices: [1, 2],
                },
              ],
            },
          },
        ],
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      const expectedLlmContent = `Web search results for "multibyte query":

こんにちは![1] Gemini CLI✨️[2][3]

Sources:
[1] Japanese Greeting (https://example.test/japanese-greeting)
[2] google-gemini/gemini-cli (https://github.com/google-gemini/gemini-cli)
[3] Gemini CLI: your open-source AI agent (https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/)`;

      expect(result.llmContent).toBe(expectedLlmContent);
      expect(result.returnDisplay).toBe(
        'Search results for "multibyte query" returned.',
      );
      expect(result.sources).toHaveLength(3);
    });
  });

  describe('PolicyEngine Integration', () => {
    it('should allow execution when policy returns ALLOW', async () => {
      const params: WebSearchToolParams = { query: 'safe query' };
      const invocation = tool.build(params);
      
      // Mock policy to return ALLOW
      vi.mocked(mockPolicyEngine.check).mockReturnValue(PolicyDecision.ALLOW);
      
      const confirmationResult = await invocation.shouldConfirmExecute?.(abortSignal);
      expect(confirmationResult).toBe(false); // No confirmation needed
      expect(mockPolicyEngine.check).toHaveBeenCalledWith({
        name: 'google_web_search',
        args: params,
      });
    });

    it('should throw error when policy returns DENY', async () => {
      const params: WebSearchToolParams = { query: 'blocked query' };
      const invocation = tool.build(params);
      
      // Mock policy to return DENY
      vi.mocked(mockPolicyEngine.check).mockReturnValue(PolicyDecision.DENY);
      
      await expect(invocation.shouldConfirmExecute?.(abortSignal)).rejects.toThrow(
        'Web search blocked by policy for query: "blocked query"'
      );
      expect(mockPolicyEngine.check).toHaveBeenCalledWith({
        name: 'google_web_search',
        args: params,
      });
    });

    it('should request user confirmation when policy returns ASK_USER', async () => {
      const params: WebSearchToolParams = { query: 'needs confirmation' };
      const invocation = tool.build(params);
      
      // Mock policy to return ASK_USER
      vi.mocked(mockPolicyEngine.check).mockReturnValue(PolicyDecision.ASK_USER);
      
      const confirmationResult = await invocation.shouldConfirmExecute?.(abortSignal);
      expect(confirmationResult).toBeTruthy();
      
      if (confirmationResult && typeof confirmationResult !== 'boolean') {
        expect(confirmationResult.type).toBe('info');
        expect(confirmationResult.title).toBe('Confirm Web Search');
        if ('prompt' in confirmationResult) {
          expect(confirmationResult.prompt).toBe('Allow web search for: "needs confirmation"?');
        }
        expect(confirmationResult.onConfirm).toBeDefined();
      }
      
      expect(mockPolicyEngine.check).toHaveBeenCalledWith({
        name: 'google_web_search',
        args: params,
      });
    });

    it('should handle onConfirm callback for ProceedAlways', async () => {
      const params: WebSearchToolParams = { query: 'always allow this' };
      const invocation = tool.build(params);
      
      // Mock policy to return ASK_USER
      vi.mocked(mockPolicyEngine.check).mockReturnValue(PolicyDecision.ASK_USER);
      
      // Spy on console.log to verify the callback behavior
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const confirmationResult = await invocation.shouldConfirmExecute?.(abortSignal);
      
      if (confirmationResult && typeof confirmationResult !== 'boolean' && confirmationResult.onConfirm) {
        await confirmationResult.onConfirm(ToolConfirmationOutcome.ProceedAlways);
        expect(consoleSpy).toHaveBeenCalledWith(
          'User chose to always allow web searches like: "always allow this"'
        );
      }
      
      consoleSpy.mockRestore();
    });

    it('should use different PolicyEngine decisions for different queries', async () => {
      const safeParams: WebSearchToolParams = { query: 'weather today' };
      const unsafeParams: WebSearchToolParams = { query: 'hack password' };
      
      // Configure different responses for different queries
      vi.mocked(mockPolicyEngine.check).mockImplementation((toolCall) => {
        const args = toolCall.args as unknown as WebSearchToolParams;
        if (args.query.includes('hack')) {
          return PolicyDecision.DENY;
        }
        if (args.query.includes('weather')) {
          return PolicyDecision.ALLOW;
        }
        return PolicyDecision.ASK_USER;
      });
      
      // Test safe query
      const safeInvocation = tool.build(safeParams);
      const safeResult = await safeInvocation.shouldConfirmExecute?.(abortSignal);
      expect(safeResult).toBe(false);
      
      // Test unsafe query
      const unsafeInvocation = tool.build(unsafeParams);
      await expect(unsafeInvocation.shouldConfirmExecute?.(abortSignal)).rejects.toThrow(
        'Web search blocked by policy'
      );
    });
  });
});
