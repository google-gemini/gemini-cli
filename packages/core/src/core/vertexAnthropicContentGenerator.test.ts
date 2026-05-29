/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FunctionCallingConfigMode,
  GenerateContentResponse,
  ThinkingLevel,
} from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { LlmRole } from '../telemetry/llmRole.js';
import type { ContentGenerator } from './contentGenerator.js';
import {
  isClaudeVertexModel,
  VertexAiContentGeneratorRouter,
  VertexAnthropicContentGenerator,
} from './vertexAnthropicContentGenerator.js';

const mockAuth = {
  getClient: vi.fn(async () => ({
    getRequestHeaders: vi.fn(async () => ({
      Authorization: 'Bearer test-token',
    })),
  })),
};

function sseResponse(chunks: unknown[]): Response {
  const body = chunks
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join('');
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
  );
}

describe('isClaudeVertexModel', () => {
  it('detects Claude Vertex model IDs', () => {
    expect(isClaudeVertexModel('claude-opus-4-8')).toBe(true);
    expect(
      isClaudeVertexModel('publishers/anthropic/models/claude-sonnet-4-6'),
    ).toBe(true);
    expect(isClaudeVertexModel('gemini-2.5-pro')).toBe(false);
  });
});

describe('VertexAiContentGeneratorRouter', () => {
  it('routes Claude models to the Claude generator and other models to Gemini', async () => {
    const geminiResponse = new GenerateContentResponse();
    const claudeResponse = new GenerateContentResponse();
    const geminiGenerator = {
      generateContent: vi.fn(async () => geminiResponse),
    } as unknown as ContentGenerator;
    const claudeGenerator = {
      generateContent: vi.fn(async () => claudeResponse),
    } as unknown as ContentGenerator;

    const router = new VertexAiContentGeneratorRouter(
      geminiGenerator,
      claudeGenerator,
    );

    await expect(
      router.generateContent(
        { model: 'claude-opus-4-8', contents: 'hello' },
        'prompt-id',
        LlmRole.MAIN,
      ),
    ).resolves.toBe(claudeResponse);
    await expect(
      router.generateContent(
        { model: 'gemini-2.5-pro', contents: 'hello' },
        'prompt-id',
        LlmRole.MAIN,
      ),
    ).resolves.toBe(geminiResponse);

    expect(claudeGenerator.generateContent).toHaveBeenCalledOnce();
    expect(geminiGenerator.generateContent).toHaveBeenCalledOnce();
  });
});

describe('VertexAnthropicContentGenerator', () => {
  it('converts Gemini requests and Anthropic SSE chunks', async () => {
    const fetchFn = vi.fn(async (_input: string | URL, _init?: RequestInit) =>
      sseResponse([
        {
          type: 'message_start',
          message: {
            id: 'msg_1',
            model: 'claude-opus-4-8',
            usage: { input_tokens: 7 },
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hello' },
        },
        {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'read_file',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"path":"a.txt"}',
          },
        },
        { type: 'content_block_stop', index: 1 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use' },
          usage: { output_tokens: 3 },
        },
        { type: 'message_stop' },
      ]),
    );
    const generator = new VertexAnthropicContentGenerator({
      projectId: 'my-project',
      location: 'global',
      auth: mockAuth,
      fetchFn,
    });

    const stream = await generator.generateContentStream(
      {
        model: 'claude-opus-4-8',
        contents: [
          { role: 'user', parts: [{ text: 'hi' }] },
          {
            role: 'model',
            parts: [
              {
                functionCall: {
                  id: 'toolu_prev',
                  name: 'read_file',
                  args: { path: 'old.txt' },
                },
              },
            ],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  id: 'toolu_prev',
                  name: 'read_file',
                  response: { output: 'old contents' },
                },
              },
            ],
          },
        ],
        config: {
          systemInstruction: 'system prompt',
          maxOutputTokens: 123,
          topP: 0.95,
          topK: 40,
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'read_file',
                  description: 'Read a file',
                  parametersJsonSchema: {
                    type: 'object',
                    properties: { path: { type: 'string' } },
                    required: ['path'],
                  },
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: ['read_file'],
            },
          },
        },
      },
      'prompt-id',
      LlmRole.MAIN,
    );

    const chunks: GenerateContentResponse[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(fetchFn).toHaveBeenCalledWith(
      'https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/publishers/anthropic/models/claude-opus-4-8:streamRawPredict',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const body = JSON.parse(
      (fetchFn.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      anthropic_version: 'vertex-2023-10-16',
      system: 'system prompt',
      max_tokens: 123,
      stream: true,
      tool_choice: { type: 'tool', name: 'read_file' },
    });
    expect(body).not.toHaveProperty('model');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('top_k');
    expect(body['tools']).toEqual([
      {
        name: 'read_file',
        description: 'Read a file',
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
    ]);
    expect(body['messages']).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_prev',
            name: 'read_file',
            input: { path: 'old.txt' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_prev',
            content: 'old contents',
          },
        ],
      },
    ]);

    expect(chunks[0].candidates?.[0]?.content?.parts?.[0]?.text).toBe('hello');
    expect(chunks[1].functionCalls).toEqual([
      { id: 'toolu_1', name: 'read_file', args: { path: 'a.txt' } },
    ]);
    expect(chunks[2].candidates?.[0]?.finishReason).toBe('STOP');
    expect(chunks[2].usageMetadata).toMatchObject({
      promptTokenCount: 7,
      candidatesTokenCount: 3,
      totalTokenCount: 10,
    });
  });

  it('uses adaptive thinking for Claude Opus 4.8 and omits unsupported sampling parameters', async () => {
    const fetchFn = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            id: 'msg_1',
            model: 'claude-opus-4-8',
            content: [{ type: 'text', text: 'hello' }],
            stop_reason: 'end_turn',
          }),
        ),
    );
    const generator = new VertexAnthropicContentGenerator({
      projectId: 'my-project',
      location: 'global',
      auth: mockAuth,
      fetchFn,
    });

    await generator.generateContent(
      {
        model: 'claude-opus-4-8',
        contents: 'hi',
        config: {
          temperature: 1,
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: 8192,
          },
        },
      },
      'prompt-id',
      LlmRole.MAIN,
    );

    const body = JSON.parse(
      (fetchFn.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body['thinking']).toEqual({
      type: 'adaptive',
      display: 'summarized',
    });
    expect(body['max_tokens']).toBe(128_000);
    expect(body['thinking']).not.toHaveProperty('budget_tokens');
    expect(body).not.toHaveProperty('temperature');
  });

  it('uses max output defaults only for Claude Opus 4 models', async () => {
    const fetchFn = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            id: 'msg_1',
            model: 'claude-opus-4-8',
            content: [{ type: 'text', text: 'hello' }],
            stop_reason: 'end_turn',
          }),
        ),
    );
    const generator = new VertexAnthropicContentGenerator({
      projectId: 'my-project',
      location: 'global',
      auth: mockAuth,
      fetchFn,
    });

    for (const model of [
      'claude-opus-4-8',
      'claude-opus-4-5@20251101',
      'claude-opus-4-1@20250805',
      'claude-sonnet-4-6',
    ]) {
      await generator.generateContent(
        { model, contents: 'hi' },
        'prompt-id',
        LlmRole.MAIN,
      );
    }

    const bodies = fetchFn.mock.calls.map(
      (call) =>
        JSON.parse((call[1] as RequestInit).body as string) as Record<
          string,
          unknown
        >,
    );
    expect(bodies.map((body) => body['max_tokens'])).toEqual([
      128_000, 64_000, 32_000, 8192,
    ]);
  });

  it('maps Gemini thinking levels to Claude effort and keeps tool choice compatible with thinking', async () => {
    const fetchFn = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            id: 'msg_1',
            model: 'claude-opus-4-8',
            content: [{ type: 'text', text: 'hello' }],
            stop_reason: 'end_turn',
          }),
        ),
    );
    const generator = new VertexAnthropicContentGenerator({
      projectId: 'my-project',
      location: 'global',
      auth: mockAuth,
      fetchFn,
    });

    await generator.generateContent(
      {
        model: 'claude-opus-4-8',
        contents: 'hi',
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'read_file',
                  parametersJsonSchema: { type: 'object' },
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: ['read_file'],
            },
          },
        },
      },
      'prompt-id',
      LlmRole.MAIN,
    );

    const body = JSON.parse(
      (fetchFn.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body['thinking']).toEqual({ type: 'adaptive' });
    expect(body['output_config']).toEqual({ effort: 'low' });
    expect(body['tool_choice']).toEqual({ type: 'auto' });
  });

  it('keeps manual thinking budgets for older Claude models', async () => {
    const fetchFn = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            id: 'msg_1',
            model: 'claude-sonnet-4-5',
            content: [{ type: 'text', text: 'hello' }],
            stop_reason: 'end_turn',
          }),
        ),
    );
    const generator = new VertexAnthropicContentGenerator({
      projectId: 'my-project',
      location: 'global',
      auth: mockAuth,
      fetchFn,
    });

    await generator.generateContent(
      {
        model: 'claude-sonnet-4-5',
        contents: 'hi',
        config: {
          maxOutputTokens: 5000,
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: 4096,
          },
        },
      },
      'prompt-id',
      LlmRole.MAIN,
    );

    const body = JSON.parse(
      (fetchFn.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body['thinking']).toEqual({
      type: 'enabled',
      budget_tokens: 4096,
      display: 'summarized',
    });
    expect(body['max_tokens']).toBe(5120);
  });

  it('round-trips Claude thinking signatures on tool-use turns', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          {
            type: 'message_start',
            message: { id: 'msg_1', model: 'claude-opus-4-8' },
          },
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'thinking', thinking: '', signature: '' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'thinking_delta',
              thinking: 'I should call the tool.',
            },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'signature_delta', signature: 'sig_old' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'signature_delta', signature: 'sig_abc' },
          },
          { type: 'content_block_stop', index: 0 },
          {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'redacted_thinking',
              data: 'opaque_redacted_data',
            },
          },
          { type: 'content_block_stop', index: 1 },
          {
            type: 'content_block_start',
            index: 2,
            content_block: {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'read_file',
              input: {},
            },
          },
          {
            type: 'content_block_delta',
            index: 2,
            delta: {
              type: 'input_json_delta',
              partial_json: '{"path":"a.txt"}',
            },
          },
          { type: 'content_block_stop', index: 2 },
          { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
        ]),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'msg_2',
            model: 'claude-opus-4-8',
            content: [{ type: 'text', text: 'done' }],
            stop_reason: 'end_turn',
          }),
        ),
      );
    const generator = new VertexAnthropicContentGenerator({
      projectId: 'my-project',
      location: 'global',
      auth: mockAuth,
      fetchFn,
    });

    const stream = await generator.generateContentStream(
      {
        model: 'claude-opus-4-8',
        contents: 'hi',
      },
      'prompt-id',
      LlmRole.MAIN,
    );
    const chunks: GenerateContentResponse[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const toolPart = chunks
      .flatMap((chunk) => chunk.candidates?.[0]?.content?.parts ?? [])
      .find((part) => part.functionCall);
    const thoughtSignature = (toolPart as { thoughtSignature?: string })
      .thoughtSignature;
    expect(thoughtSignature).toMatch(/^claude_thinking:/);

    await generator.generateContent(
      {
        model: 'claude-opus-4-8',
        contents: [
          {
            role: 'model',
            parts: [toolPart!],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  id: 'toolu_1',
                  name: 'read_file',
                  response: { output: 'contents' },
                },
              },
            ],
          },
        ],
      },
      'prompt-id',
      LlmRole.MAIN,
    );

    const body = JSON.parse(
      (fetchFn.mock.calls[1]?.[1] as RequestInit).body as string,
    ) as Record<string, Array<{ content: unknown[] }>>;
    expect(body['messages'][0]?.content).toEqual([
      {
        type: 'thinking',
        thinking: 'I should call the tool.',
        signature: 'sig_abc',
      },
      {
        type: 'redacted_thinking',
        data: 'opaque_redacted_data',
      },
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: 'read_file',
        input: { path: 'a.txt' },
      },
    ]);
  });

  it('handles a full JSON message on the streaming endpoint', async () => {
    const fetchFn = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            id: 'msg_json',
            type: 'message',
            model: 'claude-opus-4-8',
            content: [{ type: 'text', text: 'complete response' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 5, output_tokens: 2 },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const generator = new VertexAnthropicContentGenerator({
      projectId: 'my-project',
      location: 'global',
      auth: mockAuth,
      fetchFn,
    });

    const stream = await generator.generateContentStream(
      {
        model: 'claude-opus-4-8',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      },
      'prompt-id',
      LlmRole.MAIN,
    );

    const chunks: GenerateContentResponse[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const body = JSON.parse(
      (fetchFn.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body['stream']).toBe(true);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].candidates?.[0]?.content?.parts?.[0]?.text).toBe(
      'complete response',
    );
    expect(chunks[0].candidates?.[0]?.finishReason).toBe('STOP');
    expect(chunks[0].usageMetadata).toMatchObject({
      promptTokenCount: 5,
      candidatesTokenCount: 2,
      totalTokenCount: 7,
    });
  });

  it('sanitizes Claude tool names and maps tool calls back to Gemini names', async () => {
    const geminiToolName = 'mcp.read/file:custom';
    const claudeToolName = 'mcp_read_file_custom';
    const fetchFn = vi.fn(async (_input: string | URL, _init?: RequestInit) =>
      sseResponse([
        {
          type: 'message_start',
          message: { id: 'msg_2', model: 'claude-opus-4-8' },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'toolu_2',
            name: claudeToolName,
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"path":"b.txt"}',
          },
        },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      ]),
    );
    const generator = new VertexAnthropicContentGenerator({
      projectId: 'my-project',
      location: 'global',
      auth: mockAuth,
      fetchFn,
    });

    const stream = await generator.generateContentStream(
      {
        model: 'claude-opus-4-8',
        contents: [
          { role: 'user', parts: [{ text: 'call the tool' }] },
          {
            role: 'model',
            parts: [
              {
                functionCall: {
                  id: 'toolu_prev',
                  name: geminiToolName,
                  args: { path: 'old.txt' },
                },
              },
            ],
          },
        ],
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: geminiToolName,
                  parametersJsonSchema: {
                    type: 'object',
                    properties: { path: { type: 'string' } },
                  },
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: [geminiToolName],
            },
          },
        },
      },
      'prompt-id',
      LlmRole.MAIN,
    );

    const chunks: GenerateContentResponse[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const body = JSON.parse(
      (fetchFn.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body['tools']).toEqual([
      {
        name: claudeToolName,
        input_schema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
    ]);
    expect(body['tool_choice']).toEqual({
      type: 'tool',
      name: claudeToolName,
    });
    expect(body['messages']).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'call the tool' }] },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_prev',
            name: claudeToolName,
            input: { path: 'old.txt' },
          },
        ],
      },
    ]);
    expect(chunks[0].functionCalls).toEqual([
      { id: 'toolu_2', name: geminiToolName, args: { path: 'b.txt' } },
    ]);
  });

  it('normalizes tool input schemas for Anthropic JSON Schema validation', async () => {
    const fetchFn = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            id: 'msg_3',
            content: [],
            stop_reason: 'end_turn',
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const generator = new VertexAnthropicContentGenerator({
      projectId: 'my-project',
      location: 'global',
      auth: mockAuth,
      fetchFn,
    });

    await generator.generateContent(
      {
        model: 'claude-opus-4-8',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'schema_tool',
                  parametersJsonSchema: {
                    $schema: 'http://json-schema.org/draft-07/schema#',
                    $ref: '#/definitions/Root',
                    definitions: {
                      Root: {
                        type: 'OBJECT',
                        propertyOrdering: ['meta', 'maybeTags'],
                        properties: {
                          meta: {
                            type: 'OBJECT',
                            additionalProperties: { type: 'STRING' },
                          },
                          maybeTags: {
                            type: 'ARRAY',
                            items: { type: 'STRING' },
                            nullable: true,
                          },
                          union: {
                            oneOf: [{ type: 'STRING' }, { type: 'INTEGER' }],
                          },
                        },
                        required: [],
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      'prompt-id',
      LlmRole.MAIN,
    );

    const body = JSON.parse(
      (fetchFn.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body['tools']).toEqual([
      {
        name: 'schema_tool',
        input_schema: {
          type: 'object',
          properties: {
            meta: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            maybeTags: {
              type: ['array', 'null'],
              items: { type: 'string' },
            },
            union: {
              oneOf: [{ type: 'string' }, { type: 'integer' }],
            },
          },
        },
      },
    ]);
  });

  it('uses the count-tokens rawPredict endpoint', async () => {
    const fetchFn = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ input_tokens: 42 }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const generator = new VertexAnthropicContentGenerator({
      projectId: 'my-project',
      location: 'us-east5',
      auth: mockAuth,
      fetchFn,
    });

    await expect(
      generator.countTokens({
        model: 'claude-opus-4-8',
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      }),
    ).resolves.toEqual({ totalTokens: 42 });

    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      'https://us-east5-aiplatform.googleapis.com/v1/projects/my-project/locations/us-east5/publishers/anthropic/models/count-tokens:rawPredict',
    );
    const body = JSON.parse(
      (fetchFn.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(body['model']).toBe('claude-opus-4-8');
    expect(body).not.toHaveProperty('max_tokens');
  });
});
