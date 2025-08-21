/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export * from './src/index.js';
export {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_BEDROCK_MODEL,
  DEFAULT_BEDROCK_SMALL_FAST_MODEL,
  DEFAULT_BEDROCK_OPUS_MODEL,
  DEFAULT_BEDROCK_SONNET_4_MODEL,
  DEFAULT_BEDROCK_CLAUDE_35_SONNET_V2_MODEL,
} from './src/config/models.js';
export { logIdeConnection } from './src/telemetry/loggers.js';
export {
  IdeConnectionEvent,
  IdeConnectionType,
} from './src/telemetry/types.js';
export { makeFakeConfig } from './src/test-utils/config.js';
