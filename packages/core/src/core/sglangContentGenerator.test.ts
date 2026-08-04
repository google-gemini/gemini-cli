/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenerateContentResponse } from '@google/genai';
import type { GenerateContentParameters } from '@google/genai';
import { SglangContentGenerator } from './sglangContentGenerator.js';
import { LlmRole } from '../telemetry/types.js';

function sseBody(chunks: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
        );
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

describe('SglangContentGenerator', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const generator = () =>
    new SglangContentGenerator('http://localhost:9999/v1', 'moonshotai/Kimi-K3');

  it('streams tool calls as real GenerateContentResponse instances with working functionCalls getter', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: sseBody([
        {
          choices: [
            {
              index: 0,
              delta: { reasoning_content: 'thinking...' },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'read_file:0',
                    function: { name: 'read_file', arguments: '{"file_' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: 'path":"/tmp/x"}' } },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        {
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      ]),
    });

    const stream = await generator().generateContentStream(
      {
        model: 'gemini-2.5-pro',
        contents: 'hi',
      } as GenerateContentParameters,
      'prompt-1',
      LlmRole.MAIN,
    );

    const chunks: GenerateContentResponse[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    // Every chunk must be a real SDK class instance so getters work.
    for (const chunk of chunks) {
      expect(chunk).toBeInstanceOf(GenerateContentResponse);
    }

    // Thought chunk is prefixed with a stable subject.
    const thoughtChunk = chunks.find((c) =>
      c.candidates?.[0]?.content?.parts?.some((p) => p.thought),
    );
    expect(
      thoughtChunk?.candidates?.[0]?.content?.parts?.[0]?.text,
    ).toContain('**Thinking**');

    // Split tool-call arguments are reassembled, and the SDK
    // `functionCalls` getter (used by turn.ts) sees the call.
    const toolChunk = chunks.find(
      (c) => c.functionCalls && c.functionCalls.length > 0,
    );
    expect(toolChunk).toBeDefined();
    expect(toolChunk!.functionCalls![0]).toEqual({
      id: 'read_file:0',
      name: 'read_file',
      args: { file_path: '/tmp/x' },
    });
    // The finish chunk carries the finish reason.
    expect(toolChunk!.candidates![0].finishReason).toBe('STOP');

    // Usage from stream_options.include_usage is surfaced.
    const usageChunk = chunks.find((c) => c.usageMetadata);
    expect(usageChunk?.usageMetadata?.totalTokenCount).toBe(15);

    // The request advertised stream_options and mapped the gemini model
    // alias to the served model name.
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.model).toBe('moonshotai/Kimi-K3');
    expect(payload.stream_options).toEqual({ include_usage: true });
  });

  it('round-trips tool call ids and skips thought parts in history', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: 'done' }, finish_reason: 'stop' },
        ],
        usage: {},
      }),
    });

    await generator().generateContent(
      {
        model: 'moonshotai/Kimi-K3',
        contents: [
          { role: 'user', parts: [{ text: 'read x' }] },
          {
            role: 'model',
            parts: [
              { text: 'internal reasoning', thought: true },
              {
                functionCall: {
                  id: 'read_file__synth_1',
                  name: 'read_file',
                  args: { file_path: '/tmp/x' },
                },
              },
            ],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  id: 'read_file__synth_1',
                  name: 'read_file',
                  response: { output: 'file contents' },
                },
              },
            ],
          },
        ],
      } as GenerateContentParameters,
      'prompt-1',
      LlmRole.MAIN,
    );

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const messages = payload.messages as Array<Record<string, unknown>>;

    const assistant = messages.find((m) => m['role'] === 'assistant');
    const tool = messages.find((m) => m['role'] === 'tool');
    expect(assistant).toBeDefined();
    expect(tool).toBeDefined();

    const toolCalls = assistant!['tool_calls'] as Array<{
      id: string;
      function: { name: string; arguments: string };
    }>;
    expect(toolCalls[0].id).toBe('read_file__synth_1');
    expect(tool!['tool_call_id']).toBe('read_file__synth_1');
    expect(tool!['content']).toBe('file contents');

    // Reasoning must never be echoed back to the server.
    expect(JSON.stringify(messages)).not.toContain('internal reasoning');
  });

  it('converts parametersJsonSchema tool declarations', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      }),
    });

    await generator().generateContent(
      {
        model: 'moonshotai/Kimi-K3',
        contents: 'hi',
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'read_file',
                  description: 'Reads a file',
                  parametersJsonSchema: {
                    type: 'object',
                    properties: { file_path: { type: 'STRING' } },
                    required: ['file_path'],
                  },
                },
              ],
            },
          ],
        },
      } as GenerateContentParameters,
      'prompt-1',
      LlmRole.MAIN,
    );

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.tools).toHaveLength(1);
    expect(payload.tools[0].function.name).toBe('read_file');
    // Gemini upper-case types are normalized for OpenAI-compatible servers.
    expect(
      payload.tools[0].function.parameters.properties.file_path.type,
    ).toBe('string');
    expect(payload.tools[0].function.parameters.required).toEqual([
      'file_path',
    ]);
  });

  it('honors abortSignal', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const promise = generator().generateContent(
      {
        model: 'moonshotai/Kimi-K3',
        contents: 'hi',
        config: { abortSignal: controller.signal },
      } as GenerateContentParameters,
      'prompt-1',
      LlmRole.MAIN,
    );
    controller.abort();
    await expect(promise).rejects.toThrow('aborted');
  });
});
