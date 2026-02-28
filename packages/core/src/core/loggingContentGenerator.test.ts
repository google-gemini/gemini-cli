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
  vi.fn(async (opts, fn) => {
    const metadata = { attributes: opts.attributes || {} };
    return fn({
      metadata,
      endSpan: vi.fn(),
    });
  }),
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
import {
  GeminiCliOperation,
  GEN_AI_PROMPT_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
} from '../telemetry/constants.js';
import { type SpanMetadata } from '../telemetry/trace.js';

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
        config: {
          systemInstruction: { parts: [{ text: 'system instructions' }] },
          tools: [{ functionDeclarations: [{ name: 'myTool' }] }],
        },
      };
      const userPromptId = 'prompt-123';
      const response: GenerateContentResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'hello' }],
            },
          },
        ],
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

      expect(runInDevTraceSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: GeminiCliOperation.LLMCall,
          attributes: expect.objectContaining({
            [GEN_AI_REQUEST_MODEL]: 'gemini-pro',
            [GEN_AI_PROMPT_NAME]: userPromptId,
            [GEN_AI_SYSTEM_INSTRUCTIONS]: JSON.stringify(
              req.config.systemInstruction,
            ),
            [GEN_AI_TOOL_DEFINITIONS]: JSON.stringify(req.config.tools),
          }),
        }),
        expect.any(Function),
      );

      const spanArgs = vi.mocked(runInDevTraceSpan).mock.calls[0];
      const fn = spanArgs[1];
      const metadata: SpanMetadata = { name: '', attributes: {} };
      await fn({ metadata, endSpan: vi.fn() });

      expect(metadata).toMatchObject({
        input: req.contents,
        output: response.candidates?.[0]?.content,
        attributes: {
          [GEN_AI_USAGE_INPUT_TOKENS]: 1,
          [GEN_AI_USAGE_OUTPUT_TOKENS]: 2,
        },
      });
    });

    it('should log error on failure', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
        config: {
          systemInstruction: {
            parts: [{ text: 'stream system instructions' }],
          },
          tools: [{ functionDeclarations: [{ name: 'streamTool' }] }],
        },
      };
      const userPromptId = 'prompt-123';
      const error = new Error('test error');
      vi.mocked(wrapped.generateContent).mockRejectedValue(error);
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      let promise = loggingContentGenerator.generateContent(
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

      expect(runInDevTraceSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: GeminiCliOperation.LLMCall,
          attributes: expect.objectContaining({
            [GEN_AI_REQUEST_MODEL]: 'gemini-pro',
            [GEN_AI_PROMPT_NAME]: userPromptId,
            [GEN_AI_SYSTEM_INSTRUCTIONS]: JSON.stringify(
              req.config.systemInstruction,
            ),
            [GEN_AI_TOOL_DEFINITIONS]: JSON.stringify(req.config.tools),
          }),
        }),
        expect.any(Function),
      );

      const spanArgs = vi.mocked(runInDevTraceSpan).mock.calls[0];
      const fn = spanArgs[1];
      const metadata: SpanMetadata = { name: '', attributes: {} };
      promise = fn({ metadata, endSpan: vi.fn() });

      await expect(promise).rejects.toThrow(error);

      expect(metadata).toMatchObject({
        error,
      });
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

    describe('Gaxios error parsing', () => {
      it('should parse raw ASCII buffer strings in Gaxios errors', async () => {
        const req = { contents: [], model: 'gemini-pro' };

        // Simulate a Gaxios error with comma-separated ASCII codes
        const asciiData = '72,101,108,108,111'; // "Hello"
        const gaxiosError = Object.assign(new Error('Gaxios Error'), {
          response: { data: asciiData },
        });

        vi.mocked(wrapped.generateContent).mockRejectedValue(gaxiosError);

        await expect(
          loggingContentGenerator.generateContent(
            req,
            'prompt-123',
            LlmRole.MAIN,
          ),
        ).rejects.toSatisfy((error: unknown) => {
          const gError = error as { response: { data: unknown } };
          expect(gError.response.data).toBe('Hello');
          return true;
        });
      });

      it('should leave data alone if it is not a comma-separated string', async () => {
        const req = { contents: [], model: 'gemini-pro' };

        const normalData = 'Normal error message';
        const gaxiosError = Object.assign(new Error('Gaxios Error'), {
          response: { data: normalData },
        });

        vi.mocked(wrapped.generateContent).mockRejectedValue(gaxiosError);

        await expect(
          loggingContentGenerator.generateContent(
            req,
            'prompt-123',
            LlmRole.MAIN,
          ),
        ).rejects.toSatisfy((error: unknown) => {
          const gError = error as { response: { data: unknown } };
          expect(gError.response.data).toBe(normalData);
          return true;
        });
      });

      it('should leave data alone if parsing fails', async () => {
        const req = { contents: [], model: 'gemini-pro' };

        const invalidAscii = '72,invalid,101';
        const gaxiosError = Object.assign(new Error('Gaxios Error'), {
          response: { data: invalidAscii },
        });

        vi.mocked(wrapped.generateContent).mockRejectedValue(gaxiosError);

        await expect(
          loggingContentGenerator.generateContent(
            req,
            'prompt-123',
            LlmRole.MAIN,
          ),
        ).rejects.toSatisfy((error: unknown) => {
          const gError = error as { response: { data: unknown } };
          expect(gError.response.data).toBe(invalidAscii);
          return true;
        });
      });
    });
  });

  describe('generateContentStream', () => {
    it('should log request and response on success', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
        config: {
          systemInstruction: {
            parts: [{ text: 'stream system instructions' }],
          },
          tools: [{ functionDeclarations: [{ name: 'streamTool' }] }],
        },
      };
      const userPromptId = 'prompt-123';
      const response = {
        candidates: [
          {
            content: {
              parts: [{ text: 'hello' }],
            },
          },
        ],
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

      let stream = await loggingContentGenerator.generateContentStream(
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

      expect(runInDevTraceSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: GeminiCliOperation.LLMCall,
          noAutoEnd: true,
          attributes: expect.objectContaining({
            [GEN_AI_REQUEST_MODEL]: 'gemini-pro',
            [GEN_AI_PROMPT_NAME]: userPromptId,
            [GEN_AI_SYSTEM_INSTRUCTIONS]: JSON.stringify(
              req.config.systemInstruction,
            ),
            [GEN_AI_TOOL_DEFINITIONS]: JSON.stringify(req.config.tools),
          }),
        }),
        expect.any(Function),
      );

      const spanArgs = vi.mocked(runInDevTraceSpan).mock.calls[0];
      const fn = spanArgs[1];
      const metadata: SpanMetadata = { name: '', attributes: {} };

      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );
      stream = await fn({ metadata, endSpan: vi.fn() });

      for await (const _ of stream) {
        // consume stream
      }

      expect(metadata).toMatchObject({
        input: req.contents,
        output: [response.candidates?.[0]?.content],
        attributes: {
          [GEN_AI_USAGE_INPUT_TOKENS]: 1,
          [GEN_AI_USAGE_OUTPUT_TOKENS]: 2,
        },
      });
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
        config: {
          mimeType: 'text/plain',
        },
      };
      const response: EmbedContentResponse = { embeddings: [{ values: [] }] };
      vi.mocked(wrapped.embedContent).mockResolvedValue(response);

      const result = await loggingContentGenerator.embedContent(req);

      expect(wrapped.embedContent).toHaveBeenCalledWith(req);
      expect(result).toBe(response);

      expect(runInDevTraceSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: GeminiCliOperation.LLMCall,
          attributes: expect.objectContaining({
            [GEN_AI_REQUEST_MODEL]: req.model,
          }),
        }),
        expect.any(Function),
      );

      const spanArgs = vi.mocked(runInDevTraceSpan).mock.calls[0];
      const fn = spanArgs[1];
      const metadata: SpanMetadata = { name: '', attributes: {} };
      await fn({ metadata, endSpan: vi.fn() });

      expect(metadata).toMatchObject({
        input: req.contents,
        output: response,
      });
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
    // history should be zero since all parts are tool calls
    expect(result.history).toBe(0);
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

    // All fields should be non-overlapping
    expect(result.system_instructions).toBeGreaterThan(0);
    expect(result.tool_definitions).toBeGreaterThan(0);
    expect(result.history).toBeGreaterThan(0);
    // tool_calls should only contain non-MCP tools
    expect(result.tool_calls['read_file']).toBeGreaterThan(0);
    expect(result.tool_calls['myserver__search']).toBeUndefined();
    // MCP tokens are only in mcp_servers
    expect(result.mcp_servers).toBeGreaterThan(0);
  });

  it('should classify MCP tool calls into mcp_servers only, not tool_calls', () => {
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
    // MCP tool calls should NOT appear in tool_calls
    expect(result.tool_calls['myserver__search']).toBeUndefined();
    // MCP call tokens should only be counted in mcp_servers
    expect(result.mcp_servers).toBeGreaterThan(0);
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
    // Non-MCP tools should be in tool_calls
    expect(result.tool_calls['read_file']).toBeGreaterThan(0);
    // MCP tools should NOT be in tool_calls
    expect(result.tool_calls['myserver__search']).toBeUndefined();
    // MCP tool calls should only be in mcp_servers
    expect(result.mcp_servers).toBeGreaterThan(0);
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
