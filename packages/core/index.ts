/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export * from './src/index.js';
export { Storage } from './src/config/storage.js';
export {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
} from './src/config/models.js';
export {
  DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES,
  DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD,
} from './src/config/config.js';
export { detectIdeFromEnv, getIdeInfo } from './src/ide/detect-ide.js';
export { logIdeConnection } from './src/telemetry/loggers.js';
export {
  IdeConnectionEvent,
  IdeConnectionType,
  ExtensionInstallEvent,
} from './src/telemetry/types.js';
export { getIdeTrust } from './src/utils/ide-trust.js';
export { makeFakeConfig } from './src/test-utils/config.js';
export * from './src/utils/pathReader.js';
export { ClearcutLogger } from './src/telemetry/clearcut-logger/clearcut-logger.js';
