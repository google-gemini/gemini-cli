/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phoenix CLI Multi-Provider System Types
 *
 * This module defines the core interfaces for the provider abstraction layer,
 * enabling Phoenix CLI to work with multiple AI providers (Gemini, Claude, OpenAI, Ollama).
 */

/**
 * Supported AI provider identifiers
 */
export type ProviderId = 'gemini' | 'claude' | 'openai' | 'ollama';

/**
 * Message role in a conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * A message in a conversation
 */
export interface ProviderMessage {
  role: MessageRole;
  content: string;
  /** Optional name for the participant */
  name?: string;
  /** Tool calls made by the assistant */
  toolCalls?: ProviderToolCall[];
  /** Results from tool executions */
  toolResults?: ProviderToolResult[];
}

/**
 * A tool call requested by the model
 */
export interface ProviderToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Result from executing a tool
 */
export interface ProviderToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

/**
 * Tool definition for function calling
 */
export interface ProviderTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Configuration for initializing a provider
 */
export interface ProviderConfig {
  /** API key for authentication (not needed for Ollama) */
  apiKey?: string;
  /** Base URL for API requests (useful for Ollama or custom endpoints) */
  baseUrl?: string;
  /** Model to use */
  model: string;
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * Request to generate content from a provider
 */
export interface ProviderRequest {
  /** Conversation messages */
  messages: ProviderMessage[];
  /** Model to use (can override provider default) */
  model?: string;
  /** Temperature for response randomness (0-2) */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Available tools for the model to use */
  tools?: ProviderTool[];
  /** System prompt/instructions */
  systemPrompt?: string;
  /** Stop sequences to end generation */
  stopSequences?: string[];
  /** Top-p nucleus sampling */
  topP?: number;
  /** Top-k sampling */
  topK?: number;
  /** Thinking/reasoning mode budget (for supported models) */
  thinkingBudget?: number;
}

/**
 * Response from content generation
 */
export interface ProviderResponse {
  /** Generated text content */
  content: string;
  /** Model that generated the response */
  model: string;
  /** Token usage statistics */
  usage?: ProviderUsage;
  /** Reason generation stopped */
  finishReason?: ProviderFinishReason;
  /** Tool calls requested by the model */
  toolCalls?: ProviderToolCall[];
  /** Raw response from the provider (for debugging) */
  raw?: unknown;
}

/**
 * Token usage information
 */
export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  /** Cached tokens (if provider supports caching) */
  cachedTokens?: number;
}

/**
 * Reason content generation finished
 */
export type ProviderFinishReason =
  | 'stop'
  | 'length'
  | 'tool_use'
  | 'content_filter'
  | 'error'
  | 'unknown';

/**
 * Streaming chunk from content generation
 */
export interface ProviderStreamChunk {
  /** Text delta */
  delta?: string;
  /** Full accumulated text so far */
  text?: string;
  /** Whether this is the final chunk */
  isFinal: boolean;
  /** Tool calls (populated on final chunk if applicable) */
  toolCalls?: ProviderToolCall[];
  /** Finish reason (populated on final chunk) */
  finishReason?: ProviderFinishReason;
  /** Usage (populated on final chunk if available) */
  usage?: ProviderUsage;
}

/**
 * Information about a provider
 */
export interface ProviderInfo {
  id: ProviderId;
  name: string;
  description: string;
  models: ProviderModelInfo[];
  defaultModel: string;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  requiresApiKey: boolean;
}

/**
 * Information about a specific model
 */
export interface ProviderModelInfo {
  id: string;
  name: string;
  description?: string;
  contextWindow: number;
  maxOutputTokens?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
}

/**
 * The main interface that all AI providers must implement
 */
export interface AIProvider {
  /** Unique identifier for this provider */
  readonly id: ProviderId;
  /** Human-readable name */
  readonly name: string;
  /** List of supported model IDs */
  readonly models: string[];
  /** Default model to use */
  readonly defaultModel: string;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Check if the provider is ready to use
   */
  isInitialized(): boolean;

  /**
   * Validate that credentials are working
   */
  validateCredentials(): Promise<boolean>;

  /**
   * Get list of available models from the provider
   */
  getAvailableModels(): Promise<ProviderModelInfo[]>;

  /**
   * Get detailed information about this provider
   */
  getInfo(): ProviderInfo;

  /**
   * Generate content (non-streaming)
   */
  generateContent(request: ProviderRequest): Promise<ProviderResponse>;

  /**
   * Generate content with streaming
   */
  generateContentStream(
    request: ProviderRequest,
  ): AsyncGenerator<ProviderStreamChunk>;

  /**
   * Count tokens in content
   */
  countTokens(content: string, model?: string): Promise<number>;

  /**
   * Generate embeddings for content (if supported)
   */
  embedContent?(content: string, model?: string): Promise<number[]>;
}

/**
 * Error thrown by providers
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: ProviderId,
    readonly code?: string,
    readonly statusCode?: number,
    readonly isRetryable: boolean = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * Error for authentication issues
 */
export class ProviderAuthError extends ProviderError {
  constructor(providerId: ProviderId, message?: string) {
    super(
      message || `Authentication failed for ${providerId}`,
      providerId,
      'AUTH_ERROR',
      401,
      false,
    );
    this.name = 'ProviderAuthError';
  }
}

/**
 * Error for rate limiting
 */
export class ProviderRateLimitError extends ProviderError {
  constructor(
    providerId: ProviderId,
    readonly retryAfter?: number,
  ) {
    super(
      `Rate limit exceeded for ${providerId}${retryAfter ? `. Retry after ${retryAfter}s` : ''}`,
      providerId,
      'RATE_LIMIT',
      429,
      true,
    );
    this.name = 'ProviderRateLimitError';
  }
}

/**
 * Error for model not found
 */
export class ProviderModelNotFoundError extends ProviderError {
  constructor(providerId: ProviderId, model: string) {
    super(
      `Model "${model}" not found for provider ${providerId}`,
      providerId,
      'MODEL_NOT_FOUND',
      404,
      false,
    );
    this.name = 'ProviderModelNotFoundError';
  }
}
