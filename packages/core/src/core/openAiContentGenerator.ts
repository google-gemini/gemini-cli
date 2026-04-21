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

    // Hardcode the local server IP to bypass any environment variable issues.
    const baseUrl = 'http://49.247.174.129:8000/v1';
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    const openAiTools = this.mapGeminiToolsToOpenAi(tools);

    debugLogger.log(`[OpenAiContentGenerator] FINAL MESSAGES SENT TO API: ${JSON.stringify(messages, null, 2)}`);

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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: (config as Record<string, unknown>)?.['abortSignal'] as AbortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
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

  private transformGeminiSchemaToOpenAi(schema: any): any {
    if (!schema || typeof schema !== 'object') return schema;
    const transformed: any = { ...schema };
    
    if (typeof transformed.type === 'string') {
      transformed.type = transformed.type.toLowerCase();
    }

    if (transformed.type === 'object') {
      if (transformed.properties) {
        for (const key in transformed.properties) {
          transformed.properties[key] = this.transformGeminiSchemaToOpenAi(
            transformed.properties[key],
          );
        }
      }
    } else if (transformed.type === 'array') {
      if (transformed.items) {
        transformed.items = this.transformGeminiSchemaToOpenAi(
          transformed.items,
        );
      }
    }

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
        systemText = (systemInstruction.parts as any[])
          .map((p: any) => p.text)
          .join('\n');
      } else if (Array.isArray(systemInstruction)) {
        systemText = (systemInstruction as any[])
          .map((p: any) => p.text)
          .join('\n');
      }
    }

    for (const content of contents) {
      const role = content.role === 'model' ? 'assistant' : 'user';
      const parts = content.parts || [];
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
            id:
              part.functionCall.id ||
              `call_${part.functionCall.name}_${Math.random().toString(36).substring(2, 5)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args),
            },
          });
        } else if ('functionResponse' in part && part.functionResponse) {
          messages.push({
            role: 'user',
            content: `<|tool_response|>${JSON.stringify(part.functionResponse.response)}<|tool_response|>`,
          });
        }
      }

      if (role === 'assistant' && toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          tool_calls: toolCalls,
          content: contentParts.length > 0 ? contentParts.map(p => p.text).join('\n') : null,
        });
      } else if (contentParts.length > 0) {
        const contentStr = contentParts.map(p => p.text).join('\n');
        messages.push({ role, content: contentStr });
      }
    }

    if (systemText && messages.length > 0) {
      const firstUserMsg = messages.find(m => m.role === 'user');
      if (firstUserMsg && typeof firstUserMsg.content === 'string') {
        const nudge = "\n\nIMPORTANT: \n1. Use 'google_web_search' for any external information. \n2. NEVER use 'run_shell_command' for searching or finding files. \n3. Use tools IMMEDIATELY without asking for permission. \n4. When calling tools, ensure you use the EXACT parameter names (e.g., 'query' for search, 'file_path' for read_file).";
        firstUserMsg.content = `System Instruction:\n${systemText}${nudge}\n\nUser Question:\n${firstUserMsg.content}`;
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
    
    let rawText = message?.['content'] as string || '';
    let filteredText = rawText;
    
    const parts: any[] = [];
    const functionCalls: any[] = [];

    const toolCallPatterns = [
      /<\|tool_call>([\s\S]*?)<tool_call\|?>/g,
      /call:([a-zA-Z0-9_]+)(\{[\s\S]*?\})/g
    ];

    for (const pattern of toolCallPatterns) {
      let match;
      while ((match = pattern.exec(rawText)) !== null) {
        const fullMatch = match[0];
        const innerContent = pattern.source.includes('<|tool_call>') ? match[1].trim() : match[0];
        
        const parts_match = innerContent.match(/call:([^\{]+)(\{[\s\S]*\})/);
        if (parts_match) {
          try {
            const name = parts_match[1].trim();
            let rawArgs = parts_match[2];
            
            // SUPER ROBUST PSEUDO-JSON PARSING V3
            // 1. Quote ALL unquoted keys (even if they start the object)
            // Regex: Finds an identifier followed by a colon that isn't already preceded by a quote
            rawArgs = rawArgs.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
            // If the very first key is missing its opening brace context in some outputs
            if (rawArgs.startsWith('{') && !rawArgs.startsWith('{"') && !rawArgs.startsWith('{"')) {
               rawArgs = rawArgs.replace(/^{([a-zA-Z0-9_]+):/, '{"$1":');
            }
            
            // 2. Quote string values ONLY if not already quoted
            rawArgs = rawArgs.replace(/:\s*([^"{\[tf\n\-0-9\s][^,}\n]*)/g, (match, p1) => {
              const trimmed = p1.trim();
              if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null' || !isNaN(Number(trimmed))) {
                return `: ${trimmed}`;
              }
              if (trimmed.startsWith('"')) return `: ${trimmed}`;
              return `: "${trimmed}"`;
            });

            // 3. Clean up
            rawArgs = rawArgs.replace(/,\s*([}\]])/g, '$1');

            const args = JSON.parse(rawArgs);
            const callId = `call_${name}_${Math.random().toString(36).substring(2, 5)}`;
          
            const fnCall = { name, args, id: callId };
            parts.push({ functionCall: fnCall });
            functionCalls.push(fnCall);
            
            filteredText = filteredText.replace(fullMatch, '').trim();
          } catch (e) {
            debugLogger.error(`[OpenAiContentGenerator] Failed to parse tool call: ${e}. Raw match: ${fullMatch}`);
          }
        }
      }
    }

    const openAiToolCalls = message?.['tool_calls'] as any[] | undefined;
    if (openAiToolCalls) {
      for (const tc of openAiToolCalls) {
        const fnCall = {
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments),
          id: tc.id,
        };
        parts.push({ functionCall: fnCall });
        functionCalls.push(fnCall);
      }
    }

    if (filteredText) {
      parts.unshift({ text: filteredText });
    } else if (parts.length === 0 && rawText) {
      parts.push({ text: rawText });
    }

    const response = {
      candidates: [
        {
          content: {
            role: 'model',
            parts: parts,
          },
          finishReason: this.mapFinishReason((choice['finish_reason'] as string) || 'stop'),
          index: (choice['index'] as number) ?? 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: (usage?.['prompt_tokens'] as number) ?? 0,
        candidatesTokenCount: (usage?.['completion_tokens'] as number) ?? 0,
        totalTokenCount: (usage?.['total_tokens'] as number) ?? 0,
      },
    } as any;

    if (functionCalls.length > 0) {
      response.functionCalls = functionCalls;
    }

    Object.defineProperty(response, 'text', {
      get() { return filteredText || (parts.find(p => p.text)?.text ?? ''); },
      configurable: true
    });

    return response as GenerateContentResponse;
  }

  private mapFinishReason(reason: string): string {
    switch (reason) {
      case 'stop':
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
