/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single source of truth for all model information.
 * This registry contains model IDs, display names, and metadata.
 * Used by both ModelDialog and Footer components for consistency.
 */

export interface ModelInfo {
  id: string;
  displayName: string;
  description?: string;
  provider: 'bedrock' | 'gemini';
  category?: 'default' | 'fast' | 'powerful';
}

export const MODEL_REGISTRY: Record<string, ModelInfo> = {
  // Bedrock models - using inference profiles for multi-region routing
  'us.anthropic.claude-3-7-sonnet-20250219-v1:0': {
    id: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
    displayName: 'Claude 3.7 Sonnet',
    description: 'Default Claude model with enhanced reasoning',
    provider: 'bedrock',
    category: 'default',
  },
  'us.anthropic.claude-3-5-haiku-20241022-v1:0': {
    id: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
    displayName: 'Claude 3.5 Haiku',
    description: 'Fast responses with good capability',
    provider: 'bedrock',
    category: 'fast',
  },
  'us.anthropic.claude-opus-4-20250514-v1:0': {
    id: 'us.anthropic.claude-opus-4-20250514-v1:0',
    displayName: 'Claude 4 Opus',
    description: 'Most capable model, highest cost',
    provider: 'bedrock',
    category: 'powerful',
  },
  'us.anthropic.claude-sonnet-4-20250514-v1:0': {
    id: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
    displayName: 'Claude Sonnet 4',
    description: 'Latest and most capable Claude model',
    provider: 'bedrock',
    category: 'powerful',
  },
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0': {
    id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    displayName: 'Claude 3.5 Sonnet V2',
    description: 'Improved 3.5 Sonnet with better performance',
    provider: 'bedrock',
  },
  
  // Legacy Bedrock models (region-specific, not inference profiles)
  'anthropic.claude-3-opus-20240229-v1:0': {
    id: 'anthropic.claude-3-opus-20240229-v1:0',
    displayName: 'Claude 3 Opus',
    description: 'Most capable model, highest cost',
    provider: 'bedrock',
    category: 'powerful',
  },
  'anthropic.claude-3-5-sonnet-20241022-v2:0': {
    id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    displayName: 'Claude 3.5 Sonnet V2',
    description: 'Improved 3.5 Sonnet with better performance',
    provider: 'bedrock',
  },
  'anthropic.claude-3-5-sonnet-20240620-v1:0': {
    id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
    displayName: 'Claude 3.5 Sonnet',
    description: 'High-quality responses with good speed',
    provider: 'bedrock',
  },
  'anthropic.claude-3-sonnet-20240229-v1:0': {
    id: 'anthropic.claude-3-sonnet-20240229-v1:0',
    displayName: 'Claude 3 Sonnet',
    description: 'Balanced performance and capability',
    provider: 'bedrock',
  },
  'anthropic.claude-3-haiku-20240307-v1:0': {
    id: 'anthropic.claude-3-haiku-20240307-v1:0',
    displayName: 'Claude 3 Haiku',
    description: 'Fast responses with good capability',
    provider: 'bedrock',
    category: 'fast',
  },
  
  // Gemini models
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    description: 'Most capable Gemini model',
    provider: 'gemini',
    category: 'default',
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    description: 'Fast and efficient',
    provider: 'gemini',
    category: 'fast',
  },
  'gemini-2.5-flash-lite': {
    id: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash Lite',
    description: 'Lightweight and fast',
    provider: 'gemini',
    category: 'fast',
  },
  'gemini-2.0-flash': {
    id: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    description: 'Fast multimodal model',
    provider: 'gemini',
    category: 'fast',
  },
};

/**
 * Get user-friendly display name for a model ID
 * @param modelId - The technical model identifier
 * @returns Display name or original ID if not found
 */
export function getModelDisplayName(modelId: string): string {
  return MODEL_REGISTRY[modelId]?.displayName || modelId;
}

/**
 * Get complete model information
 * @param modelId - The technical model identifier
 * @returns ModelInfo object or undefined if not found
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return MODEL_REGISTRY[modelId];
}

/**
 * Get all models for a specific provider
 * @param provider - 'bedrock' or 'gemini'
 * @returns Array of ModelInfo objects for the provider
 */
export function getModelsByProvider(provider: 'bedrock' | 'gemini'): ModelInfo[] {
  return Object.values(MODEL_REGISTRY).filter(m => m.provider === provider);
}

/**
 * Get models by category
 * @param category - Model category to filter by
 * @returns Array of ModelInfo objects in the category
 */
export function getModelsByCategory(category: 'default' | 'fast' | 'powerful'): ModelInfo[] {
  return Object.values(MODEL_REGISTRY).filter(m => m.category === category);
}

// Export specific model IDs as constants for backward compatibility
export const DEFAULT_BEDROCK_MODEL = 'us.anthropic.claude-3-7-sonnet-20250219-v1:0';
export const DEFAULT_BEDROCK_SMALL_FAST_MODEL = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';
export const DEFAULT_BEDROCK_OPUS_MODEL = 'us.anthropic.claude-opus-4-20250514-v1:0';
export const DEFAULT_BEDROCK_SONNET_4_MODEL = 'us.anthropic.claude-sonnet-4-20250514-v1:0';
export const DEFAULT_BEDROCK_CLAUDE_35_SONNET_V2_MODEL = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite';