/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
  Candidate,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import type { ContentGenerator, ContentGeneratorConfig } from '../core/contentGenerator.js';

/**
 * Helper function to normalize ContentListUnion to Content array
 */
function normalizeContents(contents: any): Content[] {
  if (!contents) return [];
  if (Array.isArray(contents)) {
    return contents.filter((item: any) => item && typeof item === 'object' && 'parts' in item);
  }
  if (typeof contents === 'object' && 'parts' in contents) {
    return [contents];
  }
  if (typeof contents === 'string') {
    return [{ parts: [{ text: contents }], role: 'user' }];
  }
  if (typeof contents === 'object' && ('text' in contents || 'inlineData' in contents)) {
    return [{ parts: [contents], role: 'user' }];
  }
  return [];
}

/**
 * DeepSeek API content generator (OpenAI-compatible schema)
 */
export class DeepseekContentGenerator implements ContentGenerator {
  constructor(private config: ContentGeneratorConfig) {}

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const openaiPayload = this.convertToOpenAIFormat(request);

    const response = await fetch(`${this.config.baseUrl ?? 'https://api.deepseek.com'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // DeepSeek uses standard Bearer auth on the Authorization header
        // https://api-docs.deepseek.com/
        Authorization: `Bearer ${this.config.apiKey!}`,
        ...this.config.customHeaders,
      },
      body: JSON.stringify(openaiPayload),
      signal: this.config.timeout ? AbortSignal.timeout(this.config.timeout) : undefined,
    });

    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorData = await response.json();
        errorDetails = JSON.stringify(errorData);
      } catch (e) {
        errorDetails = await response.text();
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}. Details: ${errorDetails}`);
    }

    const data = await response.json();
    const result = this.convertFromOpenAIFormat(data);
    if (!result) {
      throw new Error('Failed to convert DeepSeek response');
    }
    return result;
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.generateContentStreamInternal(request);
  }

  private async *generateContentStreamInternal(
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const openaiPayload = {
      ...this.convertToOpenAIFormat(request),
      stream: true,
    };

    const response = await fetch(`${this.config.baseUrl ?? 'https://api.deepseek.com'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey!}`,
        ...this.config.customHeaders,
      },
      body: JSON.stringify(openaiPayload),
      signal: this.config.timeout ? AbortSignal.timeout(this.config.timeout) : undefined,
    });

    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorData = await response.json();
        errorDetails = JSON.stringify(errorData);
      } catch (e) {
        errorDetails = await response.text();
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}. Details: ${errorDetails}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    // Accumulate streaming tool calls (OpenAI-style)
    const toolCallAccumulator = new Map<number, {
      id?: string;
      name?: string;
      args: string; // JSON string fragments
    }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            // End of stream: flush any accumulated tool calls
            if (toolCallAccumulator.size > 0) {
              const out = this.convertAccumulatedOpenAIToolCallsToGemini(toolCallAccumulator);
              if (out) yield out;
            }
            return;
          }

          try {
            const parsed = JSON.parse(payload);
            const maybe = this.handleOpenAIStreamingEvent(parsed, toolCallAccumulator);
            if (maybe) yield maybe;
          } catch {
            // ignore partials
          }
        }
      }

      // Just in case (normally handled by [DONE])
      if (toolCallAccumulator.size > 0) {
        const out = this.convertAccumulatedOpenAIToolCallsToGemini(toolCallAccumulator);
        if (out) yield out;
      }
    } finally {
      reader.releaseLock();
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // DeepSeek doesn't expose a separate token-count endpoint; approximate
    const contents = normalizeContents(request.contents);
    const text = this.extractTextFromContents(contents);
    const approximateTokens = Math.ceil(text.length / 4);
    return { totalTokens: approximateTokens };
  }

  async embedContent(_request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('DeepSeek chat API does not provide embeddings in this client.');
  }

  // ---------- Conversions ----------

  private convertToOpenAIFormat(request: GenerateContentParameters): any {
    const contents = normalizeContents(request.contents);

    // Preserve your stability choice: convert tool results into readable text chunks
    const processedContents = this.convertToolResultsToText(contents);

    const messages = this.convertContentsToOpenAIMessages(processedContents, request);

    const payload: any = {
      model: request.model || 'deepseek-chat',
      messages,
      max_tokens: request.config?.maxOutputTokens ?? 2048,
      temperature: request.config?.temperature ?? 0.7,
      top_p: request.config?.topP ?? 1,
    };

    // Tools (function calling)
    if (request.config?.tools?.length) {
      const tools: any[] = [];
      for (const tool of request.config.tools) {
        if ('functionDeclarations' in tool && tool.functionDeclarations) {
          for (const fn of tool.functionDeclarations) {
            tools.push({
              type: 'function',
              function: {
                name: fn.name,
                description: fn.description ?? '',
                parameters: fn.parameters ?? { type: 'object', properties: {} },
              },
            });
          }
        }
      }
      if (tools.length) payload.tools = tools;
      // Let the model decide unless CLI specifies otherwise
      if (request.config?.toolConfig?.functionCallingConfig?.mode === 'ANY') {
        payload.tool_choice = 'auto';
      } else if (request.config?.toolConfig?.functionCallingConfig?.mode === 'NONE') {
        payload.tool_choice = 'none';
      }
    }

    // JSON-only outputs (responseMimeType + schema)
    if (request.config?.responseMimeType === 'application/json' && request.config?.responseSchema) {
      payload.response_format = { type: 'json_object' };
      // Also prepend an instruction to first user message as a belt-and-suspenders
      const jsonInstruction =
        `You must respond with valid JSON only, matching this schema: ${
          JSON.stringify(request.config.responseSchema)
        }`;
      // Inject at the top as a system message to be robust
      payload.messages = [
        { role: 'system', content: jsonInstruction },
        ...payload.messages,
      ];
    }

    return payload;
  }

  private convertToolResultsToText(contents: any[]): any[] {
    return contents.map((content) => {
      if (content.role === 'user' && content.parts?.some((p: any) => 'functionResponse' in p)) {
        const textParts: any[] = [];
        const toolResults: any[] = [];
        for (const part of content.parts) {
          if ('functionResponse' in part && part.functionResponse) toolResults.push(part);
          else if ('text' in part && part.text) textParts.push(part);
        }
        if (toolResults.length > 0) {
          let summaryText = '';
          if (textParts.length > 0) summaryText = textParts.map(p => p.text).join('\n') + '\n\n';
          summaryText += '## Tool Execution Completed\n\n';
          summaryText += 'The following tools have been executed successfully:\n\n';
          for (const tr of toolResults) {
            const response = typeof tr.functionResponse.response === 'string'
              ? tr.functionResponse.response
              : JSON.stringify(tr.functionResponse.response, null, 2);
            summaryText += `### ${tr.functionResponse.name}\n`;
            summaryText += '```\n' + response + '\n```\n\n';
          }
          summaryText += '**Task completed successfully.** Please summarize results and insights.';
          return { ...content, parts: [{ text: summaryText }] };
        }
      }
      return content;
    });
  }

  private convertContentsToOpenAIMessages(contents: any[], request: GenerateContentParameters): any[] {
    const messages: any[] = [];

    for (const c of contents as Content[]) {
      const texts: string[] = [];
      if (c.parts) {
        for (const p of c.parts) {
          if ('text' in p && p.text) {
            texts.push(p.text);
          } else if ('functionCall' in p && p.functionCall) {
            // In a single request we can't mix assistant function calls mid-turn cleanly;
            // keep a textual hint to preserve intent when needed.
            texts.push(`[function_call request: ${p.functionCall.name}(${JSON.stringify(p.functionCall.args || {})})]`);
          } else if ('functionResponse' in p && p.functionResponse) {
            const resp = typeof p.functionResponse.response === 'string'
              ? p.functionResponse.response
              : JSON.stringify(p.functionResponse.response);
            texts.push(`Tool result from ${p.functionResponse.name}: ${resp}`);
          } else {
            texts.push(JSON.stringify(p));
          }
        }
      }
      const role = c.role === 'model' ? 'assistant' : 'user';
      if (texts.join('').trim().length > 0) {
        messages.push({ role, content: texts.join('\n') });
      }
    }

    // If caller provided a system instruction via request.config?.systemInstruction, surface it
    if ((request as any).systemInstruction && typeof (request as any).systemInstruction === 'string') {
      messages.unshift({ role: 'system', content: (request as any).systemInstruction });
    }

    return messages;
  }

  private convertFromOpenAIFormat(data: any): GenerateContentResponse | null {
    // Non-streaming response shape: choices[0].message.{content, tool_calls}, usage
    const choice = data?.choices?.[0];
    if (!choice) return null;

    const text = choice.message?.content ?? '';
    const toolCalls = choice.message?.tool_calls ?? [];

    const candidate: Candidate = {
      content: { parts: [{ text }], role: 'model' },
      finishReason: (choice.finish_reason === 'tool_calls' ? 'tool_calls' : 'STOP') as any,
      index: 0,
    };

    const functionCalls = toolCalls.map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name,
      args: (() => {
        try { return JSON.parse(tc.function?.arguments ?? '{}'); } catch { return {}; }
      })(),
    }));

    const usage: GenerateContentResponseUsageMetadata = {
      promptTokenCount: data?.usage?.prompt_tokens ?? 0,
      candidatesTokenCount: data?.usage?.completion_tokens ?? 0,
      totalTokenCount: data?.usage?.total_tokens ?? ((data?.usage?.prompt_tokens ?? 0) + (data?.usage?.completion_tokens ?? 0)),
    };

    return {
      candidates: [candidate],
      usageMetadata: usage,
      text,
      functionCalls,
      data: undefined,
      executableCode: undefined,
      codeExecutionResult: undefined,
    };
  }

  private handleOpenAIStreamingEvent(
    data: any,
    toolCallAccumulator: Map<number, { id?: string; name?: string; args: string }>
  ): GenerateContentResponse | null {
    // Stream chunk example:
    // { id, choices: [{ delta: { content: "hi" | {tool_calls: [{ index, id, function: {name|arguments}}]} }, finish_reason }] }
    const choice = data?.choices?.[0];
    if (!choice) return null;

    const delta = choice.delta ?? {};
    const finish = choice.finish_reason;

    // Text delta
    if (typeof delta.content === 'string' && delta.content.length > 0) {
      return this.createStreamingTextResponse(delta.content);
    }

    // Tool call deltas
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx: number = tc.index ?? 0;
        const acc = toolCallAccumulator.get(idx) ?? { args: '' };

        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name = tc.function.name;
        if (typeof tc.function?.arguments === 'string') {
          acc.args += tc.function.arguments;
        }

        toolCallAccumulator.set(idx, acc);
      }
      return null; // don't emit mid-accumulation
    }

    // If the model signals tool_calls finish, flush
    if (finish === 'tool_calls' && toolCallAccumulator.size > 0) {
      return this.convertAccumulatedOpenAIToolCallsToGemini(toolCallAccumulator);
    }

    // Normal stop without tools: no extra emission here (text already streamed)
    return null;
  }

  private createStreamingTextResponse(text: string): GenerateContentResponse {
    const candidate: Candidate = {
      content: { parts: [{ text }], role: 'model' },
      finishReason: 'STOP' as any,
      index: 0,
    };
    return {
      candidates: [candidate],
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
      text,
      functionCalls: [],
      data: undefined,
      executableCode: undefined,
      codeExecutionResult: undefined,
    };
  }

  private convertAccumulatedOpenAIToolCallsToGemini(
    acc: Map<number, { id?: string; name?: string; args: string }>
  ): GenerateContentResponse | null {
    const entries = [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);

    const functionCalls = entries.map((v) => {
      let parsed: any = {};
      try { parsed = v.args ? JSON.parse(v.args) : {}; } catch { parsed = {}; }
      return { id: v.id, name: v.name, args: parsed };
    });

    if (functionCalls.length === 0) return null;

    const candidate: Candidate = {
      content: { parts: [{ text: '' }], role: 'model' },
      finishReason: 'tool_calls' as any,
      index: 0,
    };

    return {
      candidates: [candidate],
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
      text: '',
      functionCalls,
      data: undefined,
      executableCode: undefined,
      codeExecutionResult: undefined,
    };
  }

  private extractTextFromContents(contents: Content[]): string {
    return contents
      .map(c => c.parts?.map((p: Part) => ('text' in p ? p.text : '')).join(' ') || '')
      .join(' ');
  }
}
