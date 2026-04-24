/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, GenerateContentResponse } from '@google/genai';
import type { GenerateContentOptions } from './baseLlmClient.js';
import { debugLogger } from '../utils/debugLogger.js';

export class OllamaUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'OllamaUnavailableError';
  }
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
}

// Truncate tool outputs to keep local model context manageable.
const MAX_CHARS_PER_TOOL_OUTPUT = 800;
// Total character cap across all sanitized messages (~30K tokens for gemma3:4b).
const MAX_TOTAL_CHARS = 120_000;
const TIMEOUT_MS = 90_000;
const MAX_RETRIES = 3;

/**
 * Converts Google GenAI Content[] (which may contain functionCall /
 * functionResponse parts) into plain text Ollama messages.
 * The local model sees only text — no tool-call structure.
 */
function sanitizeHistory(contents: Content[]): OllamaMessage[] {
  const messages: OllamaMessage[] = [];
  for (const content of contents) {
    const role = content.role === 'model' ? 'assistant' : 'user';
    const lines: string[] = [];

    for (const part of content.parts ?? []) {
      if (part.text) {
        lines.push(part.text);
      } else if (part.functionCall) {
        const args = JSON.stringify(part.functionCall.args ?? {}).slice(0, 300);
        lines.push(`[Tool call: ${part.functionCall.name}(${args})]`);
      } else if (part.functionResponse) {
        const raw = part.functionResponse.response;
        let output: string;
        if (typeof raw === 'string') {
          output = raw;
        } else if (raw && typeof raw === 'object' && 'output' in raw) {
          output = String((raw)['output'] ?? '');
        } else {
          output = JSON.stringify(raw ?? '');
        }
        const truncated = output.slice(0, MAX_CHARS_PER_TOOL_OUTPUT);
        const ellipsis = output.length > MAX_CHARS_PER_TOOL_OUTPUT ? '…' : '';
        lines.push(
          `[Tool result from ${part.functionResponse.name}: ${truncated}${ellipsis}]`,
        );
      }
    }

    if (lines.length > 0) {
      messages.push({ role, content: lines.join('\n') });
    }
  }
  return messages;
}

/**
 * If the total character count exceeds the cap, drop the oldest non-system
 * messages from the front until we are under the limit.
 */
function capMessages(messages: OllamaMessage[]): OllamaMessage[] {
  let total = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (total <= MAX_TOTAL_CHARS) return messages;

  const result = [...messages];
  // Never drop the system message (index 0 if present).
  const start = result[0]?.role === 'system' ? 1 : 0;
  while (result.length > start + 1 && total > MAX_TOTAL_CHARS) {
    const removed = result.splice(start, 1)[0];
    total -= removed.content.length;
  }
  return result;
}

function extractSystemInstruction(
  si: GenerateContentOptions['systemInstruction'],
): string {
  if (!si) return '';
  if (typeof si === 'string') return si;
   
  if ('text' in (si as object))
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return (si as { text: string }).text;
  if (Array.isArray(si))
    return (si as Array<{ text?: string }>).map((p) => p.text ?? '').join('\n');
  return JSON.stringify(si);
}

function buildResponse(text: string): GenerateContentResponse {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    candidates: [{ content: { role: 'model', parts: [{ text }] } }],
  } as unknown as GenerateContentResponse;
}

/**
 * Minimal LLM client that routes /compress summarisation calls to a local
 * Ollama instance. Only handles text in → text out. All tool-call structure
 * in the history is flattened to readable plain text before sending so the
 * small model never needs to understand the Google GenAI protocol.
 */
export class OllamaCompressClient {
  constructor(
    private readonly host: string,
    private readonly model: string,
  ) {}

  async generateContent(
    options: GenerateContentOptions,
  ): Promise<GenerateContentResponse> {
    const { contents, systemInstruction } = options;

    const baseMessages: OllamaMessage[] = [];

    const sysText = extractSystemInstruction(systemInstruction);
    if (sysText) {
      baseMessages.push({ role: 'system', content: sysText });
    }

    const sanitized = sanitizeHistory(contents);
    baseMessages.push(...capMessages(sanitized));

    const expectsSnapshot = baseMessages.some((m) =>
      m.content.includes('state_snapshot'),
    );

    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const messages: OllamaMessage[] =
        attempt === 0
          ? baseMessages
          : [
              ...baseMessages,
              {
                role: 'user',
                content:
                  'Output ONLY the <state_snapshot>…</state_snapshot> XML block. No preamble, no explanation.',
              },
            ];

      try {
        const text = await this.callOllama(messages);

        if (expectsSnapshot && !text.includes('<state_snapshot>')) {
          debugLogger.warn(
            `OllamaCompressClient attempt ${attempt + 1}: missing <state_snapshot>, retrying`,
          );
          lastError = new Error('Response missing <state_snapshot>');
          continue;
        }

        return buildResponse(text);
      } catch (e) {
        if (e instanceof OllamaUnavailableError) throw e;
        lastError = e;
        debugLogger.warn(
          `OllamaCompressClient attempt ${attempt + 1} failed: ${e}`,
        );
      }
    }

    throw new OllamaUnavailableError(
      `Ollama compression failed after ${MAX_RETRIES} attempts`,
      lastError,
    );
  }

  private async callOllama(messages: OllamaMessage[]): Promise<string> {
    const url = `${this.host.replace(/\/$/, '')}/api/chat`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new OllamaUnavailableError(
        `Ollama unreachable at ${url}: ${msg}`,
        e,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new OllamaUnavailableError(
        `Ollama HTTP ${response.status}: ${body}`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const body = (await response.json()) as unknown as OllamaChatResponse;
    const text = body?.message?.content;
    if (!text) {
      throw new Error('Ollama returned empty content');
    }
    return text;
  }
}
