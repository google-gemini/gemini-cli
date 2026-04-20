/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type GenerateContentResponse,
  type GenerateContentParameters,
  type CountTokensResponse,
  type CountTokensParameters,
  type EmbedContentResponse,
  type EmbedContentParameters,
  type Tool,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import type { LlmRole } from '../telemetry/llmRole.js';

import { debugLogger } from '../utils/debugLogger.js';

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | OpenAiContentPart[] | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAiContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export class OpenAiContentGenerator implements ContentGenerator {
  constructor(
    private readonly config: {
      apiKey?: string;
      baseUrl?: string;
      headers?: Record<string, string>;
    },
  ) {}

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const { model, contents, config } = request;
    const tools = (request as any).tools as Tool[] | undefined;
    const schema = (request as any).schema;

    const messages = this.mapContentsToMessages(
      contents as any,
      (config as any)?.systemInstruction,
    );

    // ULTIMATE FIX: Hardcode the local server IP to bypass any environment variable issues.
    // This ensures we NEVER hit OpenAI's official servers.
    const baseUrl = 'http://49.247.174.129:8000/v1';
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    const openAiTools = this.mapGeminiToolsToOpenAi(tools);

    const body: any = {
      model,
      messages,
      temperature: config?.temperature ?? 0.7,
      top_p: config?.topP ?? 1,
      max_tokens: config?.maxOutputTokens,
      stop: config?.stopSequences,
    };

    if (schema || config?.responseMimeType === 'application/json') {
      body.response_format = { type: 'json_object' };
    }

    if (openAiTools.length > 0) {
      body.tools = openAiTools;
    }

    debugLogger.log(
      `[OpenAiContentGenerator] FORCE-ROUTING to ${url} for model ${model}`,
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    // NO AUTHORIZATION HEADER for Gemma 4.
    // We confirmed via curl that the server works without it.

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: (config as Record<string, unknown>)?.['abortSignal'] as AbortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      // vLLM fallback for tool-calling incompatibility
      if (response.status === 404 || response.status === 400) {
        debugLogger.warn(`[OpenAiContentGenerator] Primary request failed (${response.status}), retrying without tools/schema...`);
        const fallbackBody = { ...body };
        delete fallbackBody.tools;
        delete fallbackBody.response_format;
        const fallbackResponse = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(fallbackBody),
        });
        if (fallbackResponse.ok) {
           const json = (await fallbackResponse.json()) as unknown;
           return this.mapResponseToGemini(json);
        }
      }
      throw new Error(
        `OpenAI API request failed with status ${response.status}: ${errorText}`,
      );
    }

    const json = (await response.json()) as unknown;
    const mappedResponse = this.mapResponseToGemini(json);

    return mappedResponse;
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const response = await this.generateContent(request, _userPromptId, _role);
    async function* stream() {
      yield response;
    }
    return stream();
  }

  async countTokens(
    _request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    return { totalTokens: 0 };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error('Embeddings not yet supported for OpenAI provider.');
  }

  private mapGeminiToolsToOpenAi(tools?: Tool[]): any[] {
    if (!tools) return [];
    const openAiTools: any[] = [];
    for (const tool of tools) {
      if (tool.functionDeclarations) {
        for (const fd of tool.functionDeclarations) {
          openAiTools.push({
            type: 'function',
            function: {
              name: fd.name,
              description: fd.description || '',
              parameters: this.transformGeminiSchemaToOpenAi(fd.parameters || { type: 'object', properties: {} }),
            },
          });
        }
      }
    }
    return openAiTools;
  }

  private transformGeminiSchemaToOpenAi(schema: any): any {
    if (!schema || typeof schema !== 'object') return schema;
    const transformed: any = { ...schema };
    if (transformed.type === 'OBJECT' || transformed.type === 'object') {
      transformed.type = 'object';
      if (transformed.properties) {
        for (const key in transformed.properties) {
          transformed.properties[key] = this.transformGeminiSchemaToOpenAi(transformed.properties[key]);
        }
      }
    } else if (transformed.type === 'ARRAY' || transformed.type === 'array') {
      transformed.type = 'array';
      if (transformed.items) {
        transformed.items = this.transformGeminiSchemaToOpenAi(transformed.items);
      }
    } else if (transformed.type === 'STRING') transformed.type = 'string';
    else if (transformed.type === 'INTEGER') transformed.type = 'integer';
    else if (transformed.type === 'NUMBER') transformed.type = 'number';
    else if (transformed.type === 'BOOLEAN') transformed.type = 'boolean';

    delete transformed.format;
    delete transformed.nullable;
    return transformed;
  }

  private mapContentsToMessages(
    contents: any[],
    systemInstruction?: any,
  ): OpenAiMessage[] {
    const messages: OpenAiMessage[] = [];
    let systemText = '';

    if (systemInstruction) {
      if (typeof systemInstruction === 'string') {
        systemText = systemInstruction;
      } else if (systemInstruction.parts) {
        systemText = (systemInstruction.parts as any[]).map((p: any) => p.text).join('\n');
      } else if (Array.isArray(systemInstruction)) {
        systemText = (systemInstruction as any[]).map((p: any) => p.text).join('\n');
      }
    }

    if (systemText) {
      messages.push({
        role: 'system',
        content: systemText,
      });
    }

    for (const content of contents) {
      const role = content.role === 'model' ? 'assistant' : 'user';
      const parts = content.parts || [];
      const openAiMsg: OpenAiMessage = { role };
      const contentParts: OpenAiContentPart[] = [];
      const toolCalls: OpenAiToolCall[] = [];

      for (const part of parts) {
        if ('text' in part && part.text) {
          contentParts.push({ type: 'text', text: part.text });
        } else if ('inlineData' in part && part.inlineData) {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
            },
          });
        } else if ('functionCall' in part && part.functionCall) {
          toolCalls.push({
            id: `call_${part.functionCall.name}_${Math.random().toString(36).substring(2, 5)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args),
            },
          });
        } else if ('functionResponse' in part && part.functionResponse) {
          messages.push({
            role: 'tool',
            tool_call_id: part.functionResponse.name,
            name: part.functionResponse.name,
            content: JSON.stringify(part.functionResponse.response),
          });
          continue;
        }
      }

      if (role === 'assistant' && toolCalls.length > 0) {
        openAiMsg.tool_calls = toolCalls;
        openAiMsg.content = contentParts.length > 0 ? contentParts.map(p => p.text).join('\n') : null;
      } else if (contentParts.length > 0) {
        if (contentParts.length === 1 && contentParts[0].type === 'text') {
          openAiMsg.content = contentParts[0].text;
        } else {
          openAiMsg.content = contentParts;
        }
      }

      if (openAiMsg.content !== undefined || openAiMsg.tool_calls !== undefined) {
        messages.push(openAiMsg);
      }
    }

    return messages;
  }

  private mapResponseToGemini(openaiJson: unknown): GenerateContentResponse {
    const json = openaiJson as Record<string, unknown>;
    const choices = json['choices'] as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0];
    if (!choice) {
      throw new Error('Invalid response from OpenAI API: No choices found');
    }

    const message = choice['message'] as Record<string, unknown> | undefined;
    const usage = json['usage'] as Record<string, unknown> | undefined;
    const toolCalls = message?.['tool_calls'] as any[] | undefined;

    const parts: any[] = [];
    if (message?.['content']) {
      parts.push({ text: message['content'] as string });
    }

    if (toolCalls) {
      for (const tc of toolCalls) {
        parts.push({
          functionCall: {
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments),
          },
        });
      }
    }

    const response = {
      candidates: [
        {
          content: {
            role: 'model',
            parts: parts.length > 0 ? parts : [{ text: '' }],
          },
          finishReason: this.mapFinishReason(
            (choice['finish_reason'] as string) || 'stop',
          ),
          index: (choice['index'] as number) ?? 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: (usage?.['prompt_tokens'] as number) ?? 0,
        candidatesTokenCount: (usage?.['completion_tokens'] as number) ?? 0,
        totalTokenCount: (usage?.['total_tokens'] as number) ?? 0,
      },
    } as unknown as GenerateContentResponse;

    Object.defineProperty(response, 'text', {
      get() {
        return (message?.['content'] as string) || '';
      },
    });

    return response;
  }

  private mapFinishReason(reason: string): string {
    switch (reason) {
      case 'stop':
        return 'STOP';
      case 'tool_calls':
        return 'STOP';
      case 'length':
        return 'MAX_TOKENS';
      case 'content_filter':
        return 'SAFETY';
      default:
        return 'OTHER';
    }
  }
}
