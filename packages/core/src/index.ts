/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Export config
export * from './config/config.js';

// Export Core Logic
export * from './core/client.js';
export * from './core/contentGenerator.js';
export * from './core/geminiChat.js';
export * from './core/logger.js';
export * from './core/prompts.js';
export * from './core/tokenLimits.js';
export * from './core/turn.js';
export * from './core/geminiRequest.js';
export * from './core/coreToolScheduler.js';
export * from './core/nonInteractiveToolExecutor.js';

export * from './code_assist/codeAssist.js';
export * from './code_assist/oauth2.js';
export * from './code_assist/server.js';
export * from './code_assist/types.js';

// Export utilities
export * from './utils/paths.js';
export * from './utils/schemaValidator.js';
export * from './utils/errors.js';
export * from './utils/getFolderStructure.js';
export * from './utils/memoryDiscovery.js';
export * from './utils/gitIgnoreParser.js';
export * from './utils/editor.js';

// Export services
export * from './services/fileDiscoveryService.js';
export * from './services/gitService.js';

// Export base tool definitions
export * from './tools/tools.js';
export * from './tools/tool-registry.js';

// Export specific tool logic
export * from './tools/read-file.js';
export * from './tools/ls.js';
export * from './tools/grep.js';
export * from './tools/glob.js';
export * from './tools/edit.js';
export * from './tools/write-file.js';
export * from './tools/web-fetch.js';
export * from './tools/memoryTool.js';
export * from './tools/shell.js';
export * from './tools/web-search.js';
export * from './tools/read-many-files.js';
export * from './tools/mcp-client.js';
export * from './tools/mcp-tool.js';

// Export telemetry functions
export * from './telemetry/index.js';
export { sessionId } from './utils/session.js';

// Newly integrated tools and types (from user snippets)
// Note: Assuming build process handles .js extension if needed in final output.
// These specific named exports ensure the versions from the recent snippets are available.
export { readFileTool, ReadFileArgs } from './tools/readFile';
export { writeFileTool, WriteFileArgs } from './tools/writeFile';
// shell.ts was overwritten, its existing export './tools/shell.js' should now point to the new content.
// To be explicit about the new shellTool constant if it's different:
export { shellTool, ShellArgs } from './tools/shell'; // Assuming shell.ts is the source for shell.js
export { termuxToastTool, TermuxToastArgs } from './tools/termux';
export { Tool } from './types/toolTypes';
