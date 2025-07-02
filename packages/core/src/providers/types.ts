// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

/**
 * Represents a model available from a provider
 */
export interface Model {
  id: string;
  name: string;
  vendor: string;
  family: string;
  version?: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxRequestsPerMinute?: number;
}

/**
 * Chat message interface compatible with OpenAI format
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Request for chat completion
 */
export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/**
 * Response chunk for streaming
 */
export interface ChatResponseChunk {
  id?: string;
  choices: Array<{
    delta: {
      content?: string;
      role?: string;
    };
    index: number;
    finishReason?: string;
  }>;
  model: string;
  created?: number;
}

/**
 * Complete response for non-streaming
 */
export interface ChatResponse {
  id?: string;
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    index: number;
    finishReason?: string;
  }>;
  model: string;
  created?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  type: 'copilot' | 'gemini' | 'custom';
  [key: string]: any;
}

/**
 * Interface that all model providers must implement
 */
export interface IModelProvider {
  /**
   * Initialize the provider
   */
  initialize(config?: ProviderConfig): Promise<void>;

  /**
   * Get list of available models
   */
  listModels(): Promise<Model[]>;

  /**
   * Send a chat request (non-streaming)
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Send a streaming chat request
   */
  chatStream(request: ChatRequest): AsyncGenerator<ChatResponseChunk>;

  /**
   * Check if the provider is healthy and available
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get the provider name
   */
  getName(): string;

  /**
   * Clean up resources
   */
  dispose?(): Promise<void>;
}

/**
 * Provider factory configuration
 */
export interface ProviderFactoryConfig {
  defaultProvider: 'copilot' | 'gemini';
  fallbackProvider?: 'copilot' | 'gemini';
  copilot?: {
    bridgeUrl?: string;
    model?: string;
    timeout?: number;
  };
  gemini?: {
    apiKey?: string;
    model?: string;
    endpoint?: string;
  };
}