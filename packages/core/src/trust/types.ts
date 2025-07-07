/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Default Trust model for local inference
 * Trust: An Open System for Modern Assurance
 */
export const DEFAULT_TRUST_MODEL = 'qwen2.5-1.5b-instruct';

// Re-export performance monitoring types and utilities
export type { SystemMetrics, InferenceMetrics, ResourceUsage } from './performanceMonitor.js';
export { PerformanceMonitor, globalPerformanceMonitor } from './performanceMonitor.js';

/**
 * Trust Model Configuration
 * Part of Trust: An Open System for Modern Assurance
 */
export interface TrustModelConfig {
  name: string;
  path: string;
  type: 'llama' | 'phi' | 'qwen' | 'mistral' | 'gemma' | 'deepseek';
  quantization: 'Q4_K_M' | 'Q8_0' | 'FP16' | 'Q4_0' | 'Q5_K_M';
  contextSize: number;
  ramRequirement: string;
  description: string;
  trustScore?: number; // Community trust rating
  verificationHash?: string; // SHA256 hash for model integrity verification
  expectedSize?: number; // Expected file size in bytes
  parameters?: string; // Model parameter count (e.g., "3B", "7B")
  downloadUrl?: string; // Hugging Face URL for download
}

/**
 * Model inference options
 */
export interface GenerationOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stopTokens?: string[];
  stream?: boolean;
}

/**
 * Model performance metrics
 */
export interface ModelMetrics {
  tokensPerSecond: number;
  memoryUsage: number;
  responseTime: number;
  lastUsed: Date;
}

/**
 * Trust Model Client Interface
 * Part of Trust: An Open System for Modern Assurance
 */
export interface TrustModelClient {
  generateText(prompt: string, options?: GenerationOptions): Promise<string>;
  generateStream(prompt: string, options?: GenerationOptions): AsyncIterable<string>;
  loadModel(modelPath: string): Promise<void>;
  unloadModel(): Promise<void>;
  createChatSession(): Promise<any>;
  getModelInfo(): TrustModelConfig | null;
  getMetrics(): ModelMetrics;
  isModelLoaded(): boolean;
}

/**
 * Trust Model Manager Interface
 * Part of Trust: An Open System for Modern Assurance
 */
export interface TrustModelManager {
  listAvailableModels(): TrustModelConfig[];
  downloadModel(modelId: string): Promise<void>;
  verifyModel(modelPath: string): Promise<boolean>;
  switchModel(modelName: string): Promise<void>;
  getCurrentModel(): TrustModelConfig | null;
  getTrustRating(modelId: string): Promise<number>;
  getRecommendedModel(task: string, ramLimit?: number): TrustModelConfig | null;
  deleteModel(modelName: string): Promise<void>;
}

/**
 * Privacy Mode Type
 * Part of Trust: An Open System for Modern Assurance
 */
export type PrivacyMode = 'strict' | 'moderate' | 'open';

/**
 * Trust Configuration
 * Part of Trust: An Open System for Modern Assurance
 */
export interface TrustConfig {
  privacy: {
    privacyMode: PrivacyMode;
    auditLogging: boolean;
    modelVerification: boolean;
  };
  models: {
    default: string;
    directory: string;
    autoVerify: boolean;
  };
  inference: {
    temperature: number;
    topP: number;
    maxTokens: number;
    stream: boolean;
    threads?: number;
  };
  transparency: {
    logPrompts: boolean;
    logResponses: boolean;
    showModelInfo: boolean;
    showPerformanceMetrics: boolean;
  };
}

/**
 * Alias for TrustConfiguration class compatibility
 */
export type TrustConfiguration = any;