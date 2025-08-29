/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ModelProviderConfig,
  UniversalMessage,
  UniversalResponse,
  UniversalStreamEvent,
  ConnectionStatus
} from './types.js';
import { ModelProviderType } from './types.js';
import type { BaseModelProvider } from './BaseModelProvider.js';
import { ModelProviderFactory } from './ModelProviderFactory.js';
import type { GeminiClient } from '../core/client.js';
import type { PartListUnion, Content } from '@google/genai';
import type { ServerGeminiStreamEvent } from '../core/turn.js';
import { GeminiEventType } from '../core/turn.js';

export class UniversalModelClient {
  private currentProvider: BaseModelProvider | null = null;
  private geminiClient: GeminiClient | null = null;

  constructor(
    private config: ModelProviderConfig,
    geminiClient?: GeminiClient
  ) {
    this.geminiClient = geminiClient || null;
  }

  async initialize(): Promise<void> {
    if (this.config.type === ModelProviderType.GEMINI) {
      if (!this.geminiClient) {
        throw new Error('GeminiClient instance required for Gemini provider');
      }
      return;
    }

    this.currentProvider = await ModelProviderFactory.createAndInitialize(this.config);
  }

  async switchProvider(config: ModelProviderConfig): Promise<void> {
    this.config = config;
    
    if (config.type === ModelProviderType.GEMINI) {
      if (!this.geminiClient) {
        throw new Error('GeminiClient instance required for Gemini provider');
      }
      this.currentProvider = null;
      return;
    }

    this.currentProvider = await ModelProviderFactory.createAndInitialize(config);
  }

  async sendMessage(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): Promise<UniversalResponse> {
    if (this.config.type === ModelProviderType.GEMINI) {
      return this.sendGeminiMessage(messages, signal);
    }

    if (!this.currentProvider) {
      throw new Error('Provider not initialized');
    }

    return this.currentProvider.sendMessage(messages, signal);
  }

  async *sendMessageStream(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): AsyncGenerator<UniversalStreamEvent> {
    if (this.config.type === ModelProviderType.GEMINI) {
      yield* this.sendGeminiMessageStream(messages, signal);
      return;
    }

    if (!this.currentProvider) {
      throw new Error('Provider not initialized');
    }

    yield* this.currentProvider.sendMessageStream(messages, signal);
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    if (this.config.type === ModelProviderType.GEMINI) {
      return {
        status: 'connected',
        lastChecked: new Date()
      };
    }

    if (!this.currentProvider) {
      return {
        status: 'error',
        lastChecked: new Date(),
        error: 'Provider not initialized'
      };
    }

    return this.currentProvider.getConnectionStatus();
  }

  async getAvailableModels(): Promise<string[]> {
    if (this.config.type === ModelProviderType.GEMINI) {
      return ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro'];
    }

    if (!this.currentProvider) {
      throw new Error('Provider not initialized');
    }

    return this.currentProvider.getAvailableModels();
  }

  getConfig(): ModelProviderConfig {
    return { ...this.config };
  }

  private async sendGeminiMessage(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): Promise<UniversalResponse> {
    if (!this.geminiClient) {
      throw new Error('GeminiClient not available');
    }

    throw new Error('Direct Gemini message sending not yet implemented - use existing GeminiClient.sendMessageStream');
  }

  private async *sendGeminiMessageStream(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): AsyncGenerator<UniversalStreamEvent> {
    if (!this.geminiClient) {
      throw new Error('GeminiClient not available');
    }

    const geminiContent = this.convertToGeminiContent(messages);
    
    try {
      const stream = this.geminiClient.sendMessageStream(geminiContent, signal, `universal_${Date.now()}`);
      
      let fullContent = '';
      
      for await (const event of stream) {
        const universalEvent = this.convertGeminiEventToUniversal(event);
        
        if (universalEvent.type === 'content' && universalEvent.content) {
          fullContent += universalEvent.content;
        }
        
        yield universalEvent;
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error : new Error('Unknown Gemini error')
      };
    }
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
            model: this.config?.model || 'gemini'
          }
        };
      case GeminiEventType.Error:
        return {
          type: 'error',
          error: new Error(event.value?.error?.message || 'Gemini stream error')
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
}