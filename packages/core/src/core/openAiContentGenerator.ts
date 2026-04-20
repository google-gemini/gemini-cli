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
  type Content,
  type GenerateContentConfig,
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

/**
 * Type guard for Tool.
 */
function isTool(tool: unknown): tool is Tool {
  return typeof tool === 'object' && tool !== null && 'functionDeclarations' in tool;
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
    
    // Access internal properties safely without unsafe assertions
    const rawRequest = request as Record<string, unknown>;
    const toolsRaw = rawRequest['tools'];
    const tools = Array.isArray(toolsRaw) ? toolsRaw.filter(isTool) : undefined;
    const schema = rawRequest['schema'];

    const rawConfig = (config || {}) as Record<string, unknown>;
    const systemInstruction = rawConfig['systemInstruction'] as Content | undefined;
    const responseMimeType = rawConfig['responseMimeType'] as string | undefined;
    const abortSignal = rawConfig['abortSignal'] as AbortSignal | undefined;

    const messages = this.mapContentsToMessages(
      contents,
      systemInstruction,
    );

    const baseUrl =
      this.config.baseUrl ||
      process.env['OPENAI_API_BASE_URL'] ||
      'https://api.openai.com/v1';
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    const openAiTools = this.mapGeminiToolsToOpenAi(tools);

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: config?.temperature ?? 0.7,
      top_p: config?.topP ?? 1,
      max_tokens: config?.maxOutputTokens,
      stop: config?.stopSequences,
    };

    if (schema || responseMimeType === 'application/json') {
      body['response_format'] = { type: 'json_object' };
    }

    if (openAiTools.length > 0) {
      body['tools'] = openAiTools;
    }

    debugLogger.log(
      `[OpenAiContentGenerator] FORCE-ROUTING to ${url} for model ${model}`,
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.apiKey && !baseUrl.includes('49.247.174.129')) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 404 || response.status === 400) {
        debugLogger.warn(
          `[OpenAiContentGenerator] Primary request failed (${response.status}), retrying without tools/schema...`,
        );
        const fallbackBody = { ...body };
        delete fallbackBody['tools'];
        delete fallbackBody['response_format'];
        const fallbackResponse = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(fallbackBody),
        });
        if (fallbackResponse.ok) {
          const json = await fallbackResponse.ok ? await fallbackResponse.json() : {};
          return this.mapResponseToGemini(json);
        }
      }
      throw new Error(
        `OpenAI API request failed with status ${response.status}: ${errorText}`,
      );
    }

    const json = await response.json();
    return this.mapResponseToGemini(json);
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

  private mapGeminiToolsToOpenAi(tools?: Tool[]): unknown[] {
    if (!tools) return [];
    const openAiTools: unknown[] = [];
    for (const tool of tools) {
      if (tool.functionDeclarations) {
        for (const fd of tool.functionDeclarations) {
          openAiTools.push({
            type: 'function',
            function: {
              name: fd.name,
              description: fd.description || '',
              parameters: this.transformGeminiSchemaToOpenAi(
                fd.parameters || { type: 'object', properties: {} },
              ),
            },
          });
        }
      }
    }
    return openAiTools;
  }

  private transformGeminiSchemaToOpenAi(schema: unknown): unknown {
    if (!schema || typeof schema !== 'object') return schema;
    const transformed: Record<string, unknown> = {
      ...(schema as Record<string, unknown>),
    };
    const type = transformed['type'];
    if (type === 'OBJECT' || type === 'object') {
      transformed['type'] = 'object';
      const props = transformed['properties'];
      if (typeof props === 'object' && props !== null) {
        const propsRecord = props as Record<string, unknown>;
        for (const key in propsRecord) {
          propsRecord[key] = this.transformGeminiSchemaToOpenAi(propsRecord[key]);
        }
      }
    } else if (type === 'ARRAY' || type === 'array') {
      transformed['type'] = 'array';
      if (transformed['items']) {
        transformed['items'] = this.transformGeminiSchemaToOpenAi(
          transformed['items'],
        );
      }
    } else if (type === 'STRING') transformed['type'] = 'string';
    else if (type === 'INTEGER') transformed['type'] = 'integer';
    else if (type === 'NUMBER') transformed['type'] = 'number';
    else if (type === 'BOOLEAN') transformed['type'] = 'boolean';

    delete transformed['format'];
    delete transformed['nullable'];
    return transformed;
  }

  private mapContentsToMessages(
    contents: Content[],
    systemInstruction?: Content,
  ): OpenAiMessage[] {
    const messages: OpenAiMessage[] = [];
    let systemText = '';

    if (systemInstruction?.parts) {
      systemText = systemInstruction.parts
        .map((p) => ('text' in p ? p.text : ''))
        .join('\n');
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
        openAiMsg.content =
          contentParts.length > 0
            ? contentParts.map((p) => p.text).join('\n')
            : null;
      } else if (contentParts.length > 0) {
        if (contentParts.length === 1 && contentParts[0].type === 'text') {
          openAiMsg.content = contentParts[0].text;
        } else {
          openAiMsg.content = contentParts;
        }
      }

      if (
        openAiMsg.content !== undefined ||
        openAiMsg.tool_calls !== undefined
      ) {
        messages.push(openAiMsg);
      }
    }

    return messages;
  }

  private mapResponseToGemini(openaiJson: unknown): GenerateContentResponse {
    const json = (openaiJson || {}) as Record<string, unknown>;
    const choices = json['choices'] as Record<string, unknown>[] | undefined;
    const choice = choices?.[0];
    if (!choice) {
      throw new Error('Invalid response from OpenAI API: No choices found');
    }

    const message = choice['message'] as Record<string, unknown> | undefined;
    const usage = json['usage'] as Record<string, unknown> | undefined;
    const toolCalls = message?.['tool_calls'] as Record<string, unknown>[] | undefined;

    const parts: unknown[] = [];
    const content = message?.['content'] as string | undefined;
    if (content) {
      parts.push({ text: content });
    }

    if (toolCalls) {
      for (const tc of toolCalls) {
        const fn = tc['function'] as Record<string, unknown> | undefined;
        if (fn) {
          parts.push({
            functionCall: {
              name: fn['name'] as string,
              args: JSON.parse(fn['arguments'] as string) as Record<string, unknown>,
            },
          });
        }
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
    } as unknown;

    const finalResponse = response as GenerateContentResponse;

    Object.defineProperty(finalResponse, 'text', {
      get() {
        return content || '';
      },
    });

    return finalResponse;
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
