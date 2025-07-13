/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
  GenerateContentConfig,
} from '@google/genai';
import { ContentGenerator } from '../core/contentGenerator.js';
import { UserTierId } from '../code_assist/types.js';
import { 
  QwenError, 
  QwenErrorType, 
  RetryHandler, 
  RetryConfig, 
  DEFAULT_RETRY_CONFIG 
} from './qwenErrors.js';
import {
  ExtendedGenerateContentConfig,
  QwenSpecificConfig,
  getMergedQwenConfig,
  qwenConfigToApiParams,
} from './qwenConfig.js';
import {
  QwenConfigValidator,
  validateEnvironmentOrThrow,
  validateConfigOrThrow,
} from './qwenValidator.js';

export interface QwenContentGeneratorConfig {
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
}

/**
 * Content generator that adapts Qwen API to Gemini interface
 */
export class QwenContentGenerator implements ContentGenerator {
  private retryHandler: RetryHandler;
  private timeout: number;

  constructor(
    private apiKey: string,
    private apiUrl: string,
    private httpOptions: any = {},
    config: QwenContentGeneratorConfig = {},
  ) {
    // Validate environment configuration
    validateEnvironmentOrThrow({
      apiKey: this.apiKey,
      apiUrl: this.apiUrl,
      timeout: config.timeout,
    });

    this.timeout = config.timeout || 30000; // 30 seconds default
    this.retryHandler = new RetryHandler({
      ...DEFAULT_RETRY_CONFIG,
      ...config.retryConfig,
    });
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.timeout);

    try {
      return await this.retryHandler.executeWithRetry(async () => {
        const qwenRequest = this.convertToQwenRequest(request);
        
        let response: Response;
        try {
          response = await fetch(`${this.apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`,
              ...this.httpOptions.headers,
            },
            body: JSON.stringify(qwenRequest),
            signal: abortController.signal,
          });
        } catch (error) {
          if (abortController.signal.aborted) {
            throw QwenError.fromTimeoutError();
          }
          throw QwenError.fromNetworkError(error);
        }

        if (!response.ok) {
          let responseBody: string;
          try {
            responseBody = await response.text();
          } catch {
            responseBody = '';
          }
          throw QwenError.fromHttpStatus(response.status, response.statusText, responseBody);
        }

        let qwenResponse: any;
        try {
          qwenResponse = await response.json();
        } catch (error) {
          throw new QwenError(
            QwenErrorType.API_ERROR,
            'Failed to parse JSON response from Qwen API',
            response.status,
            false,
            error,
          );
        }

        return this.convertToGeminiResponse(qwenResponse);
      }, abortController.signal);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *generateContentStream(
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), this.timeout);

    try {
      const qwenRequest = {
        ...this.convertToQwenRequest(request),
        stream: true,
      };

      let response: Response;
      try {
        response = await fetch(`${this.apiUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            ...this.httpOptions.headers,
          },
          body: JSON.stringify(qwenRequest),
          signal: abortController.signal,
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          throw QwenError.fromTimeoutError();
        }
        throw QwenError.fromNetworkError(error);
      }

      if (!response.ok) {
        let responseBody: string;
        try {
          responseBody = await response.text();
        } catch {
          responseBody = '';
        }
        throw QwenError.fromHttpStatus(response.status, response.statusText, responseBody);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new QwenError(
          QwenErrorType.API_ERROR,
          'Failed to get response stream reader',
        );
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          if (abortController.signal.aborted) {
            throw QwenError.fromTimeoutError();
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                return;
              }
              try {
                const chunk = JSON.parse(data);
                const geminiChunk = this.convertStreamChunkToGemini(chunk);
                if (geminiChunk) {
                  yield geminiChunk;
                }
              } catch (e) {
                // Skip invalid JSON chunks but log warning
                console.warn('Failed to parse streaming chunk:', e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Qwen doesn't have token counting API, so we estimate
    const text = this.extractTextFromContents(request.contents || []);
    const estimatedTokens = Math.ceil(text.length / 4); // Rough estimation: 4 chars per token
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Qwen embedding API is different, would need specific implementation
    throw new Error('Embedding not supported for Qwen models');
  }

  async getTier(): Promise<UserTierId | undefined> {
    return undefined;
  }

  private convertToQwenRequest(request: GenerateContentParameters): any {
    const messages = this.convertContentsToMessages(request.contents || []);
    
    // Add system instruction if present
    if (request.config?.systemInstruction) {
      const systemContent = this.extractTextFromParts(
        Array.isArray(request.config.systemInstruction) 
          ? request.config.systemInstruction 
          : [request.config.systemInstruction]
      );
      if (systemContent) {
        messages.unshift({
          role: 'system',
          content: systemContent,
        });
      }
    }

    // Validate model
    const modelValidation = QwenConfigValidator.validateModel(request.model);
    if (modelValidation.warnings.length > 0) {
      console.warn('Model validation warnings:', modelValidation.warnings.join(', '));
    }

    // Get merged Qwen configuration
    const extendedConfig = request.config as ExtendedGenerateContentConfig;
    const qwenConfig = getMergedQwenConfig(request.model, extendedConfig?.qwen);
    
    // Validate the merged configuration
    validateConfigOrThrow(qwenConfig);

    const qwenRequest: any = {
      model: request.model,
      messages,
      temperature: request.config?.temperature || 0,
      top_p: request.config?.topP || 1,
      max_tokens: request.config?.maxOutputTokens || 4000,
    };

    // Add Qwen-specific parameters
    const qwenParams = qwenConfigToApiParams(qwenConfig);
    Object.assign(qwenRequest, qwenParams);

    // Handle function calling if tools are present
    if (request.config?.tools && request.config.tools.length > 0) {
      const functions = this.convertToolsToFunctions(request.config.tools);
      if (functions.length > 0) {
        qwenRequest.functions = functions;
        qwenRequest.function_call = 'auto';
      }
    }

    // Handle Qwen-specific tools if no Gemini tools
    if (!qwenRequest.functions && qwenConfig.tools && qwenConfig.tools.length > 0) {
      qwenRequest.tools = qwenConfig.tools;
    }

    return qwenRequest;
  }

  private convertContentsToMessages(contents: Content[]): any[] {
    return contents.map(content => ({
      role: content.role === 'model' ? 'assistant' : content.role,
      content: this.extractTextFromParts(content.parts),
    })).filter(msg => msg.content.trim());
  }

  private extractTextFromParts(parts: Part[]): string {
    return parts
      .map(part => {
        if (part.text) return part.text;
        if (part.functionCall) {
          return `[Function Call: ${part.functionCall.name}(${JSON.stringify(part.functionCall.args)})]`;
        }
        if (part.functionResponse) {
          return `[Function Response: ${JSON.stringify(part.functionResponse.response)}]`;
        }
        return '';
      })
      .join('\n')
      .trim();
  }

  private extractTextFromContents(contents: Content[]): string {
    return contents
      .map(content => this.extractTextFromParts(content.parts))
      .join('\n');
  }

  private convertToGeminiResponse(qwenResponse: any): GenerateContentResponse {
    const choice = qwenResponse.choices?.[0];
    if (!choice) {
      throw new Error('No choices in Qwen response');
    }

    const parts: Part[] = [];
    
    if (choice.message?.content) {
      parts.push({ text: choice.message.content });
    }

    if (choice.message?.function_call) {
      parts.push({
        functionCall: {
          name: choice.message.function_call.name,
          args: JSON.parse(choice.message.function_call.arguments || '{}'),
        },
      });
    }

    return {
      candidates: [
        {
          content: {
            role: 'model',
            parts,
          },
          finishReason: this.mapFinishReason(choice.finish_reason),
        },
      ],
      usageMetadata: {
        promptTokenCount: qwenResponse.usage?.prompt_tokens,
        candidatesTokenCount: qwenResponse.usage?.completion_tokens,
        totalTokenCount: qwenResponse.usage?.total_tokens,
      },
    };
  }

  private convertStreamChunkToGemini(chunk: any): GenerateContentResponse | null {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return null;

    const parts: Part[] = [];
    
    if (delta.content) {
      parts.push({ text: delta.content });
    }

    if (delta.function_call) {
      parts.push({
        functionCall: {
          name: delta.function_call.name,
          args: JSON.parse(delta.function_call.arguments || '{}'),
        },
      });
    }

    if (parts.length === 0) return null;

    return {
      candidates: [
        {
          content: {
            role: 'model',
            parts,
          },
          finishReason: chunk.choices?.[0]?.finish_reason 
            ? this.mapFinishReason(chunk.choices[0].finish_reason)
            : undefined,
        },
      ],
    };
  }

  private convertToolsToFunctions(tools: any[]): any[] {
    const functions: any[] = [];
    
    for (const tool of tools) {
      if (tool.functionDeclarations) {
        for (const func of tool.functionDeclarations) {
          functions.push({
            name: func.name,
            description: func.description,
            parameters: func.parameters,
          });
        }
      }
    }
    
    return functions;
  }

  private mapFinishReason(qwenReason: string): string {
    switch (qwenReason) {
      case 'stop':
        return 'STOP';
      case 'length':
        return 'MAX_TOKENS';
      case 'function_call':
        return 'STOP';
      default:
        return 'OTHER';
    }
  }
}