/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export * from './src/index.js';
export {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
} from './src/config/models.js';
export { 
  TrustModelConfig,
  TrustModelClient,
  TrustModelManager,
  TrustConfig,
  GenerationOptions,
  TrustNodeLlamaClient,
  TrustModelManagerImpl,
  TrustContentGenerator,
  TRUST_VERSION,
  TRUST_CLI_NAME,
  TRUST_DESCRIPTION,
  DEFAULT_TRUST_MODEL,
  globalPerformanceMonitor
} from './src/trust/index.js';
export * from './src/config/trustConfig.js';
