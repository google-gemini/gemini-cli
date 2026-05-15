/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import { FinishReason } from '@google/genai';
import type { CreateMessageRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { handleSamplingRequest } from './mcp-sampling.js';

const MODEL = 'gemini-test-model';

function buildResponse(
  text: string,
  finishReason: FinishReason = FinishReason.STOP,
): GenerateContentResponse {
  return {
    candidates: [
      {
        content: { role: 'model', parts: [{ text }] },
        finishReason,
        index: 0,
      },
    ],
  } as unknown as GenerateContentResponse;
}

function buildRequest(
  params: Partial<CreateMessageRequest['params']>,
): CreateMessageRequest {
  return {
    method: 'sampling/createMessage',
    params: {
      messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
      maxTokens: 100,
      ...params,
    },
  };
}

interface Harness {
  config: Config;
  generateContent: ReturnType<typeof vi.fn>;
}

function makeHarness(
  response: GenerateContentResponse = buildResponse('hello back'),
): Harness {
  const generateContent = vi.fn().mockResolvedValue(response);
  const generator: Pick<ContentGenerator, 'generateContent'> = {
    generateContent,
  };
  const config = {
    getModel: () => MODEL,
    getContentGenerator: () => generator as ContentGenerator,
  } as unknown as Config;
  return { config, generateContent };
}

describe('handleSamplingRequest', () => {
  let signal: AbortSignal;

  beforeEach(() => {
    signal = new AbortController().signal;
  });

  it('returns an MCP-shaped result for a simple text request', async () => {
    const { config, generateContent } = makeHarness(
      buildResponse('hello back'),
    );
    const result = await handleSamplingRequest(
      buildRequest({
        messages: [{ role: 'user', content: { type: 'text', text: 'say hi' } }],
      }),
      config,
      signal,
    );

    expect(result).toEqual({
      role: 'assistant',
      content: { type: 'text', text: 'hello back' },
      model: MODEL,
      stopReason: 'endTurn',
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
    const [call] = generateContent.mock.calls[0] as [
      GenerateContentParameters,
      string,
    ];
    expect(call.model).toBe(MODEL);
    expect(call.contents).toEqual([
      { role: 'user', parts: [{ text: 'say hi' }] },
    ]);
  });

  it('maps the assistant role to "model" and preserves conversation order', async () => {
    const { config, generateContent } = makeHarness();
    await handleSamplingRequest(
      buildRequest({
        messages: [
          { role: 'user', content: { type: 'text', text: 'q1' } },
          { role: 'assistant', content: { type: 'text', text: 'a1' } },
          { role: 'user', content: { type: 'text', text: 'q2' } },
        ],
      }),
      config,
      signal,
    );

    const [{ contents }] = generateContent.mock.calls[0] as [
      GenerateContentParameters,
    ];
    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'q1' }] },
      { role: 'model', parts: [{ text: 'a1' }] },
      { role: 'user', parts: [{ text: 'q2' }] },
    ]);
  });

  it('converts image content to an inlineData Gemini part', async () => {
    const { config, generateContent } = makeHarness();
    await handleSamplingRequest(
      buildRequest({
        messages: [
          {
            role: 'user',
            content: {
              type: 'image',
              data: 'BASE64DATA',
              mimeType: 'image/png',
            },
          },
        ],
      }),
      config,
      signal,
    );

    const [{ contents }] = generateContent.mock.calls[0] as [
      GenerateContentParameters,
    ];
    expect(contents).toEqual([
      {
        role: 'user',
        parts: [{ inlineData: { mimeType: 'image/png', data: 'BASE64DATA' } }],
      },
    ]);
  });

  it('accepts an array of content blocks in a single message (forward compat)', async () => {
    // Newer MCP spec revisions allow `content` to be an array of blocks; the
    // installed SDK types model it as a single block, so we cast to exercise
    // the runtime path without coupling the test to a specific SDK version.
    const { config, generateContent } = makeHarness();
    const request = {
      method: 'sampling/createMessage',
      params: {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'caption this:' },
              { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' },
            ],
          },
        ],
        maxTokens: 100,
      },
    } as unknown as CreateMessageRequest;
    await handleSamplingRequest(request, config, signal);

    const [{ contents }] = generateContent.mock.calls[0] as [
      GenerateContentParameters,
    ];
    expect(contents).toEqual([
      {
        role: 'user',
        parts: [
          { text: 'caption this:' },
          { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } },
        ],
      },
    ]);
  });

  it('rejects audio content with a clear error', async () => {
    const { config } = makeHarness();
    await expect(
      handleSamplingRequest(
        buildRequest({
          messages: [
            {
              role: 'user',
              content: {
                type: 'audio',
                data: 'AAAA',
                mimeType: 'audio/wav',
              },
            },
          ],
        }),
        config,
        signal,
      ),
    ).rejects.toThrow(/audio content is not supported/);
  });

  it('rejects unsupported content types (forward-compat, e.g. tool_use)', async () => {
    // The installed SDK types only allow text/image/audio. Newer revisions
    // add tool_use / tool_result; we cast to exercise the rejection path.
    const { config } = makeHarness();
    const request = {
      method: 'sampling/createMessage',
      params: {
        messages: [
          {
            role: 'user',
            content: { type: 'tool_use', id: 't1', name: 'foo', input: {} },
          },
        ],
        maxTokens: 100,
      },
    } as unknown as CreateMessageRequest;
    await expect(
      handleSamplingRequest(request, config, signal),
    ).rejects.toThrow(/unsupported content type "tool_use"/);
  });

  it('passes systemPrompt, temperature, maxTokens and stopSequences through to the generator', async () => {
    const { config, generateContent } = makeHarness();
    await handleSamplingRequest(
      buildRequest({
        systemPrompt: 'You are concise.',
        maxTokens: 256,
        temperature: 0.3,
        stopSequences: ['STOP'],
      }),
      config,
      signal,
    );

    const [{ config: genConfig }] = generateContent.mock.calls[0] as [
      GenerateContentParameters,
    ];
    expect(genConfig).toMatchObject({
      systemInstruction: 'You are concise.',
      maxOutputTokens: 256,
      temperature: 0.3,
      stopSequences: ['STOP'],
    });
    expect(genConfig?.abortSignal).toBe(signal);
  });

  it('omits generation params when the request does not set them', async () => {
    const { config, generateContent } = makeHarness();
    await handleSamplingRequest(
      // maxTokens is required by the MCP schema; everything else omitted.
      buildRequest({ maxTokens: 50 }),
      config,
      signal,
    );

    const [{ config: genConfig }] = generateContent.mock.calls[0] as [
      GenerateContentParameters,
    ];
    expect(genConfig).toEqual({
      abortSignal: signal,
      maxOutputTokens: 50,
    });
  });

  it('ignores modelPreferences from the request and uses the configured model', async () => {
    const { config, generateContent } = makeHarness();
    await handleSamplingRequest(
      buildRequest({
        modelPreferences: {
          hints: [{ name: 'claude-3-sonnet' }],
          costPriority: 0.9,
        },
      }),
      config,
      signal,
    );

    const [{ model }] = generateContent.mock.calls[0] as [
      GenerateContentParameters,
    ];
    expect(model).toBe(MODEL);
  });

  it('maps MAX_TOKENS finish reason to "maxTokens" stopReason', async () => {
    const { config } = makeHarness(
      buildResponse('partial', FinishReason.MAX_TOKENS),
    );
    const result = await handleSamplingRequest(
      buildRequest({}),
      config,
      signal,
    );
    expect(result.stopReason).toBe('maxTokens');
  });

  it('maps STOP finish reason (and others) to "endTurn"', async () => {
    const { config } = makeHarness(buildResponse('done', FinishReason.SAFETY));
    const result = await handleSamplingRequest(
      buildRequest({}),
      config,
      signal,
    );
    expect(result.stopReason).toBe('endTurn');
  });

  it('throws when the response has no candidates', async () => {
    const empty = { candidates: [] } as unknown as GenerateContentResponse;
    const { config } = makeHarness(empty);
    await expect(
      handleSamplingRequest(buildRequest({}), config, signal),
    ).rejects.toThrow(/no text content/);
  });

  it('throws when the candidate has no text parts', async () => {
    const noText = {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ inlineData: { mimeType: 'image/png', data: 'XX' } }],
          },
          finishReason: FinishReason.STOP,
          index: 0,
        },
      ],
    } as unknown as GenerateContentResponse;
    const { config } = makeHarness(noText);
    await expect(
      handleSamplingRequest(buildRequest({}), config, signal),
    ).rejects.toThrow(/no text content/);
  });

  it('uses a unique prompt id per call', async () => {
    const { config, generateContent } = makeHarness();
    await handleSamplingRequest(buildRequest({}), config, signal);
    await handleSamplingRequest(buildRequest({}), config, signal);

    const id1 = generateContent.mock.calls[0]?.[1] as string;
    const id2 = generateContent.mock.calls[1]?.[1] as string;
    expect(id1).toMatch(/^mcp-sampling-/);
    expect(id2).toMatch(/^mcp-sampling-/);
    expect(id1).not.toBe(id2);
  });
});
