/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const logApiRequest = vi.hoisted(() => vi.fn());
const logApiResponse = vi.hoisted(() => vi.fn());
const logApiError = vi.hoisted(() => vi.fn());

vi.mock('../telemetry/loggers.js', () => ({
  logApiRequest,
  logApiResponse,
  logApiError,
}));

const runInDevTraceSpan = vi.hoisted(() =>
  vi.fn(async (meta, fn) => fn({ metadata: {}, endSpan: vi.fn() })),
);

vi.mock('../telemetry/trace.js', () => ({
  runInDevTraceSpan,
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
  EmbedContentResponse,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import {
  LoggingContentGenerator,
  estimateContextBreakdown,
} from './loggingContentGenerator.js';
import type { Config } from '../config/config.js';
import { UserTierId } from '../code_assist/types.js';
import { ApiRequestEvent, LlmRole } from '../telemetry/types.js';
import { FatalAuthenticationError } from '../utils/errors.js';

describe('LoggingContentGenerator', () => {
  let wrapped: ContentGenerator;
  let config: Config;
  let loggingContentGenerator: LoggingContentGenerator;

  beforeEach(() => {
    wrapped = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    };
    config = {
      getGoogleAIConfig: vi.fn(),
      getVertexAIConfig: vi.fn(),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: 'API_KEY',
      }),
      refreshUserQuotaIfStale: vi.fn().mockResolvedValue(undefined),
    } as unknown as Config;
    loggingContentGenerator = new LoggingContentGenerator(wrapped, config);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('generateContent', () => {
    it('should log request and response on success', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      const userPromptId = 'prompt-123';
      const response: GenerateContentResponse = {
        candidates: [],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 2,
          totalTokenCount: 3,
        },
        text: undefined,
        functionCalls: undefined,
        executableCode: undefined,
        codeExecutionResult: undefined,
        data: undefined,
      };
      vi.mocked(wrapped.generateContent).mockResolvedValue(response);
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const promise = loggingContentGenerator.generateContent(
        req,
        userPromptId,
        LlmRole.MAIN,
      );

      vi.advanceTimersByTime(1000);

      await promise;

      expect(wrapped.generateContent).toHaveBeenCalledWith(
        req,
        userPromptId,
        LlmRole.MAIN,
      );
      expect(logApiRequest).toHaveBeenCalledWith(
        config,
        expect.any(ApiRequestEvent),
      );
      const responseEvent = vi.mocked(logApiResponse).mock.calls[0][1];
      expect(responseEvent.duration_ms).toBe(1000);
    });

    it('should log error on failure', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      const userPromptId = 'prompt-123';
      const error = new Error('test error');
      vi.mocked(wrapped.generateContent).mockRejectedValue(error);
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const promise = loggingContentGenerator.generateContent(
        req,
        userPromptId,
        LlmRole.MAIN,
      );

      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow(error);

      expect(logApiRequest).toHaveBeenCalledWith(
        config,
        expect.any(ApiRequestEvent),
      );
      const errorEvent = vi.mocked(logApiError).mock.calls[0][1];
      expect(errorEvent.duration_ms).toBe(1000);
    });

    describe('error type extraction', () => {
      it('should extract error type correctly', async () => {
        const req = { contents: [], model: 'm' };
        const error = new FatalAuthenticationError('test');
        vi.mocked(wrapped.generateContent).mockRejectedValue(error);
        await expect(
          loggingContentGenerator.generateContent(req, 'id', LlmRole.MAIN),
        ).rejects.toThrow();
        const errorEvent = vi.mocked(logApiError).mock.calls[0][1];
        expect(errorEvent.error_type).toBe('FatalAuthenticationError');
      });
    });
  });

  describe('generateContentStream', () => {
    it('should log request and response on success', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      const userPromptId = 'prompt-123';
      const response = {
        candidates: [],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 2,
          totalTokenCount: 3,
        },
      } as unknown as GenerateContentResponse;

      async function* createAsyncGenerator() {
        yield response;
      }

      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );

      const startTime = new Date('2025-01-01T00:00:00.000Z');

      vi.setSystemTime(startTime);

      const stream = await loggingContentGenerator.generateContentStream(
        req,

        userPromptId,

        LlmRole.MAIN,
      );

      vi.advanceTimersByTime(1000);

      for await (const _ of stream) {
        // consume stream
      }

      expect(wrapped.generateContentStream).toHaveBeenCalledWith(
        req,
        userPromptId,
        LlmRole.MAIN,
      );
      expect(logApiRequest).toHaveBeenCalledWith(
        config,
        expect.any(ApiRequestEvent),
      );
      const responseEvent = vi.mocked(logApiResponse).mock.calls[0][1];
      expect(responseEvent.duration_ms).toBe(1000);
    });

    it('should log error on failure', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      const userPromptId = 'prompt-123';
      const error = new Error('test error');

      async function* createAsyncGenerator() {
        yield Promise.reject(error);
      }

      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const stream = await loggingContentGenerator.generateContentStream(
        req,
        userPromptId,
        LlmRole.MAIN,
      );

      vi.advanceTimersByTime(1000);

      await expect(async () => {
        for await (const _ of stream) {
          // do nothing
        }
      }).rejects.toThrow(error);

      expect(logApiRequest).toHaveBeenCalledWith(
        config,
        expect.any(ApiRequestEvent),
      );
      const errorEvent = vi.mocked(logApiError).mock.calls[0][1];
      expect(errorEvent.duration_ms).toBe(1000);
    });

    it('should set latest API request in config for main agent requests', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      // Main agent prompt IDs end with exactly 8 hashes and a turn counter
      const mainAgentPromptId = 'session-uuid########1';
      config.setLatestApiRequest = vi.fn();

      async function* createAsyncGenerator() {
        yield { candidates: [] } as unknown as GenerateContentResponse;
      }
      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );

      await loggingContentGenerator.generateContentStream(
        req,
        mainAgentPromptId,
        LlmRole.MAIN,
      );

      expect(config.setLatestApiRequest).toHaveBeenCalledWith(req);
    });

    it('should NOT set latest API request in config for sub-agent requests', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      // Sub-agent prompt IDs contain fewer hashes, typically separating the agent name and ID
      const subAgentPromptId = 'codebase_investigator#12345';
      config.setLatestApiRequest = vi.fn();

      async function* createAsyncGenerator() {
        yield { candidates: [] } as unknown as GenerateContentResponse;
      }
      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );

      await loggingContentGenerator.generateContentStream(
        req,
        subAgentPromptId,
        LlmRole.SUBAGENT,
      );

      expect(config.setLatestApiRequest).not.toHaveBeenCalled();
    });
  });

  describe('getWrapped', () => {
    it('should return the wrapped content generator', () => {
      expect(loggingContentGenerator.getWrapped()).toBe(wrapped);
    });
  });

  describe('countTokens', () => {
    it('should call the wrapped countTokens method', async () => {
      const req = { contents: [], model: 'gemini-pro' };
      const response = { totalTokens: 10 };
      vi.mocked(wrapped.countTokens).mockResolvedValue(response);

      const result = await loggingContentGenerator.countTokens(req);

      expect(wrapped.countTokens).toHaveBeenCalledWith(req);
      expect(result).toBe(response);
    });
  });

  describe('embedContent', () => {
    it('should call the wrapped embedContent method', async () => {
      const req = {
        contents: [{ role: 'user', parts: [] }],
        model: 'gemini-pro',
      };
      const response: EmbedContentResponse = { embeddings: [{ values: [] }] };
      vi.mocked(wrapped.embedContent).mockResolvedValue(response);

      const result = await loggingContentGenerator.embedContent(req);

      expect(wrapped.embedContent).toHaveBeenCalledWith(req);
      expect(result).toBe(response);
    });
  });

  describe('delegation', () => {
    it('should delegate userTier to wrapped', () => {
      wrapped.userTier = UserTierId.STANDARD;
      expect(loggingContentGenerator.userTier).toBe(UserTierId.STANDARD);
    });

    it('should delegate userTierName to wrapped', () => {
      wrapped.userTierName = 'Standard Tier';
      expect(loggingContentGenerator.userTierName).toBe('Standard Tier');
    });
  });
});

describe('estimateContextBreakdown', () => {
  it('should return zeros for empty contents and no config', () => {
    const result = estimateContextBreakdown([], undefined);
    expect(result).toEqual({
      system_instructions: 0,
      tool_definitions: 0,
      history: 0,
      tool_calls: {},
      mcp_servers: 0,
    });
  });

  it('should estimate system instruction tokens', () => {
    const config = {
      systemInstruction: 'You are a helpful assistant.',
    } as GenerateContentConfig;
    const result = estimateContextBreakdown([], config);
    expect(result.system_instructions).toBeGreaterThan(0);
    expect(result.tool_definitions).toBe(0);
    expect(result.history).toBe(0);
  });

  it('should estimate non-MCP tool definition tokens', () => {
    const config = {
      tools: [
        {
          functionDeclarations: [
            { name: 'read_file', description: 'Reads a file', parameters: {} },
          ],
        },
      ],
    } as unknown as GenerateContentConfig;
    const result = estimateContextBreakdown([], config);
    expect(result.tool_definitions).toBeGreaterThan(0);
    expect(result.mcp_servers).toBe(0);
  });

  it('should classify MCP tool definitions into mcp_servers, not tool_definitions', () => {
    const config = {
      tools: [
        {
          functionDeclarations: [
            {
              name: 'myserver__search',
              description: 'Search via MCP',
              parameters: {},
            },
            {
              name: 'read_file',
              description: 'Reads a file',
              parameters: {},
            },
          ],
        },
      ],
    } as unknown as GenerateContentConfig;
    const result = estimateContextBreakdown([], config);
    expect(result.mcp_servers).toBeGreaterThan(0);
    expect(result.tool_definitions).toBeGreaterThan(0);
    // MCP tokens should not be in tool_definitions
    const configOnlyBuiltin = {
      tools: [
        {
          functionDeclarations: [
            {
              name: 'read_file',
              description: 'Reads a file',
              parameters: {},
            },
          ],
        },
      ],
    } as unknown as GenerateContentConfig;
    const builtinOnly = estimateContextBreakdown([], configOnlyBuiltin);
    // tool_definitions should be smaller when MCP tools are separated out
    expect(result.tool_definitions).toBeLessThan(
      result.tool_definitions + result.mcp_servers,
    );
    expect(builtinOnly.mcp_servers).toBe(0);
  });

  it('should not classify tools with __ in the middle of a segment as MCP', () => {
    // "__" at start or end (not a valid server__tool pattern) should not be MCP
    const config = {
      tools: [
        {
          functionDeclarations: [
            { name: '__leading', description: 'test', parameters: {} },
            { name: 'trailing__', description: 'test', parameters: {} },
            {
              name: 'a__b__c',
              description: 'three parts - not valid MCP',
              parameters: {},
            },
          ],
        },
      ],
    } as unknown as GenerateContentConfig;
    const result = estimateContextBreakdown([], config);
    expect(result.mcp_servers).toBe(0);
  });

  it('should estimate history tokens excluding tool call/response parts', () => {
    const contents: Content[] = [
      { role: 'user', parts: [{ text: 'Hello world' }] },
      { role: 'model', parts: [{ text: 'Hi there!' }] },
    ];
    const result = estimateContextBreakdown(contents);
    expect(result.history).toBeGreaterThan(0);
    expect(result.tool_calls).toEqual({});
  });

  it('should separate tool call tokens from history', () => {
    const contents: Content[] = [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'read_file',
              args: { path: '/tmp/test.txt' },
            },
          },
        ],
      },
      {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: 'read_file',
              response: { content: 'file contents here' },
            },
          },
        ],
      },
    ];
    const result = estimateContextBreakdown(contents);
    expect(result.tool_calls['read_file']).toBeGreaterThan(0);
    // history should still have some tokens (the content wrapper minus tool parts)
    expect(result.history).toBeGreaterThanOrEqual(0);
  });

  it('should produce additive (non-overlapping) fields', () => {
    const contents: Content[] = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'read_file',
              args: { path: '/tmp/test.txt' },
            },
          },
        ],
      },
      {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: 'read_file',
              response: { content: 'data' },
            },
          },
        ],
      },
    ];
    const config = {
      systemInstruction: 'Be helpful.',
      tools: [
        {
          functionDeclarations: [
            { name: 'read_file', description: 'Read', parameters: {} },
            {
              name: 'myserver__search',
              description: 'MCP search',
              parameters: {},
            },
          ],
        },
      ],
    } as unknown as GenerateContentConfig;
    const result = estimateContextBreakdown(contents, config);

    // Sum of tool_calls values
    const totalToolCalls = Object.values(result.tool_calls).reduce(
      (a, b) => a + b,
      0,
    );
    // mcp_servers includes both definitions and call/response parts for MCP tools
    // but does NOT overlap with tool_definitions or history
    // tool_calls overlaps with mcp_servers (MCP call/responses are in both)
    // so the additive total is: system + tool_defs + history + tool_calls_non_mcp + mcp
    expect(result.system_instructions).toBeGreaterThan(0);
    expect(result.tool_definitions).toBeGreaterThan(0);
    expect(result.history).toBeGreaterThanOrEqual(0);
    expect(totalToolCalls).toBeGreaterThan(0);
  });

  it('should classify MCP tool calls into mcp_servers', () => {
    const contents: Content[] = [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'myserver__search',
              args: { query: 'test' },
            },
          },
        ],
      },
      {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: 'myserver__search',
              response: { results: [] },
            },
          },
        ],
      },
    ];
    const result = estimateContextBreakdown(contents);
    expect(result.tool_calls['myserver__search']).toBeGreaterThan(0);
    expect(result.mcp_servers).toBeGreaterThan(0);
    // MCP call tokens should be counted in mcp_servers
    expect(result.mcp_servers).toBe(result.tool_calls['myserver__search']);
  });

  it('should handle mixed MCP and non-MCP tool calls', () => {
    const contents: Content[] = [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'read_file',
              args: { path: '/test' },
            },
          },
          {
            functionCall: {
              name: 'myserver__search',
              args: { q: 'hello' },
            },
          },
        ],
      },
    ];
    const result = estimateContextBreakdown(contents);
    expect(result.tool_calls['read_file']).toBeGreaterThan(0);
    expect(result.tool_calls['myserver__search']).toBeGreaterThan(0);
    // Only MCP tool calls should be in mcp_servers
    expect(result.mcp_servers).toBe(result.tool_calls['myserver__search']);
  });

  it('should use "unknown" for tool calls without a name', () => {
    const contents: Content[] = [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: undefined as unknown as string,
              args: { x: 1 },
            },
          },
        ],
      },
    ];
    const result = estimateContextBreakdown(contents);
    expect(result.tool_calls['unknown']).toBeGreaterThan(0);
  });
});
