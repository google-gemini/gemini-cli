/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OllamaCompressClient,
  OllamaUnavailableError,
} from './ollamaCompressClient.js';
import type { Content } from '@google/genai';
import { LlmRole } from '../telemetry/types.js';

describe('OllamaCompressClient', () => {
  const host = 'http://localhost:11434';
  const model = 'gemma2:2b';
  let client: OllamaCompressClient;

  const defaultOptions = {
    modelConfigKey: { model: 'test-model' },
    abortSignal: new AbortController().signal,
    promptId: 'test-prompt',
    role: LlmRole.UTILITY_COMPRESSOR,
  };

  beforeEach(() => {
    client = new OllamaCompressClient(host, model);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should sanitize history correctly', async () => {
    const contents: Content[] = [
      {
        role: 'user',
        parts: [{ text: 'Hello\nworld' }],
      },
      {
        role: 'model',
        parts: [
          { text: 'Thinking...' },
          {
            functionCall: { name: 'get_weather', args: { location: 'London' } },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'get_weather',
              response: { output: 'Sunny' },
            },
          },
        ],
      },
    ];

    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          message: { role: 'assistant', content: 'Summary' },
          done: true,
        }),
    } as Response);

    await client.generateContent({ ...defaultOptions, contents });

    const call = fetchMock.mock.calls[0];
    const body = JSON.parse(call[1]!.body as string);
    const messages = body.messages;

    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: 'user', content: 'Hello world' });
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: 'Thinking...\n[Tool call: get_weather({"location":"London"})]',
    });
    expect(messages[2]).toEqual({
      role: 'user',
      content: '[Tool result from get_weather: Sunny]',
    });
  });

  it('should handle thought property correctly', async () => {
    const contents: Content[] = [
      {
        role: 'model',
        parts: [{ text: 'Deep thinking', thought: true }],
      },
    ];

    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          message: { role: 'assistant', content: 'Summary' },
          done: true,
        }),
    } as Response);

    await client.generateContent({ ...defaultOptions, contents });

    const call = fetchMock.mock.calls[0];
    const body = JSON.parse(call[1]!.body as string);
    expect(body.messages[0]).toEqual({
      role: 'assistant',
      content: '[Thought] Deep thinking',
    });
  });

  it('should retry when state_snapshot is missing', async () => {
    const contents: Content[] = [
      { role: 'user', parts: [{ text: 'state_snapshot' }] },
    ];

    const fetchMock = vi
      .mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: { role: 'assistant', content: 'No snapshot here' },
            done: true,
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: {
              role: 'assistant',
              content: '<state_snapshot>Data</state_snapshot>',
            },
            done: true,
          }),
      } as Response);

    const response = await client.generateContent({
      ...defaultOptions,
      contents,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.candidates![0].content!.parts![0].text).toContain(
      '<state_snapshot>',
    );
  });

  it('should throw OllamaUnavailableError on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    await expect(
      client.generateContent({ ...defaultOptions, contents: [] }),
    ).rejects.toThrow(OllamaUnavailableError);
  });

  it('should throw OllamaUnavailableError on HTTP error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    } as Response);

    await expect(
      client.generateContent({ ...defaultOptions, contents: [] }),
    ).rejects.toThrow(OllamaUnavailableError);
  });

  it('should handle timeout correctly', async () => {
    vi.mocked(fetch).mockImplementation(
      async (_, init) =>
        new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              const err = new Error('This operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        }),
    );

    vi.useFakeTimers();
    const promise = client.generateContent({ ...defaultOptions, contents: [] });
    void promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(90_001);
    await expect(promise).rejects.toThrow('This operation was aborted');
    vi.useRealTimers();
  });
});
