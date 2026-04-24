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
const TIMEOUT_MS = 600_000; // 10 minutes — local inference is slow for large prompts
const MAX_RETRIES = 3;
// 3 chars per token is a conservative estimate; reserve 25% of num_ctx for
// system prompt and response, leaving 75% for history content.
const CHARS_PER_TOKEN = 3;
const HISTORY_CTX_FRACTION = 0.75;

/** Strip characters that could break the flat-text prompt structure. */
function sanitizeText(s: string): string {
  return s.replace(/[\n\r\]]/g, ' ');
}

function truncate(s: string): string {
  const t = s.slice(0, MAX_CHARS_PER_TOOL_OUTPUT);
  return t.length < s.length ? `${t}…` : t;
}

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
        // part.thought is a boolean marker; when true, part.text holds the thought content.
        const prefix = part.thought ? '[Thought] ' : '';
        lines.push(prefix + sanitizeText(part.text));
      } else if (part.functionCall) {
        const args = sanitizeText(
          JSON.stringify(part.functionCall.args ?? {}).slice(0, 300),
        );
        lines.push(`[Tool call: ${part.functionCall.name}(${args})]`);
      } else if (part.functionResponse) {
        const raw = part.functionResponse.response;
        let output: string;
        if (typeof raw === 'string') {
          output = raw;
        } else if (raw && typeof raw === 'object' && 'output' in raw) {
          output = String(raw['output'] ?? '');
        } else {
          output = JSON.stringify(raw ?? '');
        }
        lines.push(
          `[Tool result from ${part.functionResponse.name}: ${truncate(sanitizeText(output))}]`,
        );
      } else if (part.executableCode) {
        lines.push(
          `[Executable code (${part.executableCode.language}): ${truncate(sanitizeText(part.executableCode.code ?? ''))}]`,
        );
      } else if (part.codeExecutionResult) {
        lines.push(
          `[Code execution result (${part.codeExecutionResult.outcome}): ${truncate(sanitizeText(part.codeExecutionResult.output ?? ''))}]`,
        );
      } else if (part.inlineData) {
        lines.push(`[Media: ${part.inlineData.mimeType}]`);
      } else if (part.fileData) {
        lines.push(`[Media: ${part.fileData.mimeType}]`);
      }
    }

    if (lines.length > 0) {
      messages.push({ role, content: lines.join('\n') });
    }
  }
  return messages;
}

/**
 * Drops oldest non-system, non-snapshot messages until total chars fit within
 * the limit. The system message and any turn containing a prior
 * <state_snapshot> are always protected so existing compressed context is
 * never lost, regardless of session size.
 */
function capMessages(
  messages: OllamaMessage[],
  maxChars: number,
): OllamaMessage[] {
  let total = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (total <= maxChars) return messages;

  const result = [...messages];
  const isProtected = (m: OllamaMessage) =>
    m.role === 'system' || m.content.includes('<state_snapshot>');

  let i = result[0]?.role === 'system' ? 1 : 0;
  while (total > maxChars && i < result.length - 1) {
    if (!isProtected(result[i])) {
      total -= result[i].content.length;
      result.splice(i, 1);
    } else {
      i++;
    }
  }
  return result;
}

function extractSystemInstruction(
  si: GenerateContentOptions['systemInstruction'],
): string {
  if (!si) return '';
  if (typeof si === 'string') return si;
  if (Array.isArray(si))
    return (si as Array<{ text?: string }>).map((p) => p.text ?? '').join('\n');
  if (typeof si === 'object' && 'parts' in si && Array.isArray(si.parts))
    return (si.parts as Array<{ text?: string }>)
      .map((p) => p.text ?? '')
      .join('\n');
  if (typeof si === 'object' && 'text' in si)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return (si as { text: string }).text;
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
// 32K tokens — enough for most sessions, overrides Ollama's default 4096.
const DEFAULT_NUM_CTX = 32_768;

export class OllamaCompressClient {
  private readonly numCtx: number;

  constructor(
    private readonly host: string,
    private readonly model: string,
    numCtx?: number,
  ) {
    this.numCtx = numCtx ?? DEFAULT_NUM_CTX;
  }

  async generateContent(
    options: GenerateContentOptions,
  ): Promise<GenerateContentResponse> {
    const { contents, systemInstruction } = options;

    const baseMessages: OllamaMessage[] = [];

    const sysText = extractSystemInstruction(systemInstruction);
    if (sysText) {
      baseMessages.push({ role: 'system', content: sysText });
    }

    const maxHistoryChars = Math.floor(
      this.numCtx * CHARS_PER_TOKEN * HISTORY_CTX_FRACTION,
    );
    const sanitized = sanitizeHistory(contents);
    baseMessages.push(...capMessages(sanitized, maxHistoryChars));

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
        const text = await this.callOllama(messages, options.abortSignal);

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

  private async callOllama(
    messages: OllamaMessage[],
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const url = `${this.host.replace(/\/$/, '')}/api/chat`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const signal = abortSignal
      ? AbortSignal.any([controller.signal, abortSignal])
      : controller.signal;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          options: { num_ctx: this.numCtx },
        }),
        signal,
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

    let body: OllamaChatResponse;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      body = (await response.json()) as unknown as OllamaChatResponse;
    } catch (e) {
      throw new OllamaUnavailableError(
        `Ollama returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
        e,
      );
    }
    const text = body?.message?.content;
    if (!text) {
      throw new OllamaUnavailableError('Ollama returned empty content');
    }
    return text;
  }
}
