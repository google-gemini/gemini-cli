/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phoenix CLI Multi-Provider System
 *
 * This module provides a unified interface for working with multiple AI providers:
 * - Gemini (Google)
 * - Claude (Anthropic)
 * - OpenAI (GPT-4, etc.)
 * - Ollama (Local models)
 *
 * Usage:
 * ```typescript
 * import { getProviderManager, ProviderManager } from './providers/index.js';
 *
 * // Get the default manager
 * const manager = getProviderManager();
 *
 * // Initialize with API keys from environment
 * const apiKeys = ProviderManager.loadAllApiKeysFromEnv();
 * await manager.initializeDefault(apiKeys);
 *
 * // Or switch to a specific provider
 * await manager.switchProvider('claude', { apiKey: 'sk-ant-xxx' });
 *
 * // Generate content
 * const response = await manager.generateContent({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 *
 * // Stream content
 * for await (const chunk of manager.generateContentStream({ messages: [...] })) {
 *   console.log(chunk.delta);
 * }
 * ```
 */

// Types
export type {
  ProviderId,
  MessageRole,
  ProviderMessage,
  ProviderToolCall,
  ProviderToolResult,
  ProviderTool,
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  ProviderUsage,
  ProviderFinishReason,
  ProviderStreamChunk,
  ProviderInfo,
  ProviderModelInfo,
  AIProvider,
} from './types.js';

// Errors
export {
  ProviderError,
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderModelNotFoundError,
} from './types.js';

// Base class (for custom providers)
export { BaseProvider } from './base-provider.js';

// Provider implementations
export { GeminiProvider } from './gemini-provider.js';
export { ClaudeProvider } from './claude-provider.js';
export { OpenAIProvider } from './openai-provider.js';
export { OllamaProvider } from './ollama-provider.js';

// Provider manager
export type { ProviderManagerConfig } from './provider-manager.js';
export {
  ProviderManager,
  createProviderManager,
  getProviderManager,
  resetProviderManager,
} from './provider-manager.js';

// Credential manager
export {
  ProviderCredentialManager,
  getCredentialManager,
  resetCredentialManager,
} from './credential-manager.js';

// Content generator adapter
export {
  ProviderContentGeneratorAdapter,
  createProviderContentGenerator,
} from './content-generator-adapter.js';
