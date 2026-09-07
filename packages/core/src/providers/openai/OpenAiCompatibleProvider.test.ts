/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAiCompatibleProvider } from './OpenAiCompatibleProvider.js';

describe('OpenAiCompatibleProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('yields friendly error when API key is missing', async () => {
    delete process.env['TEST_AI_KEY'];
    const provider = new OpenAiCompatibleProvider({
      name: 'test-ai',
      baseUrl: 'https://api.example.com/v1',
      defaultModel: 'model-a',
      apiKeyEnvVar: 'TEST_AI_KEY',
    });

    const events = [];
    for await (const event of provider.chat({
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      events.push(event);
    }

    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe('chunk');
    if (events[0]?.type === 'chunk') {
      expect(events[0].text).toContain('API key is missing for test-ai');
    }
    expect(events[1]?.type).toBe('complete');
  });

  it('reads key from environment variable or explicit option', async () => {
    process.env['TEST_AI_KEY'] = 'env-secret-key';
    const provider = new OpenAiCompatibleProvider({
      name: 'test-ai',
      baseUrl: 'https://api.example.com/v1',
      defaultModel: 'model-a',
      apiKeyEnvVar: 'TEST_AI_KEY',
    });

    expect(provider.getApiKey()).toBe('env-secret-key');
    expect(await provider.isAvailable()).toBe(true);

    provider.setApiKey('new-override-key');
    expect(provider.getApiKey()).toBe('new-override-key');
  });

  it('handles HTTP 401 error response', async () => {
    process.env['TEST_AI_KEY'] = 'invalid-key';
    const provider = new OpenAiCompatibleProvider({
      name: 'test-ai',
      baseUrl: 'https://api.example.com/v1',
      defaultModel: 'model-a',
      apiKeyEnvVar: 'TEST_AI_KEY',
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key provided' } }),
    });

    const events = [];
    for await (const event of provider.chat({
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      events.push(event);
    }

    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe('chunk');
    if (events[0]?.type === 'chunk') {
      expect(events[0].text).toContain('Authentication failed (401)');
    }
  });

  it('parses SSE stream chunks and emits complete text', async () => {
    process.env['TEST_AI_KEY'] = 'valid-key';
    const provider = new OpenAiCompatibleProvider({
      name: 'test-ai',
      baseUrl: 'https://api.example.com/v1',
      defaultModel: 'model-a',
      apiKeyEnvVar: 'TEST_AI_KEY',
    });

    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world!"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });

    const chunks: string[] = [];
    let completeText = '';

    for await (const event of provider.chat({
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      if (event.type === 'chunk') {
        chunks.push(event.text);
      } else if (event.type === 'complete') {
        completeText = event.fullText;
      }
    }

    expect(chunks).toEqual(['Hello', ' world!']);
    expect(completeText).toBe('Hello world!');
  });
});
