/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  UniversalMessage,
  UniversalResponse,
  UniversalStreamEvent,
  ProviderCapabilities,
  ConnectionStatus,
  ModelProviderConfig,
  ToolCall
} from './types.js';
import { BaseModelProvider } from './BaseModelProvider.js';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

interface OpenAIStreamChunk {
  choices: Array<{
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
}

export class OpenAIProvider extends BaseModelProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ModelProviderConfig) {
    super(config);
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.validateConfig();
  }

  async initialize(): Promise<void> {
    await this.testConnection();
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders()
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    const startTime = Date.now();
    try {
      const isConnected = await this.testConnection();
      const latency = Date.now() - startTime;
      
      return {
        status: isConnected ? 'connected' : 'error',
        lastChecked: new Date(),
        latency: isConnected ? latency : undefined,
        error: isConnected ? undefined : 'Failed to connect to OpenAI API'
      };
    } catch (error) {
      return {
        status: 'error',
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async sendMessage(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): Promise<UniversalResponse> {
    const openaiMessages = this.convertToOpenAIMessages(messages);
    
    const requestBody = {
      model: this.config.model,
      messages: openaiMessages,
      max_tokens: 4096,
      temperature: 0.7
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      throw this.createError(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as OpenAIResponse;
    return this.convertFromOpenAIResponse(data);
  }

  async *sendMessageStream(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): AsyncGenerator<UniversalStreamEvent> {
    const openaiMessages = this.convertToOpenAIMessages(messages);
    
    const requestBody = {
      model: this.config.model,
      messages: openaiMessages,
      max_tokens: 4096,
      temperature: 0.7,
      stream: true
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      yield {
        type: 'error',
        error: this.createError(`OpenAI API error: ${response.status} ${response.statusText}`)
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield {
        type: 'error',
        error: this.createError('No response body available')
      };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let toolCalls: ToolCall[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.trim() === 'data: [DONE]') {
            yield {
              type: 'done',
              response: {
                content: fullContent,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                finishReason: 'stop',
                model: this.config.model
              }
            };
            return;
          }

          if (line.startsWith('data: ')) {
            try {
              const chunk = JSON.parse(line.slice(6)) as OpenAIStreamChunk;
              const delta = chunk.choices[0]?.delta;

              if (delta?.content) {
                fullContent += delta.content;
                yield {
                  type: 'content',
                  content: delta.content
                };
              }

              if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  if (toolCall.function?.name && toolCall.function?.arguments) {
                    const universalToolCall: ToolCall = {
                      id: toolCall.id || `call_${Date.now()}`,
                      name: toolCall.function.name,
                      arguments: JSON.parse(toolCall.function.arguments)
                    };
                    toolCalls.push(universalToolCall);
                    yield {
                      type: 'tool_call',
                      toolCall: universalToolCall
                    };
                  }
                }
              }
            } catch (parseError) {
              continue;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw this.createError(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json() as { data: Array<{ id: string }> };
      return data.data
        .map(model => model.id)
        .filter(id => id.startsWith('gpt-') || id.startsWith('o1-'))
        .sort();
    } catch (error) {
      throw this.createError('Failed to get available models', error);
    }
  }

  protected getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsSystemMessages: true,
      supportsImages: this.config.model.includes('vision') || this.config.model.includes('o1'),
      maxTokens: this.getMaxTokensForModel(),
      maxMessages: 1000
    };
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  private convertToOpenAIMessages(messages: UniversalMessage[]): OpenAIMessage[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      tool_calls: msg.toolCalls?.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments)
        }
      })),
      tool_call_id: msg.toolCallId,
      name: msg.name
    }));
  }

  private convertFromOpenAIResponse(response: OpenAIResponse): UniversalResponse {
    const choice = response.choices[0];
    
    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments)
      })),
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined,
      model: response.model
    };
  }

  private mapFinishReason(reason: string): UniversalResponse['finishReason'] {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'tool_calls': return 'tool_calls';
      case 'content_filter': return 'content_filter';
      default: return 'stop';
    }
  }

  private getMaxTokensForModel(): number {
    const model = this.config.model.toLowerCase();
    
    if (model.includes('gpt-4')) {
      return model.includes('32k') ? 32768 : 
             model.includes('turbo') ? 4096 : 8192;
    }
    if (model.includes('gpt-3.5')) {
      return model.includes('16k') ? 16384 : 4096;
    }
    if (model.includes('o1')) {
      return 128000;
    }
    
    return 4096;
  }
}