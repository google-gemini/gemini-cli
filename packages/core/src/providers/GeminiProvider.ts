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
import type { GeminiClient } from '../core/client.js';
import type { PartListUnion, Content } from '@google/genai';
import type { ServerGeminiStreamEvent } from '../core/turn.js';
import { GeminiEventType } from '../core/turn.js';

export class GeminiProvider extends BaseModelProvider {
  private geminiClient: GeminiClient;

  constructor(config: ModelProviderConfig, geminiClient: GeminiClient) {
    super(config);
    this.geminiClient = geminiClient;
  }

  async initialize(): Promise<void> {
    // GeminiClient is already initialized
    return Promise.resolve();
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test with a minimal message
      const testMessages: UniversalMessage[] = [
        { role: 'user', content: 'test' }
      ];
      const signal = new AbortController().signal;
      await this.sendMessage(testMessages, signal);
      return true;
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
        error: isConnected ? undefined : 'Failed to connect to Gemini API'
      };
    } catch (error) {
      return {
        status: 'error',
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown Gemini error'
      };
    }
  }

  async sendMessage(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): Promise<UniversalResponse> {
    const geminiContent = this.convertToGeminiContent(messages);
    const promptId = `provider_${Date.now()}`;

    let fullContent = '';
    let finishReason: UniversalResponse['finishReason'] = 'stop';

    try {
      const stream = this.geminiClient.sendMessageStream(geminiContent, signal, promptId);
      
      for await (const event of stream) {
        if (event.type === GeminiEventType.Content) {
          fullContent += event.value;
        } else if (event.type === GeminiEventType.Error) {
          throw new Error(event.value?.error?.message || 'Gemini stream error');
        }
      }
      
      return {
        content: fullContent,
        finishReason,
        model: this.config.model
      };
    } catch (error) {
      throw this.createError('Failed to send message to Gemini', error);
    }
  }

  async *sendMessageStream(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): AsyncGenerator<UniversalStreamEvent> {
    const geminiContent = this.convertToGeminiContent(messages);
    const promptId = `provider_stream_${Date.now()}`;

    try {
      const stream = this.geminiClient.sendMessageStream(geminiContent, signal, promptId);
      let fullContent = '';
      
      for await (const event of stream) {
        const universalEvent = this.convertGeminiEventToUniversal(event);
        
        if (universalEvent.type === 'content' && universalEvent.content) {
          fullContent += universalEvent.content;
        }
        
        yield universalEvent;
        
        if (universalEvent.type === 'done') {
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
      }
    } catch (error) {
      yield {
        type: 'error',
        error: this.createError('Gemini stream error', error)
      };
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return [
      'gemini-2.5-flash',
      'gemini-2.0-flash-exp', 
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ];
  }

  protected getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsSystemMessages: true,
      supportsImages: true,
      maxTokens: this.getMaxTokensForModel(),
      maxMessages: 1000
    };
  }

  private convertToGeminiContent(messages: UniversalMessage[]): PartListUnion {
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    let systemPrompt = '';
    if (systemMessages.length > 0) {
      systemPrompt = systemMessages.map(m => m.content).join('\n\n');
    }

    const geminiContent: Content[] = conversationMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    if (systemPrompt && geminiContent.length > 0 && geminiContent[0].role === 'user') {
      geminiContent[0].parts = [
        { text: systemPrompt + '\n\n' + (geminiContent[0].parts?.[0]?.text || '') }
      ];
    }

    return geminiContent as PartListUnion;
  }

  private convertGeminiEventToUniversal(event: ServerGeminiStreamEvent): UniversalStreamEvent {
    switch (event.type) {
      case GeminiEventType.Content:
        return {
          type: 'content',
          content: event.value
        };
      case GeminiEventType.Finished:
        return {
          type: 'done',
          response: {
            content: '',
            finishReason: this.convertFinishReason(event.value),
            model: this.config.model
          }
        };
      case GeminiEventType.Error:
        return {
          type: 'error',
          error: new Error(event.value?.error?.message || 'Gemini stream error')
        };
      case GeminiEventType.ToolCallRequest:
        return {
          type: 'tool_call',
          toolCall: {
            id: `gemini_call_${Date.now()}`,
            name: event.value?.name || 'unknown',
            arguments: event.value?.args || {}
          }
        };
      default:
        return {
          type: 'content',
          content: ''
        };
    }
  }

  private convertFinishReason(reason?: import('@google/genai').FinishReason): 'stop' | 'length' | 'tool_calls' | 'content_filter' {
    if (!reason) return 'stop';
    
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      case 'RECITATION':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  private getMaxTokensForModel(): number {
    const model = this.config.model.toLowerCase();
    
    if (model.includes('2.5')) return 1048576;
    if (model.includes('1.5-pro')) return 2097152;
    if (model.includes('1.5-flash')) return 1048576;
    
    return 32768;
  }
}