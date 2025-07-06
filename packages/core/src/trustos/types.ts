/**
 * @license
 * Copyright 2025 TrustOS Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TrustOS Model Configuration
 */
export interface TrustModelConfig {
  name: string;
  path: string;
  type: 'llama' | 'phi' | 'qwen' | 'mistral' | 'gemma';
  quantization: 'Q4_K_M' | 'Q8_0' | 'FP16' | 'Q4_0' | 'Q5_K_M';
  contextSize: number;
  ramRequirement: string;
  description: string;
  trustScore?: number; // Community trust rating
  verificationHash?: string; // Model integrity verification
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
 * TrustOS Model Client Interface
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
 * TrustOS Model Manager Interface
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
 * TrustOS Configuration
 */
export interface TrustConfig {
  privacy: {
    privacyMode: 'strict' | 'moderate' | 'open';
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