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
  ModelProviderConfig
} from './types.js';
import { BaseModelProvider } from './BaseModelProvider.js';

interface LMStudioMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LMStudioResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
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

interface LMStudioStreamChunk {
  choices: Array<{
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
}

interface LMStudioModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export class LMStudioProvider extends BaseModelProvider {
  private baseUrl: string;

  constructor(config: ModelProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl || 'http://127.0.0.1:1234/v1';
  }

  async initialize(): Promise<void> {
    await this.testConnection();
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
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
        error: isConnected ? undefined : 'LM Studio server not running or unreachable'
      };
    } catch (error) {
      return {
        status: 'error',
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error connecting to LM Studio'
      };
    }
  }

  async sendMessage(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): Promise<UniversalResponse> {
    const lmStudioMessages = this.convertToLMStudioMessages(messages);
    
    const requestBody = {
      model: this.config.model,
      messages: lmStudioMessages,
      max_tokens: 2048,
      temperature: 0.7,
      stream: false
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      throw this.createError(`LM Studio API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as LMStudioResponse;
    return this.convertFromLMStudioResponse(data);
  }

  async *sendMessageStream(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): AsyncGenerator<UniversalStreamEvent> {
    const lmStudioMessages = this.convertToLMStudioMessages(messages);
    
    const requestBody = {
      model: this.config.model,
      messages: lmStudioMessages,
      max_tokens: 2048,
      temperature: 0.7,
      stream: true
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      yield {
        type: 'error',
        error: this.createError(`LM Studio API error: ${response.status} ${response.statusText}`)
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
                finishReason: 'stop',
                model: this.config.model
              }
            };
            return;
          }

          if (line.startsWith('data: ')) {
            try {
              const chunk = JSON.parse(line.slice(6)) as LMStudioStreamChunk;
              const delta = chunk.choices[0]?.delta;

              if (delta?.content) {
                fullContent += delta.content;
                yield {
                  type: 'content',
                  content: delta.content
                };
              }

              if (chunk.choices[0]?.finish_reason) {
                yield {
                  type: 'done',
                  response: {
                    content: fullContent,
                    finishReason: this.mapFinishReason(chunk.choices[0].finish_reason),
                    model: this.config.model
                  }
                };
                return;
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
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw this.createError(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json() as { data: LMStudioModel[] };
      return data.data.map(model => model.id).sort();
    } catch (error) {
      throw this.createError('Failed to get available models from LM Studio', error);
    }
  }

  protected getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalls: false,
      supportsSystemMessages: true,
      supportsImages: false,
      maxTokens: 4096,
      maxMessages: 100
    };
  }

  private convertToLMStudioMessages(messages: UniversalMessage[]): LMStudioMessage[] {
    return messages
      .filter(msg => msg.role !== 'tool')
      .map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      }));
  }

  private convertFromLMStudioResponse(response: LMStudioResponse): UniversalResponse {
    const choice = response.choices[0];
    
    return {
      content: choice.message.content || '',
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
      default: return 'stop';
    }
  }
}