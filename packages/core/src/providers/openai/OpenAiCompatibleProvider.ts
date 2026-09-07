/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelProvider, ChatRequest, ModelEvent } from '../ModelProvider.js';
import { ZoeConfig } from '../../config/ZoeConfig.js';

export interface OpenAiCompatibleOptions {
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyEnvVar: string;
  apiKey?: string;
  extraHeaders?: Record<string, string>;
  keyHelpMessage?: string;
}

export class OpenAiCompatibleProvider implements ModelProvider {
  public readonly name: string;
  protected baseUrl: string;
  protected defaultModel: string;
  protected apiKeyEnvVar: string;
  protected explicitApiKey?: string;
  protected extraHeaders: Record<string, string>;
  protected keyHelpMessage: string;

  constructor(options: OpenAiCompatibleOptions) {
    this.name = options.name;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.defaultModel = options.defaultModel;
    this.apiKeyEnvVar = options.apiKeyEnvVar;
    this.explicitApiKey = options.apiKey;
    this.extraHeaders = options.extraHeaders || {};
    this.keyHelpMessage =
      options.keyHelpMessage ||
      `API key is missing for ${this.name}. Set the ${this.apiKeyEnvVar} environment variable or run "/key ${this.name} <api_key>".`;
  }

  public getApiKey(): string | undefined {
    if (this.explicitApiKey) {
      return this.explicitApiKey;
    }
    const envKey = process.env[this.apiKeyEnvVar]?.trim();
    if (envKey) {
      return envKey;
    }
    try {
      const config = new ZoeConfig();
      const settings = config.getSettings();
      if (this.apiKeyEnvVar === 'GROQ_API_KEY' && settings.groqApiKey) {
        return settings.groqApiKey.trim();
      }
      if (this.apiKeyEnvVar === 'OPENROUTER_API_KEY' && settings.openrouterApiKey) {
        return settings.openrouterApiKey.trim();
      }
      if (this.apiKeyEnvVar === 'OPENAI_API_KEY' && settings.openaiApiKey) {
        return settings.openaiApiKey.trim();
      }
    } catch {
      // Ignore config read error
    }
    return undefined;
  }

  public setApiKey(key: string): void {
    this.explicitApiKey = key.trim();
  }

  public async isAvailable(): Promise<boolean> {
    return Boolean(this.getApiKey());
  }

  public async *chat(request: ChatRequest): AsyncIterable<ModelEvent> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      yield { type: 'chunk', text: this.keyHelpMessage };
      yield { type: 'complete', fullText: this.keyHelpMessage };
      return;
    }

    const model = request.model || this.defaultModel;
    const url = `${this.baseUrl}/chat/completions`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...this.extraHeaders,
        },
        body: JSON.stringify({
          model,
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
          temperature: request.temperature ?? 0.7,
        }),
      });
    } catch (err: unknown) {
      const errorMsg = `Cannot connect to ${this.name} at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`;
      yield { type: 'chunk', text: errorMsg };
      yield { type: 'complete', fullText: errorMsg };
      return;
    }

    if (!response.ok) {
      let detail = '';
      try {
        const errorJson = (await response.json()) as { error?: { message?: string } | string };
        if (typeof errorJson.error === 'object' && errorJson.error?.message) {
          detail = errorJson.error.message;
        } else if (typeof errorJson.error === 'string') {
          detail = errorJson.error;
        }
      } catch {
        detail = await response.text();
      }

      let errorMsg = `[${this.name}] Request failed (${response.status}): ${detail}`;
      if (response.status === 401) {
        errorMsg = `[${this.name}] Authentication failed (401): Invalid or missing API key. Please check ${this.apiKeyEnvVar} or run "/key ${this.name} <api_key>".`;
      } else if (response.status === 429) {
        errorMsg = `[${this.name}] Rate limit exceeded (429): ${detail}`;
      }

      yield { type: 'chunk', text: errorMsg };
      yield { type: 'complete', fullText: errorMsg };
      return;
    }

    if (!response.body) {
      const emptyMsg = `[${this.name}] Server returned an empty response body.`;
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
          if (!trimmed || trimmed.startsWith(':')) continue; // Skip comments/keepalives

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice('data:'.length).trim();
            if (dataStr === '[DONE]') {
              break;
            }

            try {
              const parsed = JSON.parse(dataStr) as {
                choices?: Array<{
                  delta?: { content?: string };
                  text?: string;
                }>;
              };

              const chunk = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || '';
              if (chunk) {
                fullText += chunk;
                yield { type: 'chunk', text: chunk };
              }
            } catch {
              // Ignore malformed partial chunks
            }
          }
        }
      }

      if (buffer.trim().startsWith('data:')) {
        const dataStr = buffer.trim().slice('data:'.length).trim();
        if (dataStr !== '[DONE]') {
          try {
            const parsed = JSON.parse(dataStr) as {
              choices?: Array<{
                delta?: { content?: string };
                text?: string;
              }>;
            };
            const chunk = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || '';
            if (chunk) {
              fullText += chunk;
              yield { type: 'chunk', text: chunk };
            }
          } catch {
            // Ignore incomplete trailing line
          }
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
