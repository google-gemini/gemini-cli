/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAiContentGenerator } from './openAiContentGenerator.js';
import { LlmRole } from '../telemetry/llmRole.js';
import { type GenerateContentParameters } from '@google/genai';

describe('OpenAiContentGenerator', () => {
  let generator: OpenAiContentGenerator;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    generator = new OpenAiContentGenerator({
      apiKey: 'test-key',
      baseUrl: 'https://api.test.com/v1',
    });
  });

  it('should map Gemini text request to OpenAI and back', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: 'Hello from OpenAI' },
            finish_reason: 'stop',
            index: 0,
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

    const request = {
      model: 'test-model',
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
    };

    const response = await generator.generateContent(
      request as unknown as GenerateContentParameters,
      'id',
      LlmRole.UTILITY_TOOL,
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining(
          '"messages":[{"role":"user","content":"Hi"}]',
        ),
      }),
    );
    expect(response.text).toBe('Hello from OpenAI');
    expect(response.usageMetadata?.totalTokenCount).toBe(15);
  });

  it('should map Gemini image request to OpenAI image_url', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'I see an image' } }],
      }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

    const request = {
      model: 'test-model',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'What is this?' },
            { inlineData: { mimeType: 'image/png', data: 'base64data' } },
          ],
        },
      ],
    };

    await generator.generateContent(
      request as unknown as GenerateContentParameters,
      'id',
      LlmRole.UTILITY_TOOL,
    );

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call?.[1]?.body as string) as {
      messages: Array<{
        content: Array<{ type: string; text?: string; image_url?: { url: string } }>;
      }>;
    };

    expect(body.messages[0]?.content).toHaveLength(2);
    expect(body.messages[0]?.content[0]).toEqual({
      type: 'text',
      text: 'What is this?',
    });
    expect(body.messages[0]?.content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,base64data' },
    });
  });

  it('should handle system instructions', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Ack' } }],
      }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

    const request = {
      model: 'test-model',
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      config: {
        systemInstruction: 'You are a helpful assistant',
      },
    };

    await generator.generateContent(
      request as unknown as GenerateContentParameters,
      'id',
      LlmRole.UTILITY_TOOL,
    );

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call?.[1]?.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(body.messages[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant',
    });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });

  it('should throw error on non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

    const request = {
      model: 'test-model',
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
    };

    await expect(
      generator.generateContent(
        request as unknown as GenerateContentParameters,
        'id',
        LlmRole.UTILITY_TOOL,
      ),
    ).rejects.toThrow(
      'OpenAI API request failed with status 401: Unauthorized',
    );
  });
});
