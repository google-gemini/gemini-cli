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
  TrustOSModelManager,
  TrustContentGenerator,
  TRUSTOS_VERSION,
  TRUSTOS_CLI_NAME,
  TRUSTOS_DESCRIPTION
} from './src/trustos/index.js';
export * from './src/config/trustosConfig.js';
