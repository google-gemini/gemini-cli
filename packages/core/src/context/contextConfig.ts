/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextOptimizationConfig } from './types.js';

/**
 * Environment variable names for context optimization configuration.
 */
export const CONTEXT_ENV_VARS = {
  ENABLED: 'GEMINI_CONTEXT_OPTIMIZATION',
  MAX_CHUNKS: 'GEMINI_CONTEXT_MAX_CHUNKS',
  EMBEDDING_ENABLED: 'GEMINI_EMBEDDING_ENABLED',
  AGGRESSIVE_PRUNING: 'GEMINI_PRUNING_AGGRESSIVE',
  LOG_LEVEL: 'GEMINI_CONTEXT_LOG_LEVEL',
} as const;

/**
 * Default configuration values.
 */
export const DEFAULT_CONTEXT_CONFIG: ContextOptimizationConfig = {
  enabled: false, // Disabled by default, enable via environment variable
  maxChunks: 200,
  embeddingEnabled: false,
  aggressivePruning: false,
  scoringWeights: {
    embedding: 0.4,
    bm25: 0.4,
    recency: 0.15,
    manual: 0.05,
  },
};

/**
 * Load context optimization configuration from environment variables.
 */
export function loadContextConfigFromEnv(): ContextOptimizationConfig {
  const config = { ...DEFAULT_CONTEXT_CONFIG };

  // Check if context optimization is enabled
  const enabled = process.env[CONTEXT_ENV_VARS.ENABLED];
  if (enabled && !['0', 'false'].includes(enabled.toLowerCase())) {
    config.enabled = true;
  }

  // Parse max chunks
  const maxChunks = process.env[CONTEXT_ENV_VARS.MAX_CHUNKS];
  if (maxChunks) {
    const parsed = parseInt(maxChunks, 10);
    if (!isNaN(parsed) && parsed > 0) {
      config.maxChunks = parsed;
    }
  }

  // Parse embedding enabled
  const embeddingEnabled = process.env[CONTEXT_ENV_VARS.EMBEDDING_ENABLED];
  if (
    embeddingEnabled &&
    !['0', 'false'].includes(embeddingEnabled.toLowerCase())
  ) {
    config.embeddingEnabled = true;
  }

  // Parse aggressive pruning
  const aggressivePruning = process.env[CONTEXT_ENV_VARS.AGGRESSIVE_PRUNING];
  if (
    aggressivePruning &&
    !['0', 'false'].includes(aggressivePruning.toLowerCase())
  ) {
    config.aggressivePruning = true;
  }

  return config;
}

/**
 * Get log level from environment variables.
 */
export function getLogLevelFromEnv(): 'debug' | 'info' | 'warn' | 'error' {
  const logLevel = process.env[CONTEXT_ENV_VARS.LOG_LEVEL]?.toLowerCase();

  switch (logLevel) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
      return logLevel;
    default:
      return 'info';
  }
}

/**
 * Create a context optimization configuration with environment overrides.
 */
export function createContextConfig(
  overrides?: Partial<ContextOptimizationConfig>,
): ContextOptimizationConfig {
  const envConfig = loadContextConfigFromEnv();
  return {
    ...envConfig,
    ...overrides,
    scoringWeights: {
      ...envConfig.scoringWeights,
      ...(overrides?.scoringWeights || {}),
    },
  };
}

/**
 * Check if context optimization is enabled via environment or configuration.
 */
export function isContextOptimizationEnabled(
  config?: ContextOptimizationConfig,
): boolean {
  if (config) {
    return config.enabled;
  }

  const envConfig = loadContextConfigFromEnv();
  return envConfig.enabled;
}

/**
 * Print current context optimization configuration to console.
 */
export function printContextConfig(config: ContextOptimizationConfig): void {
  console.log('🎯 Context Optimization Configuration:');
  console.log(`   Enabled: ${config.enabled}`);
  console.log(`   Max chunks: ${config.maxChunks}`);
  console.log(`   Embedding enabled: ${config.embeddingEnabled}`);
  console.log(`   Aggressive pruning: ${config.aggressivePruning}`);
  console.log(`   Scoring weights:`);
  console.log(`     - Embedding: ${config.scoringWeights.embedding}`);
  console.log(`     - BM25: ${config.scoringWeights.bm25}`);
  console.log(`     - Recency: ${config.scoringWeights.recency}`);
  console.log(`     - Manual: ${config.scoringWeights.manual}`);
}

/**
 * Validate context optimization configuration.
 */
export function validateContextConfig(
  config: ContextOptimizationConfig,
): string[] {
  const errors: string[] = [];

  if (typeof config.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  if (typeof config.maxChunks !== 'number' || config.maxChunks < 0) {
    errors.push('maxChunks must be a non-negative number');
  }

  if (typeof config.embeddingEnabled !== 'boolean') {
    errors.push('embeddingEnabled must be a boolean');
  }

  if (typeof config.aggressivePruning !== 'boolean') {
    errors.push('aggressivePruning must be a boolean');
  }

  if (!config.scoringWeights || typeof config.scoringWeights !== 'object') {
    errors.push('scoringWeights must be an object');
  } else {
    const { embedding, bm25, recency, manual } = config.scoringWeights;

    if (typeof embedding !== 'number' || embedding < 0 || embedding > 1) {
      errors.push('embedding weight must be between 0 and 1');
    }

    if (typeof bm25 !== 'number' || bm25 < 0 || bm25 > 1) {
      errors.push('bm25 weight must be between 0 and 1');
    }

    if (typeof recency !== 'number' || recency < 0 || recency > 1) {
      errors.push('recency weight must be between 0 and 1');
    }

    if (typeof manual !== 'number' || manual < 0 || manual > 1) {
      errors.push('manual weight must be between 0 and 1');
    }

    // Weights should sum to approximately 1
    const sum = embedding + bm25 + recency + manual;
    if (Math.abs(sum - 1.0) > 0.1) {
      errors.push(
        `scoring weights should sum to 1.0 (current sum: ${sum.toFixed(2)})`,
      );
    }
  }

  return errors;
}

/**
 * Environment setup instructions.
 */
export const SETUP_INSTRUCTIONS = `
Context Optimization Setup Instructions:

1. Enable context optimization:
   export GEMINI_CONTEXT_OPTIMIZATION=true

2. Optional configuration:
   export GEMINI_CONTEXT_MAX_CHUNKS=200
   export GEMINI_EMBEDDING_ENABLED=false
   export GEMINI_PRUNING_AGGRESSIVE=false
   export GEMINI_CONTEXT_LOG_LEVEL=info

3. Restart your application to apply changes.

4. Monitor console output for optimization logs:
   - 🎯 = optimization started
   - ✂️ = pruning completed  
   - 🎉 = optimization finished

For detailed monitoring, set GEMINI_CONTEXT_LOG_LEVEL=debug
`;

/**
 * Print setup instructions to console.
 */
export function printSetupInstructions(): void {
  console.log(SETUP_INSTRUCTIONS);
}
