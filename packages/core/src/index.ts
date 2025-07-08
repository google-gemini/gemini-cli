/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Export config
export * from './config/config.ts';
export { DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_EMBEDDING_MODEL } from './config/models.ts';

// Export Core Logic
export * from './core/client.ts';
export * from './core/contentGenerator.ts';
export * from './core/geminiChat.ts';
export * from './core/logger.ts';
export * from './core/prompts.ts';
export * from './core/tokenLimits.ts';
export * from './core/turn.ts';
export * from './core/geminiRequest.ts';
export * from './core/coreToolScheduler.ts';
export * from './core/nonInteractiveToolExecutor.ts';

export * from './code_assist/codeAssist.ts';
export * from './code_assist/oauth2.ts';
export * from './code_assist/server.ts';
export * from './code_assist/types.ts';

// Export utilities
export * from './utils/paths.ts';
export * from './utils/schemaValidator.ts';
export * from './utils/errors.ts';
export * from './utils/getFolderStructure.ts';
export * from './utils/memoryDiscovery.ts';
export * from './utils/gitIgnoreParser.ts';
export * from './utils/editor.ts';

// Export services
export * from './services/fileDiscoveryService.ts';
export * from './services/gitService.ts';

// Export base tool definitions
export * from './tools/tools.ts';
export * from './tools/tool-registry.ts';

// Export specific tool logic
export * from './tools/read-file.ts';
export * from './tools/ls.ts';
export * from './tools/grep.ts';
export * from './tools/glob.ts';
export * from './tools/edit.ts';
export * from './tools/write-file.ts';
export * from './tools/web-fetch.ts';
export * from './tools/memoryTool.ts';
export * from './tools/shell.ts';
export * from './tools/web-search.ts';
export * from './tools/refactor-code.ts';
export * from './tools/read-many-files.ts';
export * from './tools/mcp-client.ts';
export * from './tools/mcp-tool.ts';

// Export telemetry functions
export * from './telemetry/index.ts';
export { sessionId } from './utils/session.ts';
