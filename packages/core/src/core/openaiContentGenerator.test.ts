/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIContentGenerator } from './openaiContentGenerator.js';
import { LlmRole } from '../telemetry/types.js';
import { Type, type GenerateContentParameters } from '@google/genai';
import {
  clearRestorableSecretStore,
  redactRestorableSecrets,
} from '../utils/agent-sanitization-utils.js';

function makeRequest(
  overrides: Partial<GenerateContentParameters> = {},
): GenerateContentParameters {
  return {
    model: 'gpt-4',
    contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    ...overrides,
  };
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeSSEStream(lines: string[]): Response {
  const encoder = new TextEncoder();
  const chunks = lines.map((l) => encoder.encode(l + '\n'));
  let idx = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(chunks[idx++]);
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200 });
}

describe('OpenAIContentGenerator', () => {
  let generator: OpenAIContentGenerator;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    clearRestorableSecretStore();
    vi.stubGlobal('fetch', fetchMock);
    generator = new OpenAIContentGenerator({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4',
      presidio: { enabled: false },
    });
  });

  afterEach(() => {
    clearRestorableSecretStore();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('generateContent - text round trip', () => {
    it('restores redacted tokens in assistant text', async () => {
      const name = 'Ada Lovelace';
      const redacted = redactRestorableSecrets({ password: name }) as {
        password: string;
      };
      fetchMock.mockResolvedValue(
        makeJsonResponse({
          choices: [
            {
              message: { content: `Hello, ${redacted.password}.` },
              finish_reason: 'stop',
            },
          ],
        }),
      );

      const result = await generator.generateContent(
        makeRequest(),
        'pid',
        LlmRole.MAIN,
      );

      expect(result.candidates?.[0]?.content?.parts?.[0]?.text).toBe(
        `Hello, ${name}.`,
      );
    });

    it('redacts Presidio-detected names before sending them upstream', async () => {
      const presidioUrl = 'http://127.0.0.1:5002/analyze';
      const input = 'Ask Ada Lovelace to review this.';
      const nameStart = input.indexOf('Ada Lovelace');
      const gen = new OpenAIContentGenerator({
        baseUrl: 'https://api.openai.com/v1',
        presidio: { analyzerUrl: presidioUrl },
      });
      fetchMock.mockImplementation(async (url) => {
        if (url === presidioUrl) {
          return makeJsonResponse([
            {
              entity_type: 'PERSON',
              start: nameStart,
              end: nameStart + 'Ada Lovelace'.length,
              score: 0.98,
            },
          ]);
        }
        return makeJsonResponse({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        });
      });

      await gen.generateContent(
        makeRequest({
          contents: [{ role: 'user', parts: [{ text: input }] }],
        }),
        'pid',
        LlmRole.MAIN,
      );

      const upstreamCall = fetchMock.mock.calls.find(
        ([url]) => url !== presidioUrl,
      );
      const body = String(upstreamCall?.[1]?.body);
      expect(body).not.toContain('Ada Lovelace');
      expect(body).toMatch(/\[REDACTED:[^\]]+\]/);
    });

    it('redacts standalone secret tokens before sending them upstream', async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        }),
      );
      const secret = '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';

      await generator.generateContent(
        makeRequest({
          contents: [
            {
              role: 'user',
              parts: [{ text: `can you read this secret?: ${secret}` }],
            },
          ],
        }),
        'pid',
        LlmRole.MAIN,
      );

      const body = String(fetchMock.mock.calls[0][1]?.body);
      expect(body).not.toContain(secret);
      expect(body).toMatch(/\[REDACTED:[^\]]+\]/);
    });

    it('maps system instruction, user message, response text and usageMetadata', async () => {
      const openaiResp = {
        choices: [
          {
            message: { role: 'assistant', content: 'World' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      fetchMock.mockResolvedValue(makeJsonResponse(openaiResp));

      const req = makeRequest({
        config: {
          systemInstruction: { parts: [{ text: 'Be helpful' }] },
        },
      });
      const result = await generator.generateContent(req, 'pid', LlmRole.MAIN);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');

      const sentBody = JSON.parse((init as RequestInit).body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(sentBody.messages[0]).toMatchObject({
        role: 'system',
        content: expect.stringContaining('opaque references'),
      });
      expect(sentBody.messages[1]).toEqual({
        role: 'system',
        content: 'Be helpful',
      });
      expect(sentBody.messages[2]).toMatchObject({ role: 'user' });

      expect(result.candidates?.[0]?.content?.parts?.[0]?.text).toBe('World');
      expect(result.usageMetadata?.promptTokenCount).toBe(10);
      expect(result.usageMetadata?.candidatesTokenCount).toBe(5);
      expect(result.usageMetadata?.totalTokenCount).toBe(15);
    });

    it('sends Authorization header when apiKey is set', async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        }),
      );
      await generator.generateContent(makeRequest(), 'pid', LlmRole.MAIN);
      const headers = (fetchMock.mock.calls[0][1] as RequestInit)
        .headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-key');
    });

    it('does not send Authorization header when apiKey is absent', async () => {
      const gen = new OpenAIContentGenerator({
        baseUrl: 'http://localhost:11434/v1',
        presidio: { enabled: false },
      });
      fetchMock.mockResolvedValue(
        makeJsonResponse({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        }),
      );
      await gen.generateContent(makeRequest(), 'pid', LlmRole.MAIN);
      const headers = (fetchMock.mock.calls[0][1] as RequestInit)
        .headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('generateContent - tool declarations and tool_calls response', () => {
    it('maps functionDeclarations to openai tools and tool_calls to functionCall parts', async () => {
      const openaiResp = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_abc',
                  type: 'function',
                  function: { name: 'my_tool', arguments: '{"x":1}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      };
      fetchMock.mockResolvedValue(makeJsonResponse(openaiResp));

      const req = makeRequest({
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'my_tool',
                  description: 'Does stuff',
                  parameters: {
                    type: Type.OBJECT,
                    properties: { x: { type: Type.NUMBER } },
                  },
                },
              ],
            },
          ],
        },
      });
      const result = await generator.generateContent(req, 'pid', LlmRole.MAIN);

      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as RequestInit).body as string,
      ) as {
        tools: Array<{ type: string; function: { name: string } }>;
      };
      expect(body.tools[0].type).toBe('function');
      expect(body.tools[0].function.name).toBe('my_tool');

      const fc = result.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      expect(fc?.name).toBe('my_tool');
      expect(fc?.args).toEqual({ x: 1 });
      expect(fc?.id).toBe('call_abc');
    });
  });

  describe('generateContent - functionResponse part -> tool message', () => {
    it('converts functionResponse parts into role=tool messages', async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({
          choices: [{ message: { content: 'done' }, finish_reason: 'stop' }],
        }),
      );

      const req = makeRequest({
        contents: [
          {
            role: 'function',
            parts: [
              {
                functionResponse: {
                  name: 'my_tool',
                  id: 'call_abc',
                  response: { result: 42 },
                },
              },
            ],
          },
        ],
      });
      await generator.generateContent(req, 'pid', LlmRole.MAIN);

      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as RequestInit).body as string,
      ) as {
        messages: Array<{
          role: string;
          tool_call_id?: string;
          content?: string;
        }>;
      };
      const toolMessage = body.messages.find(
        (message) => message.role === 'tool',
      );
      expect(toolMessage?.tool_call_id).toBe('call_abc');
      expect(toolMessage?.content).toBe(JSON.stringify({ result: 42 }));
    });
  });

  describe('generateContentStream - SSE text deltas', () => {
    it('restores a redaction token split across SSE chunks', async () => {
      const name = 'Ada Lovelace';
      const redacted = redactRestorableSecrets({ password: name }) as {
        password: string;
      };
      const token = redacted.password;
      const sseLines = [
        'data: ' +
          JSON.stringify({
            choices: [
              {
                delta: { content: `Hello, ${token.slice(0, 7)}` },
                finish_reason: null,
              },
            ],
          }),
        'data: ' +
          JSON.stringify({
            choices: [
              {
                delta: { content: token.slice(7, 30) },
                finish_reason: null,
              },
            ],
          }),
        'data: ' +
          JSON.stringify({
            choices: [
              {
                delta: { content: `${token.slice(30)}.` },
                finish_reason: 'stop',
              },
            ],
          }),
        'data: [DONE]',
      ];
      fetchMock.mockResolvedValue(makeSSEStream(sseLines));

      const stream = await generator.generateContentStream(
        makeRequest(),
        'pid',
        LlmRole.MAIN,
      );
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);

      const text = chunks
        .flatMap((chunk) => chunk.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('');
      expect(text).toBe(`Hello, ${name}.`);
      expect(chunks.at(-1)?.candidates?.[0]?.finishReason).toBe('STOP');
    });

    it('yields chunks for text delta lines then stops at [DONE]', async () => {
      const sseLines = [
        'data: ' +
          JSON.stringify({
            choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
          }),
        'data: ' +
          JSON.stringify({
            choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }],
          }),
        'data: [DONE]',
      ];
      fetchMock.mockResolvedValue(makeSSEStream(sseLines));

      const stream = await generator.generateContentStream(
        makeRequest(),
        'pid',
        LlmRole.MAIN,
      );
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].candidates?.[0]?.content?.parts?.[0]?.text).toBe(
        'Hello',
      );
      expect(chunks[1].candidates?.[0]?.content?.parts?.[0]?.text).toBe(
        ' world',
      );
    });
  });

  describe('generateContentStream - finish_reason on empty-delta chunk', () => {
    it('yields a final response with STOP finishReason when finish_reason arrives on an empty delta', async () => {
      const sseLines = [
        'data: ' +
          JSON.stringify({
            choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
          }),
        'data: ' +
          JSON.stringify({
            choices: [{ delta: { content: ' world' }, finish_reason: null }],
          }),
        'data: ' +
          JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
        'data: [DONE]',
      ];
      fetchMock.mockResolvedValue(makeSSEStream(sseLines));

      const stream = await generator.generateContentStream(
        makeRequest(),
        'pid',
        LlmRole.MAIN,
      );
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const finishReasons = chunks
        .map((c) => c.candidates?.[0]?.finishReason)
        .filter((r) => r !== undefined);
      expect(finishReasons.length).toBeGreaterThanOrEqual(1);
      expect(finishReasons[finishReasons.length - 1]).toBe('STOP');
    });
  });

  describe('generateContentStream - stream ends without [DONE]', () => {
    it('still flushes finish_reason when stream closes without a [DONE] line', async () => {
      const sseLines = [
        'data: ' +
          JSON.stringify({
            choices: [{ delta: { content: 'Hi' }, finish_reason: null }],
          }),
        'data: ' +
          JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      ];
      fetchMock.mockResolvedValue(makeSSEStream(sseLines));

      const stream = await generator.generateContentStream(
        makeRequest(),
        'pid',
        LlmRole.MAIN,
      );
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const finishReasons = chunks
        .map((c) => c.candidates?.[0]?.finishReason)
        .filter((r) => r !== undefined);
      expect(finishReasons.length).toBeGreaterThanOrEqual(1);
      expect(finishReasons[finishReasons.length - 1]).toBe('STOP');
    });
  });

  describe('toOpenAIMessages - assistant turn with text and functionCall parts', () => {
    it('sends both content text and tool_calls on the same assistant message', async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        }),
      );

      const req = makeRequest({
        contents: [
          {
            role: 'model',
            parts: [
              { text: 'I will call the tool.' },
              {
                functionCall: {
                  id: 'call_1',
                  name: 'do_thing',
                  args: { x: 1 },
                },
              },
            ],
          },
        ],
      });
      await generator.generateContent(req, 'pid', LlmRole.MAIN);

      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as RequestInit).body as string,
      ) as {
        messages: Array<{
          role: string;
          content: string | null;
          tool_calls?: unknown[];
        }>;
      };
      const assistantMsg = body.messages.find((m) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.content).toBe('I will call the tool.');
      expect(assistantMsg?.tool_calls).toHaveLength(1);
    });
  });

  describe('generateContentStream - accumulates split tool_call arguments', () => {
    it('reassembles fragmented tool_call arguments into one functionCall part', async () => {
      const sseLines = [
        'data: ' +
          JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_x',
                      type: 'function',
                      function: { name: 'fn', arguments: '{"a' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          }),
        'data: ' +
          JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, function: { arguments: '":1}' } }],
                },
                finish_reason: 'tool_calls',
              },
            ],
          }),
        'data: [DONE]',
      ];
      fetchMock.mockResolvedValue(makeSSEStream(sseLines));

      const stream = await generator.generateContentStream(
        makeRequest(),
        'pid',
        LlmRole.MAIN,
      );
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      const fc = chunks[0].candidates?.[0]?.content?.parts?.[0]?.functionCall;
      expect(fc?.name).toBe('fn');
      expect(fc?.args).toEqual({ a: 1 });
    });
  });

  describe('non-2xx response throws', () => {
    it('throws an error containing the status code', async () => {
      fetchMock.mockResolvedValue(
        new Response('Bad Request', { status: 400, statusText: 'Bad Request' }),
      );
      await expect(
        generator.generateContent(makeRequest(), 'pid', LlmRole.MAIN),
      ).rejects.toThrow('400');
    });
  });

  describe('embedContent', () => {
    it('rejects with not supported error', async () => {
      await expect(
        generator.embedContent({
          model: 'text-embedding-3-small',
          contents: [],
        }),
      ).rejects.toThrow('embedContent is not supported');
    });
  });
});
