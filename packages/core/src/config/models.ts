/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Re-export model constants from the centralized registry for backward compatibility
export {
  DEFAULT_BEDROCK_MODEL,
  DEFAULT_BEDROCK_SMALL_FAST_MODEL,
  DEFAULT_BEDROCK_OPUS_MODEL,
  DEFAULT_BEDROCK_SONNET_4_MODEL,
  DEFAULT_BEDROCK_CLAUDE_35_SONNET_V2_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
} from './modelRegistry.js';

// Models not yet in the registry (embedding models, etc.)
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
