/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AIProvider,
  ProviderConfig,
  ProviderInfo,
  ProviderModelInfo,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamChunk,
  ProviderId,
} from './types.js';
import { ProviderError } from './types.js';

/**
 * Base class for AI providers with common functionality
 */
export abstract class BaseProvider implements AIProvider {
  abstract readonly id: ProviderId;
  abstract readonly name: string;
  abstract readonly models: string[];
  abstract readonly defaultModel: string;

  protected config: ProviderConfig | null = null;
  protected _initialized: boolean = false;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    await this.doInitialize(config);
    this._initialized = true;
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  protected abstract doInitialize(config: ProviderConfig): Promise<void>;

  abstract validateCredentials(): Promise<boolean>;
  abstract getAvailableModels(): Promise<ProviderModelInfo[]>;
  abstract getInfo(): ProviderInfo;
  abstract generateContent(request: ProviderRequest): Promise<ProviderResponse>;
  abstract generateContentStream(
    request: ProviderRequest,
  ): AsyncGenerator<ProviderStreamChunk>;
  abstract countTokens(content: string, model?: string): Promise<number>;

  /**
   * Get the current model, falling back to default if not specified
   */
  protected getCurrentModel(requestModel?: string): string {
    return requestModel || this.config?.model || this.defaultModel;
  }

  /**
   * Ensure the provider is initialized before operations
   */
  protected ensureInitialized(): void {
    if (!this._initialized || !this.config) {
      throw new ProviderError(
        `Provider ${this.id} is not initialized. Call initialize() first.`,
        this.id,
        'NOT_INITIALIZED',
      );
    }
  }

  /**
   * Validate that a model is supported
   */
  protected validateModel(model: string): void {
    // Allow any model string - providers will validate server-side
    // This enables using models not in our static list
    if (!model || model.trim() === '') {
      throw new ProviderError(
        `Invalid model: model cannot be empty`,
        this.id,
        'INVALID_MODEL',
      );
    }
  }

  /**
   * Create a standardized error response
   */
  protected createError(
    message: string,
    code?: string,
    statusCode?: number,
    isRetryable: boolean = false,
  ): ProviderError {
    return new ProviderError(message, this.id, code, statusCode, isRetryable);
  }
}
