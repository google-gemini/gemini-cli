/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelProvider, ChatRequest, ModelEvent } from '../ModelProvider.js';

export interface OllamaProviderOptions {
  baseUrl?: string;
  defaultModel?: string;
}

export class OllamaProvider implements ModelProvider {
  public readonly name = 'ollama';
  private baseUrl: string;
  private defaultModel: string;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = (options.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
    this.defaultModel = options.defaultModel || 'llama3.2';
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async *chat(request: ChatRequest): AsyncIterable<ModelEvent> {
    const model = request.model || this.defaultModel;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
          options: {
            temperature: request.temperature ?? 0.7,
          },
        }),
      });
    } catch (err: unknown) {
      const errorMsg = `Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running? (Try running "ollama serve" or "systemctl start ollama")`;
      yield { type: 'chunk', text: errorMsg };
      yield { type: 'complete', fullText: errorMsg };
      return;
    }

    if (!response.ok) {
      let detail = '';
      try {
        const errorJson = (await response.json()) as { error?: string };
        detail = errorJson.error || '';
      } catch {
        detail = await response.text();
      }

      let errorMsg = `Ollama request failed (${response.status}): ${detail}`;
      if (response.status === 404 || detail.includes('not found')) {
        errorMsg = `Ollama model "${model}" was not found. Install it with: ollama pull ${model}`;
      }

      yield { type: 'chunk', text: errorMsg };
      yield { type: 'complete', fullText: errorMsg };
      return;
    }

    if (!response.body) {
      const emptyMsg = 'Ollama returned an empty response body.';
      yield { type: 'chunk', text: emptyMsg };
      yield { type: 'complete', fullText: emptyMsg };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed) as {
              message?: { content?: string };
              done?: boolean;
            };

            const chunk = parsed.message?.content || '';
            if (chunk) {
              fullText += chunk;
              yield { type: 'chunk', text: chunk };
            }

            if (parsed.done) {
              break;
            }
          } catch {
            // Ignore incomplete lines
          }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as {
            message?: { content?: string };
          };
          const chunk = parsed.message?.content || '';
          if (chunk) {
            fullText += chunk;
            yield { type: 'chunk', text: chunk };
          }
        } catch {
          // Ignore parse errors on final chunk
        }
      }

      yield { type: 'complete', fullText };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      yield { type: 'error', error };
    } finally {
      reader.releaseLock();
    }
  }
}
