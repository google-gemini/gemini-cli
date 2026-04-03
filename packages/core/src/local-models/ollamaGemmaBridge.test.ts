/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../config/config.js';
import { OllamaGemmaBridgeManager } from './ollamaGemmaBridge.js';

const realFetch = globalThis.fetch;

function createJsonLinesStream(lines: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

describe('OllamaGemmaBridgeManager', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('coalesces Ollama thinking deltas into Gemini thought parts', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        createJsonLinesStream([
          {
            model: 'gemma4:31b',
            message: {
              role: 'assistant',
              content: '',
              thinking: '**Plan**',
            },
            done: false,
          },
          {
            model: 'gemma4:31b',
            message: {
              role: 'assistant',
              content: '',
              thinking: '\nThink',
            },
            done: false,
          },
          {
            model: 'gemma4:31b',
            message: {
              role: 'assistant',
              content: '',
              thinking: ' first.',
            },
            done: false,
          },
          {
            model: 'gemma4:31b',
            message: {
              role: 'assistant',
              content: 'Final answer.',
            },
            done: true,
            done_reason: 'stop',
            prompt_eval_count: 42,
            eval_count: 7,
          },
        ]),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const manager = new OllamaGemmaBridgeManager({
      getOllamaGemmaSettings: () => ({
        bridgeHost: '127.0.0.1',
        bridgePort: 0,
        ollamaBaseUrl: 'http://127.0.0.1:11434',
      }),
      isLocalGemmaModel: (modelId: string) => modelId === 'gemma4:31b',
    } as unknown as Config);

    const baseUrl = await manager.ensureStarted();
    const response = await realFetch(
      `${baseUrl}/v1beta/models/gemma4:31b:streamGenerateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: 'What is X?' }],
            },
          ],
          generationConfig: {
            thinkingConfig: {
              includeThoughts: true,
              thinkingLevel: 'HIGH',
            },
          },
        }),
      },
    );

    expect(response.ok).toBe(true);
    const body = await response.text();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const upstreamRequest = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'),
    ) as { think?: string };
    expect(upstreamRequest.think).toBe('high');
    expect(body.match(/"thought":true/g)).toHaveLength(1);
    expect(body).toContain('**Plan**');
    expect(body).toContain('Think first.');
    expect(body).toContain('Final answer.');
  });

  it('includes tool_name when forwarding tool responses back to Ollama', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'gemma4:31b',
          message: {
            role: 'assistant',
            content: 'done',
          },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 12,
          eval_count: 4,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const manager = new OllamaGemmaBridgeManager({
      getOllamaGemmaSettings: () => ({
        bridgeHost: '127.0.0.1',
        bridgePort: 0,
        ollamaBaseUrl: 'http://127.0.0.1:11434',
      }),
      isLocalGemmaModel: (modelId: string) => modelId === 'gemma4:31b',
    } as unknown as Config);

    const baseUrl = await manager.ensureStarted();
    const response = await realFetch(
      `${baseUrl}/v1beta/models/gemma4:31b:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Create the file.' }],
            },
            {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'write_file',
                    args: {
                      file_path: '.tmp/gemma_smoke.txt',
                      content: 'smoke-ok',
                    },
                  },
                },
              ],
            },
            {
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: 'write_file',
                    response: {
                      output: 'Created .tmp/gemma_smoke.txt',
                    },
                  },
                },
              ],
            },
          ],
        }),
      },
    );

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const upstreamRequest = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'),
    ) as {
      messages?: Array<{
        role?: string;
        tool_name?: string;
        content?: string;
        tool_calls?: Array<{
          function?: {
            name?: string;
          };
        }>;
      }>;
    };

    expect(upstreamRequest.messages).toEqual([
      {
        role: 'user',
        content: 'Create the file.',
      },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'write_file',
              arguments: {
                file_path: '.tmp/gemma_smoke.txt',
                content: 'smoke-ok',
              },
            },
          },
        ],
      },
      {
        role: 'tool',
        tool_name: 'write_file',
        content: 'Created .tmp/gemma_smoke.txt',
      },
    ]);
  });

  it('describes empty tool responses so follow-up turns are not blank', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'gemma4:31b',
          message: {
            role: 'assistant',
            content: 'done',
          },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 12,
          eval_count: 4,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const manager = new OllamaGemmaBridgeManager({
      getOllamaGemmaSettings: () => ({
        bridgeHost: '127.0.0.1',
        bridgePort: 0,
        ollamaBaseUrl: 'http://127.0.0.1:11434',
      }),
      isLocalGemmaModel: (modelId: string) => modelId === 'gemma4:31b',
    } as unknown as Config);

    const baseUrl = await manager.ensureStarted();
    const response = await realFetch(
      `${baseUrl}/v1beta/models/gemma4:31b:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Create the directory.' }],
            },
            {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'run_shell_command',
                    args: {
                      command: 'mkdir -p .tmp',
                      description: 'Create the directory.',
                    },
                  },
                },
              ],
            },
            {
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: 'run_shell_command',
                    response: {
                      output: '',
                    },
                  },
                },
              ],
            },
          ],
        }),
      },
    );

    expect(response.ok).toBe(true);

    const upstreamRequest = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'),
    ) as {
      messages?: Array<{
        role?: string;
        tool_name?: string;
        content?: string;
      }>;
    };

    expect(upstreamRequest.messages?.at(-1)).toEqual({
      role: 'tool',
      tool_name: 'run_shell_command',
      content: 'run_shell_command completed successfully with no output.',
    });
  });
});
