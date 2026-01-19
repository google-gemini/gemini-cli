/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import OpenAI from 'openai';

type ChatCompletionMessageParam =
  OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool;
type ChatCompletionToolMessageParam =
  OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
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
 * OpenAI provider implementation
 */
export class OpenAIProvider extends BaseProvider {
  readonly id = 'openai' as const;
  readonly name = 'OpenAI';
  readonly models = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'o1',
    'o1-mini',
    'o1-preview',
  ];
  readonly defaultModel = 'gpt-4o';

  private client: OpenAI | null = null;

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new ProviderAuthError(
        this.id,
        'OpenAI API key is required. Set OPENAI_API_KEY or provide apiKey in config.',
      );
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async validateCredentials(): Promise<boolean> {
    this.ensureInitialized();
    try {
      // Try a minimal API call to validate credentials
      await this.client!.chat.completions.create({
        model: this.getCurrentModel(),
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return true;
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) {
        return false;
      }
      throw error;
    }
  }

  async getAvailableModels(): Promise<ProviderModelInfo[]> {
    // Return static list of commonly used models
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description:
          'Most capable GPT-4 model with vision, optimized for speed',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Fast and affordable GPT-4 class model',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        description: 'GPT-4 Turbo with vision capabilities',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        description: 'Original GPT-4 model',
        contextWindow: 8192,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Fast and cost-effective model',
        contextWindow: 16385,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: 'o1',
        name: 'o1',
        description: 'Advanced reasoning model',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'o1-mini',
        name: 'o1 Mini',
        description: 'Efficient reasoning model',
        contextWindow: 128000,
        maxOutputTokens: 65536,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'o1-preview',
        name: 'o1 Preview',
        description: 'Preview of o1 reasoning model',
        contextWindow: 128000,
        maxOutputTokens: 32768,
        supportsTools: false,
        supportsVision: false,
      },
    ];
  }

  getInfo(): ProviderInfo {
    return {
      id: this.id,
      name: this.name,
      description:
        "OpenAI's GPT family of models including GPT-4o and reasoning models",
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
        id: 'gpt-4o',
        name: 'GPT-4o',
        description:
          'Most capable GPT-4 model with vision, optimized for speed',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Fast and affordable GPT-4 class model',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        description: 'GPT-4 Turbo with vision capabilities',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        description: 'Original GPT-4 model',
        contextWindow: 8192,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Fast and cost-effective model',
        contextWindow: 16385,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: 'o1',
        name: 'o1',
        description: 'Advanced reasoning model',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'o1-mini',
        name: 'o1 Mini',
        description: 'Efficient reasoning model',
        contextWindow: 128000,
        maxOutputTokens: 65536,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'o1-preview',
        name: 'o1 Preview',
        description: 'Preview of o1 reasoning model',
        contextWindow: 128000,
        maxOutputTokens: 32768,
        supportsTools: false,
        supportsVision: false,
      },
    ];
  }

  async generateContent(request: ProviderRequest): Promise<ProviderResponse> {
    this.ensureInitialized();

    const model = this.getCurrentModel(request.model);

    try {
      const response = await this.client!.chat.completions.create({
        model,
        max_tokens: request.maxTokens,
        messages: this.convertMessages(request.messages, request.systemPrompt),
        temperature: request.temperature,
        top_p: request.topP,
        stop: request.stopSequences,
        tools: request.tools ? this.convertTools(request.tools) : undefined,
      });

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

    try {
      const stream = await this.client!.chat.completions.create({
        model,
        max_tokens: request.maxTokens,
        messages: this.convertMessages(request.messages, request.systemPrompt),
        temperature: request.temperature,
        top_p: request.topP,
        stop: request.stopSequences,
        tools: request.tools ? this.convertTools(request.tools) : undefined,
        stream: true,
      });

      let accumulatedText = '';
      const toolCallsBuilder: Map<
        number,
        { id: string; name: string; arguments: string }
      > = new Map();
      let finishReason: ProviderFinishReason = 'unknown';

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Handle text content
        if (delta.content) {
          accumulatedText += delta.content;
          yield {
            delta: delta.content,
            text: accumulatedText,
            isFinal: false,
          };
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;
            if (!toolCallsBuilder.has(index)) {
              toolCallsBuilder.set(index, {
                id: toolCallDelta.id || '',
                name: toolCallDelta.function?.name || '',
                arguments: '',
              });
            }
            const builder = toolCallsBuilder.get(index)!;
            if (toolCallDelta.id) builder.id = toolCallDelta.id;
            if (toolCallDelta.function?.name)
              builder.name = toolCallDelta.function.name;
            if (toolCallDelta.function?.arguments)
              builder.arguments += toolCallDelta.function.arguments;
          }
        }

        // Handle finish reason
        if (choice.finish_reason) {
          finishReason = this.convertFinishReason(choice.finish_reason);
        }
      }

      // Build final tool calls
      const toolCalls: ProviderToolCall[] = [];
      for (const builder of toolCallsBuilder.values()) {
        try {
          toolCalls.push({
            id: builder.id,
            name: builder.name,
            arguments: JSON.parse(builder.arguments || '{}'),
          });
        } catch {
          // Invalid JSON, skip this tool call
        }
      }

      yield {
        text: accumulatedText,
        isFinal: true,
        finishReason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async countTokens(content: string, _model?: string): Promise<number> {
    // OpenAI doesn't have a token counting API
    // Use rough approximation: ~4 characters per token for English
    return Math.ceil(content.length / 4);
  }

  /**
   * Convert provider-agnostic messages to OpenAI format
   */
  private convertMessages(
    messages: ProviderMessage[],
    systemPrompt?: string,
  ): ChatCompletionMessageParam[] {
    const result: ChatCompletionMessageParam[] = [];

    // Add system message if provided
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        // System messages already handled
        result.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'user') {
        // Handle user messages with tool results
        if (msg.toolResults && msg.toolResults.length > 0) {
          // First add any pending text
          if (msg.content) {
            result.push({ role: 'user', content: msg.content });
          }

          // Add tool results as separate messages
          for (const toolResult of msg.toolResults) {
            result.push({
              role: 'tool',
              tool_call_id: toolResult.toolCallId,
              content: toolResult.content,
            } as ChatCompletionToolMessageParam);
          }
        } else {
          result.push({ role: 'user', content: msg.content });
        }
      } else if (msg.role === 'assistant') {
        // Handle assistant messages with tool calls
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          result.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          });
        } else {
          result.push({ role: 'assistant', content: msg.content });
        }
      }
    }

    return result;
  }

  /**
   * Convert provider-agnostic tools to OpenAI format
   */
  private convertTools(tools: ProviderTool[]): ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Convert OpenAI finish reason to provider finish reason
   */
  private convertFinishReason(
    finishReason: string | null,
  ): ProviderFinishReason {
    switch (finishReason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_use';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'unknown';
    }
  }

  /**
   * Convert OpenAI response to provider-agnostic format
   */
  private convertResponse(
    response: OpenAI.Chat.Completions.ChatCompletion,
    model: string,
  ): ProviderResponse {
    const choice = response.choices[0];
    const message = choice?.message;

    // Extract text content
    const text = message?.content || '';

    // Extract tool calls
    const toolCalls: ProviderToolCall[] = [];
    if (message?.tool_calls) {
      for (const toolCall of message.tool_calls) {
        try {
          toolCalls.push({
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments || '{}'),
          });
        } catch {
          // Invalid JSON, skip this tool call
        }
      }
    }

    // Extract usage
    let usage: ProviderUsage | undefined;
    if (response.usage) {
      usage = {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      };
    }

    return {
      content: text,
      model,
      usage,
      finishReason: this.convertFinishReason(choice?.finish_reason || null),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      raw: response,
    };
  }

  /**
   * Handle and convert OpenAI errors to provider errors
   */
  private handleError(error: unknown): ProviderError {
    if (error instanceof OpenAI.AuthenticationError) {
      return new ProviderAuthError(this.id, error.message);
    }

    if (error instanceof OpenAI.RateLimitError) {
      const retryAfter = error.headers?.['retry-after'];
      return new ProviderRateLimitError(
        this.id,
        retryAfter ? parseInt(retryAfter, 10) : undefined,
      );
    }

    if (error instanceof OpenAI.NotFoundError) {
      return new ProviderError(
        `OpenAI API error: ${error.message}`,
        this.id,
        'NOT_FOUND',
        404,
        false,
      );
    }

    if (error instanceof OpenAI.APIError) {
      return new ProviderError(
        `OpenAI API error: ${error.message}`,
        this.id,
        'API_ERROR',
        error.status,
        error.status === 500 || error.status === 503,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return new ProviderError(
      `OpenAI error: ${message}`,
      this.id,
      'UNKNOWN_ERROR',
    );
  }
}
