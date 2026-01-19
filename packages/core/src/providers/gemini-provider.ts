/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import type {
  Content,
  GenerateContentParameters,
  Part,
  Tool,
  FunctionDeclaration,
} from '@google/genai';
import { BaseProvider } from './base-provider.js';
import type {
  ProviderConfig,
  ProviderInfo,
  ProviderModelInfo,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamChunk,
  ProviderMessage,
  ProviderTool,
  ProviderToolCall,
  ProviderFinishReason,
  ProviderUsage,
} from './types.js';
import {
  ProviderError,
  ProviderAuthError,
  ProviderRateLimitError,
} from './types.js';

/**
 * Gemini provider implementation using Google's GenAI SDK
 */
export class GeminiProvider extends BaseProvider {
  readonly id = 'gemini' as const;
  readonly name = 'Google Gemini';
  readonly models = [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
  ];
  readonly defaultModel = 'gemini-2.5-flash';

  private client: GoogleGenAI | null = null;

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new ProviderAuthError(
        this.id,
        'Gemini API key is required. Set GEMINI_API_KEY or provide apiKey in config.',
      );
    }

    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
    });
  }

  async validateCredentials(): Promise<boolean> {
    this.ensureInitialized();
    try {
      // Try a minimal API call to validate credentials
      const model = this.getCurrentModel();
      await this.client!.models.countTokens({
        model,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('401') ||
        message.includes('API key') ||
        message.includes('unauthorized')
      ) {
        return false;
      }
      throw error;
    }
  }

  async getAvailableModels(): Promise<ProviderModelInfo[]> {
    // Return static list - Gemini API doesn't have a models list endpoint
    return [
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Most capable Gemini 2.5 model',
        contextWindow: 2097152,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Fast and efficient Gemini 2.5 model',
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash Lite',
        description: 'Lightweight version of Gemini 2.5 Flash',
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gemini-3-pro-preview',
        name: 'Gemini 3 Pro (Preview)',
        description: 'Preview of next-generation Gemini Pro',
        contextWindow: 2097152,
        maxOutputTokens: 65536,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gemini-3-flash-preview',
        name: 'Gemini 3 Flash (Preview)',
        description: 'Preview of next-generation Gemini Flash',
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        supportsTools: true,
        supportsVision: true,
      },
    ];
  }

  getInfo(): ProviderInfo {
    return {
      id: this.id,
      name: this.name,
      description:
        "Google's Gemini family of multimodal AI models with tool use support",
      models: this.getStaticModelInfo(),
      defaultModel: this.defaultModel,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
      requiresApiKey: true,
    };
  }

  private getStaticModelInfo(): ProviderModelInfo[] {
    return [
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Most capable Gemini 2.5 model',
        contextWindow: 2097152,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Fast and efficient Gemini 2.5 model',
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash Lite',
        description: 'Lightweight version of Gemini 2.5 Flash',
        contextWindow: 1048576,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gemini-3-pro-preview',
        name: 'Gemini 3 Pro (Preview)',
        description: 'Preview of next-generation Gemini Pro',
        contextWindow: 2097152,
        maxOutputTokens: 65536,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gemini-3-flash-preview',
        name: 'Gemini 3 Flash (Preview)',
        description: 'Preview of next-generation Gemini Flash',
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        supportsTools: true,
        supportsVision: true,
      },
    ];
  }

  async generateContent(request: ProviderRequest): Promise<ProviderResponse> {
    this.ensureInitialized();

    const model = this.getCurrentModel(request.model);
    const params = this.convertRequest(request, model);

    try {
      const response = await this.client!.models.generateContent(params);
      return this.convertResponse(response, model);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async *generateContentStream(
    request: ProviderRequest,
  ): AsyncGenerator<ProviderStreamChunk> {
    this.ensureInitialized();

    const model = this.getCurrentModel(request.model);
    const params = this.convertRequest(request, model);

    try {
      const stream = await this.client!.models.generateContentStream(params);
      let accumulatedText = '';

      for await (const chunk of stream) {
        const text = chunk.text || '';
        accumulatedText += text;

        yield {
          delta: text,
          text: accumulatedText,
          isFinal: false,
        };
      }

      // Final chunk with full data
      yield {
        text: accumulatedText,
        isFinal: true,
        finishReason: 'stop',
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async countTokens(content: string, model?: string): Promise<number> {
    this.ensureInitialized();

    const resolvedModel = this.getCurrentModel(model);

    try {
      const response = await this.client!.models.countTokens({
        model: resolvedModel,
        contents: [{ role: 'user', parts: [{ text: content }] }],
      });
      return response.totalTokens || 0;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Convert provider-agnostic request to Gemini format
   */
  private convertRequest(
    request: ProviderRequest,
    model: string,
  ): GenerateContentParameters {
    const contents: Content[] = this.convertMessages(request.messages);

    const params: GenerateContentParameters = {
      model,
      contents,
    };

    // Add system instruction if provided
    if (request.systemPrompt) {
      params.config = {
        ...params.config,
        systemInstruction: request.systemPrompt,
      };
    }

    // Add generation config
    if (
      request.temperature !== undefined ||
      request.maxTokens !== undefined ||
      request.topP !== undefined ||
      request.topK !== undefined ||
      request.stopSequences
    ) {
      params.config = {
        ...params.config,
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        topP: request.topP,
        topK: request.topK,
        stopSequences: request.stopSequences,
      };
    }

    // Add thinking mode if requested
    if (request.thinkingBudget !== undefined) {
      params.config = {
        ...params.config,
        thinkingConfig: {
          thinkingBudget: request.thinkingBudget,
        },
      };
    }

    // Add tools if provided
    if (request.tools && request.tools.length > 0) {
      params.config = {
        ...params.config,
        tools: this.convertTools(request.tools),
      };
    }

    return params;
  }

  /**
   * Convert provider-agnostic messages to Gemini Content format
   */
  private convertMessages(messages: ProviderMessage[]): Content[] {
    return messages
      .filter((msg) => msg.role !== 'system') // System messages handled separately
      .map((msg) => {
        const parts: Part[] = [];

        // Add text content
        if (msg.content) {
          parts.push({ text: msg.content });
        }

        // Add tool results if present
        if (msg.toolResults) {
          for (const result of msg.toolResults) {
            parts.push({
              functionResponse: {
                name: result.toolCallId,
                response: {
                  content: result.content,
                  isError: result.isError,
                },
              },
            });
          }
        }

        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts,
        } as Content;
      });
  }

  /**
   * Convert provider-agnostic tools to Gemini format
   */
  private convertTools(tools: ProviderTool[]): Tool[] {
    const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.parameters,
    }));

    return [{ functionDeclarations }];
  }

  /**
   * Convert Gemini response to provider-agnostic format
   */
  private convertResponse(
    response: Awaited<
      ReturnType<typeof GoogleGenAI.prototype.models.generateContent>
    >,
    model: string,
  ): ProviderResponse {
    const candidate = response.candidates?.[0];
    const content = candidate?.content;

    // Extract text content
    let text = '';
    const toolCalls: ProviderToolCall[] = [];

    if (content?.parts) {
      for (const part of content.parts) {
        if ('text' in part && part.text) {
          text += part.text;
        }
        if ('functionCall' in part && part.functionCall) {
          toolCalls.push({
            id: part.functionCall.name || '',
            name: part.functionCall.name || '',
            arguments:
              (part.functionCall.args as Record<string, unknown>) || {},
          });
        }
      }
    }

    // Convert finish reason
    let finishReason: ProviderFinishReason = 'unknown';
    if (candidate?.finishReason) {
      switch (candidate.finishReason) {
        case 'STOP':
          finishReason = toolCalls.length > 0 ? 'tool_use' : 'stop';
          break;
        case 'MAX_TOKENS':
          finishReason = 'length';
          break;
        case 'SAFETY':
        case 'RECITATION':
        case 'BLOCKLIST':
          finishReason = 'content_filter';
          break;
        default:
          finishReason = 'unknown';
      }
    }

    // Extract usage
    let usage: ProviderUsage | undefined;
    if (response.usageMetadata) {
      usage = {
        inputTokens: response.usageMetadata.promptTokenCount || 0,
        outputTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata.totalTokenCount || 0,
        cachedTokens: response.usageMetadata.cachedContentTokenCount,
      };
    }

    return {
      content: text,
      model,
      usage,
      finishReason,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      raw: response,
    };
  }

  /**
   * Handle and convert Gemini errors to provider errors
   */
  private handleError(error: unknown): ProviderError {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes('401') ||
      message.includes('API key') ||
      message.includes('UNAUTHENTICATED')
    ) {
      return new ProviderAuthError(this.id, message);
    }

    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      const retryMatch = message.match(/retry.?after[:\s]+(\d+)/i);
      const retryAfter = retryMatch ? parseInt(retryMatch[1], 10) : undefined;
      return new ProviderRateLimitError(this.id, retryAfter);
    }

    if (message.includes('404') || message.includes('NOT_FOUND')) {
      return new ProviderError(
        `Gemini API error: ${message}`,
        this.id,
        'NOT_FOUND',
        404,
        false,
      );
    }

    return new ProviderError(
      `Gemini API error: ${message}`,
      this.id,
      'API_ERROR',
      undefined,
      message.includes('500') || message.includes('503'),
    );
  }
}
