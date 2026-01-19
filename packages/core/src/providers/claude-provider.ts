/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import Anthropic from '@anthropic-ai/sdk';

type MessageParam = Anthropic.Messages.MessageParam;
type ContentBlock = Anthropic.Messages.ContentBlock;
type Tool = Anthropic.Messages.Tool;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;
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
 * Claude provider implementation using Anthropic's SDK
 */
export class ClaudeProvider extends BaseProvider {
  readonly id = 'claude' as const;
  readonly name = 'Anthropic Claude';
  readonly models = [
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307',
  ];
  readonly defaultModel = 'claude-sonnet-4-20250514';

  private client: Anthropic | null = null;

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    if (!config.apiKey) {
      throw new ProviderAuthError(
        this.id,
        'Claude API key is required. Set ANTHROPIC_API_KEY or provide apiKey in config.',
      );
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async validateCredentials(): Promise<boolean> {
    this.ensureInitialized();
    try {
      // Try a minimal API call to validate credentials
      await this.client!.messages.create({
        model: this.getCurrentModel(),
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return true;
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        return false;
      }
      throw error;
    }
  }

  async getAvailableModels(): Promise<ProviderModelInfo[]> {
    // Return static list - Anthropic API doesn't have a models list endpoint
    return [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        description:
          'Latest Claude Sonnet - excellent balance of capability and speed',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        description: 'Most capable Claude model for complex tasks',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Claude 3.5 Sonnet - fast and capable',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        description: 'Fast and efficient Claude 3.5 model',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        description: 'Most capable Claude 3 model',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        description: 'Fast and efficient Claude 3 model',
        contextWindow: 200000,
        maxOutputTokens: 4096,
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
        "Anthropic's Claude family of AI assistants known for helpfulness and safety",
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
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        description:
          'Latest Claude Sonnet - excellent balance of capability and speed',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        description: 'Most capable Claude model for complex tasks',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Claude 3.5 Sonnet - fast and capable',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        description: 'Fast and efficient Claude 3.5 model',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        description: 'Most capable Claude 3 model',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        description: 'Fast and efficient Claude 3 model',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsTools: true,
        supportsVision: true,
      },
    ];
  }

  async generateContent(request: ProviderRequest): Promise<ProviderResponse> {
    this.ensureInitialized();

    const model = this.getCurrentModel(request.model);

    try {
      const response = await this.client!.messages.create({
        model,
        max_tokens: request.maxTokens || 8192,
        system: request.systemPrompt,
        messages: this.convertMessages(request.messages),
        temperature: request.temperature,
        top_p: request.topP,
        top_k: request.topK,
        stop_sequences: request.stopSequences,
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
      const stream = this.client!.messages.stream({
        model,
        max_tokens: request.maxTokens || 8192,
        system: request.systemPrompt,
        messages: this.convertMessages(request.messages),
        temperature: request.temperature,
        top_p: request.topP,
        top_k: request.topK,
        stop_sequences: request.stopSequences,
        tools: request.tools ? this.convertTools(request.tools) : undefined,
      });

      let accumulatedText = '';

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const delta = event.delta.text;
          accumulatedText += delta;

          yield {
            delta,
            text: accumulatedText,
            isFinal: false,
          };
        }
      }

      // Get final message for complete data
      const finalMessage = await stream.finalMessage();
      const toolCalls = this.extractToolCalls(finalMessage.content);

      yield {
        text: accumulatedText,
        isFinal: true,
        finishReason: this.convertStopReason(finalMessage.stop_reason),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async countTokens(content: string, model?: string): Promise<number> {
    this.ensureInitialized();

    const resolvedModel = this.getCurrentModel(model);

    try {
      const response = await this.client!.messages.countTokens({
        model: resolvedModel,
        messages: [{ role: 'user', content }],
      });
      return response.input_tokens;
    } catch {
      // Fallback to rough estimate if API doesn't support token counting
      // Approximate 4 characters per token for English text
      return Math.ceil(content.length / 4);
    }
  }

  /**
   * Convert provider-agnostic messages to Claude format
   */
  private convertMessages(messages: ProviderMessage[]): MessageParam[] {
    const result: MessageParam[] = [];

    for (const msg of messages) {
      // Skip system messages - handled separately
      if (msg.role === 'system') continue;

      if (msg.role === 'user') {
        // Handle user messages with potential tool results
        if (msg.toolResults && msg.toolResults.length > 0) {
          const content: Array<
            { type: 'text'; text: string } | ToolResultBlockParam
          > = [];

          // Add text if present
          if (msg.content) {
            content.push({ type: 'text', text: msg.content });
          }

          // Add tool results
          for (const result of msg.toolResults) {
            content.push({
              type: 'tool_result',
              tool_use_id: result.toolCallId,
              content: result.content,
              is_error: result.isError,
            });
          }

          result.push({ role: 'user', content });
        } else {
          result.push({ role: 'user', content: msg.content });
        }
      } else if (msg.role === 'assistant') {
        // Handle assistant messages with potential tool calls
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const content: ContentBlock[] = [];

          // Add text if present
          if (msg.content) {
            content.push({ type: 'text', text: msg.content, citations: null });
          }

          // Add tool uses
          for (const toolCall of msg.toolCalls) {
            content.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.arguments,
            });
          }

          result.push({ role: 'assistant', content });
        } else {
          result.push({ role: 'assistant', content: msg.content });
        }
      }
    }

    return result;
  }

  /**
   * Convert provider-agnostic tools to Claude format
   */
  private convertTools(tools: ProviderTool[]): Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    }));
  }

  /**
   * Extract tool calls from Claude response content
   */
  private extractToolCalls(content: ContentBlock[]): ProviderToolCall[] {
    const toolCalls: ProviderToolCall[] = [];

    for (const block of content) {
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    return toolCalls;
  }

  /**
   * Convert Claude stop reason to provider finish reason
   */
  private convertStopReason(stopReason: string | null): ProviderFinishReason {
    switch (stopReason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_use';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'unknown';
    }
  }

  /**
   * Convert Claude response to provider-agnostic format
   */
  private convertResponse(
    response: Anthropic.Message,
    model: string,
  ): ProviderResponse {
    // Extract text content
    let text = '';
    const toolCalls: ProviderToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    const usage: ProviderUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cachedTokens: (response.usage as { cache_read_input_tokens?: number })
        .cache_read_input_tokens,
    };

    return {
      content: text,
      model,
      usage,
      finishReason: this.convertStopReason(response.stop_reason),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      raw: response,
    };
  }

  /**
   * Handle and convert Claude errors to provider errors
   */
  private handleError(error: unknown): ProviderError {
    if (error instanceof Anthropic.AuthenticationError) {
      return new ProviderAuthError(this.id, error.message);
    }

    if (error instanceof Anthropic.RateLimitError) {
      const retryAfter = error.headers?.get?.('retry-after');
      return new ProviderRateLimitError(
        this.id,
        retryAfter ? parseInt(retryAfter, 10) : undefined,
      );
    }

    if (error instanceof Anthropic.NotFoundError) {
      return new ProviderError(
        `Claude API error: ${error.message}`,
        this.id,
        'NOT_FOUND',
        404,
        false,
      );
    }

    if (error instanceof Anthropic.APIError) {
      return new ProviderError(
        `Claude API error: ${error.message}`,
        this.id,
        'API_ERROR',
        error.status,
        error.status === 500 || error.status === 503,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return new ProviderError(
      `Claude error: ${message}`,
      this.id,
      'UNKNOWN_ERROR',
    );
  }
}
