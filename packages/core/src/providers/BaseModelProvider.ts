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
  ProviderCapabilities,
  ConnectionStatus,
  ToolCall
} from './types.js';
import { ModelProviderType } from './types.js';

export abstract class BaseModelProvider {
  protected config: ModelProviderConfig;
  protected capabilities: ProviderCapabilities;

  constructor(config: ModelProviderConfig) {
    this.config = config;
    this.capabilities = this.getCapabilities();
  }

  abstract initialize(): Promise<void>;

  abstract testConnection(): Promise<boolean>;

  abstract getConnectionStatus(): Promise<ConnectionStatus>;

  abstract sendMessage(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): Promise<UniversalResponse>;

  abstract sendMessageStream(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): AsyncGenerator<UniversalStreamEvent>;

  abstract getAvailableModels(): Promise<string[]>;

  protected abstract getCapabilities(): ProviderCapabilities;

  getProviderType(): ModelProviderType {
    return this.config.type;
  }

  getModel(): string {
    return this.config.model;
  }

  getConfig(): ModelProviderConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<ModelProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getCapabilityInfo(): ProviderCapabilities {
    return { ...this.capabilities };
  }

  protected validateConfig(): void {
    if (!this.config.model) {
      throw new Error('Model is required in configuration');
    }
    if (this.config.type === ModelProviderType.OPENAI && !this.config.apiKey) {
      throw new Error('API key is required for OpenAI provider');
    }
  }

  protected createError(message: string, originalError?: unknown): Error {
    const errorMessage = originalError 
      ? `${message}: ${originalError instanceof Error ? originalError.message : String(originalError)}`
      : message;
    return new Error(errorMessage);
  }

  protected mapToolCalls(toolCalls: ToolCall[]): ToolCall[] {
    return toolCalls.map(tc => ({
      id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: tc.name,
      arguments: tc.arguments
    }));
  }

  protected calculateTokenEstimate(messages: UniversalMessage[]): number {
    return messages.reduce((total, message) => {
      const contentLength = message.content.length;
      return total + Math.ceil(contentLength / 4);
    }, 0);
  }
}