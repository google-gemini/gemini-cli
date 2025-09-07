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
import type { ModelProviderType } from './types.js';
import type { Config } from '../config/config.js';
import type { FunctionDeclaration } from '@google/genai';

export abstract class BaseModelProvider {
  protected config: ModelProviderConfig;
  protected capabilities: ProviderCapabilities;
  protected toolDeclarations: FunctionDeclaration[] = [];
  protected configInstance?: Config;

  constructor(config: ModelProviderConfig, configInstance?: Config) {
    this.config = config;
    this.configInstance = configInstance;
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

  abstract countTokens(messages: UniversalMessage[]): Promise<{ totalTokens: number }>;

  abstract setTools(): void;

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
    // Note: API key validation is now handled by AuthManager, not here
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

  /**
   * Send message for compression purposes without tools to avoid unnecessary overhead
   * This is a specialized function for compression that bypasses tool system
   * Must be implemented by each provider to avoid tools being automatically added
   */
  abstract sendCompressionMessage(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): Promise<UniversalResponse>;
}