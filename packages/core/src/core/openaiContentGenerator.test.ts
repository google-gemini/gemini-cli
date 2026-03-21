/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIContentGenerator } from './openaiContentGenerator.js';
import { FinishReason } from '@google/genai';
import type { Content, GenerateContentParameters } from '@google/genai';

const BASE_URL = 'https://api.example.com';
const API_KEY = 'test-key';

function createGenerator(model = 'gpt-4o') {
  return new OpenAIContentGenerator({
    baseUrl: BASE_URL,
    apiKey: API_KEY,
    defaultModel: model,
  });
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
    body: null,
  });
}

function mockStreamFetch(chunks: string[]) {
  const encoder = new TextEncoder();
  let idx = 0;
  const readable = new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx]));
        idx++;
      } else {
        controller.close();
      }
    },
  });
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: readable,
  });
}

describe('OpenAIContentGenerator', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('generateContent', () => {
    it('should send a non-streaming request and parse the response', async () => {
      const completion = {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello world' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      globalThis.fetch = mockFetch(completion);

      const gen = createGenerator();
      const result = await gen.generateContent(
        {
          model: 'gpt-4o',
          contents: [
            { role: 'user', parts: [{ text: 'Say hello' }] },
          ] as Content[],
        },
        'prompt-1',
        'main',
      );

      expect(result.candidates?.[0]?.content?.parts?.[0]?.text).toBe(
        'Hello world',
      );
      expect(result.candidates?.[0]?.finishReason).toBe(FinishReason.STOP);
      expect(result.usageMetadata?.promptTokenCount).toBe(10);
      expect(result.usageMetadata?.candidatesTokenCount).toBe(5);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(fetchCall[0]).toBe(`${BASE_URL}/v1/chat/completions`);
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.model).toBe('gpt-4o');
      expect(body.stream).toBe(false);
      expect(body.max_tokens).toBe(16_384);
    });

    it('should map tool_calls finish_reason to STOP', async () => {
      const completion = {
        id: 'chatcmpl-2',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_abc',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: '{"path":"/tmp/test.txt"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      };

      globalThis.fetch = mockFetch(completion);

      const gen = createGenerator();
      const result = await gen.generateContent(
        {
          model: 'gpt-4o',
          contents: [
            { role: 'user', parts: [{ text: 'Read a file' }] },
          ] as Content[],
        },
        'prompt-2',
        'main',
      );

      const candidate = result.candidates?.[0];
      expect(candidate?.finishReason).toBe(FinishReason.STOP);
      const fc = candidate?.content?.parts?.find((p) => p.functionCall);
      expect(fc?.functionCall?.name).toBe('read_file');
      expect(fc?.functionCall?.id).toBe('call_abc');
      expect(fc?.functionCall?.args).toEqual({ path: '/tmp/test.txt' });
    });

    it('should throw on API error', async () => {
      globalThis.fetch = mockFetch({ error: 'rate limited' }, 429);

      const gen = createGenerator();
      await expect(
        gen.generateContent(
          {
            model: 'gpt-4o',
            contents: 'test',
          },
          'prompt-3',
          'main',
        ),
      ).rejects.toThrow('OpenAI API error 429');
    });
  });

  describe('generateContentStream', () => {
    it('should parse SSE stream into GenerateContentResponse chunks', async () => {
      const sseChunks = [
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
        'data: [DONE]\n\n',
      ];

      globalThis.fetch = mockStreamFetch(sseChunks);

      const gen = createGenerator();
      const stream = await gen.generateContentStream(
        {
          model: 'gpt-4o',
          contents: [
            { role: 'user', parts: [{ text: 'Say hello' }] },
          ] as Content[],
        },
        'prompt-4',
        'main',
      );

      const results: string[] = [];
      for await (const chunk of stream) {
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) results.push(text);
      }

      expect(results).toEqual(['Hello', ' world']);
    });

    it('should accumulate streamed tool calls', async () => {
      const sseChunks = [
        'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_x","type":"function","function":{"name":"ls","arguments":""}}]},"finish_reason":null}]}\n\n',
        'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":\\"/tmp\\"}"}}]},"finish_reason":null}]}\n\n',
        'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      globalThis.fetch = mockStreamFetch(sseChunks);

      const gen = createGenerator();
      const stream = await gen.generateContentStream(
        {
          model: 'gpt-4o',
          contents: [
            { role: 'user', parts: [{ text: 'List files' }] },
          ] as Content[],
        },
        'prompt-5',
        'main',
      );

      const allParts: Array<{ functionCall?: unknown }> = [];
      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        allParts.push(...parts);
      }

      const fc = allParts.find((p) => p.functionCall);
      expect(fc).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const call = (fc as any).functionCall;
      expect(call.name).toBe('ls');
      expect(call.args).toEqual({ path: '/tmp' });
    });
  });

  describe('countTokens', () => {
    it('should estimate tokens from content length', async () => {
      const gen = createGenerator();
      const result = await gen.countTokens({
        model: 'gpt-4o',
        contents: [{ role: 'user', parts: [{ text: 'Hello world' }] }],
      });

      expect(result.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('embedContent', () => {
    it('should throw as unsupported', async () => {
      const gen = createGenerator();
      await expect(
        gen.embedContent({ model: 'gpt-4o', content: 'test' }),
      ).rejects.toThrow('embedContent is not supported');
    });
  });

  describe('model-aware defaults', () => {
    it('should set high max_tokens for Claude models', async () => {
      globalThis.fetch = mockFetch({
        id: 'c1',
        object: 'chat.completion',
        created: 1,
        model: 'claude-opus-4',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
          },
        ],
      });

      const gen = createGenerator('claude-opus-4');
      await gen.generateContent(
        { model: 'claude-opus-4', contents: 'test' },
        'p',
        'main',
      );

      const body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
          .body as string,
      );
      expect(body.max_tokens).toBe(32_000);
    });

    it('should use 16384 for unknown models', async () => {
      globalThis.fetch = mockFetch({
        id: 'c1',
        object: 'chat.completion',
        created: 1,
        model: 'my-custom-model',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
          },
        ],
      });

      const gen = createGenerator('my-custom-model');
      await gen.generateContent(
        { model: 'my-custom-model', contents: 'test' },
        'p',
        'main',
      );

      const body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
          .body as string,
      );
      expect(body.max_tokens).toBe(16_384);
    });
  });

  describe('tool schema cleaning', () => {
    it('should strip $-prefixed keys and enforce type:object at root', async () => {
      globalThis.fetch = mockFetch({
        id: 'c1',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'done' },
            finish_reason: 'stop',
          },
        ],
      });

      const gen = createGenerator();
      const request: GenerateContentParameters = {
        model: 'gpt-4o',
        contents: [{ role: 'user', parts: [{ text: 'test' }] }] as Content[],
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'my_tool',
                  description: 'A tool',
                  parameters: {
                    $schema: 'http://json-schema.org/draft-07/schema#',
                    type: 'object',
                    strict: true,
                    properties: { q: { type: 'string' } },
                  },
                },
              ],
            },
          ],
        },
      };

      await gen.generateContent(request, 'p', 'main');

      const body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
          .body as string,
      );
      const tool = body.tools[0].function;
      expect(tool.parameters.$schema).toBeUndefined();
      expect(tool.parameters.strict).toBeUndefined();
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toEqual({ q: { type: 'string' } });
    });
  });

  describe('conversation translation', () => {
    it('should translate function calls and responses', async () => {
      globalThis.fetch = mockFetch({
        id: 'c1',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
          },
        ],
      });

      const gen = createGenerator();
      const contents: Content[] = [
        { role: 'user', parts: [{ text: 'Do something' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call_1',
                name: 'ls',
                args: { path: '/' },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call_1',
                name: 'ls',
                response: { files: ['a.txt', 'b.txt'] },
              },
            },
          ],
        },
        { role: 'user', parts: [{ text: 'What did you find?' }] },
      ];

      await gen.generateContent({ model: 'gpt-4o', contents }, 'p', 'main');

      const body = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
          .body as string,
      );
      const msgs = body.messages;

      expect(msgs[0].role).toBe('user');
      expect(msgs[0].content).toBe('Do something');

      expect(msgs[1].role).toBe('assistant');
      expect(msgs[1].tool_calls[0].id).toBe('call_1');
      expect(msgs[1].tool_calls[0].function.name).toBe('ls');

      expect(msgs[2].role).toBe('tool');
      expect(msgs[2].tool_call_id).toBe('call_1');

      expect(msgs[3].role).toBe('user');
      expect(msgs[3].content).toBe('What did you find?');
    });
  });
});
