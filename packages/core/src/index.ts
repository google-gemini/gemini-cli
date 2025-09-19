/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Export config
export * from './config/config.js';
export * from './output/types.js';
export * from './output/json-formatter.js';
export * from './policy/types.js';
export * from './policy/policy-engine.js';

// Export Core Logic
export * from './core/client.js';
export * from './core/contentGenerator.js';
export * from './core/loggingContentGenerator.js';
export * from './core/geminiChat.js';
export * from './core/logger.js';
export * from './core/prompts.js';
export * from './core/tokenLimits.js';
export * from './core/turn.js';
export * from './core/geminiRequest.js';
export * from './core/coreToolScheduler.js';
export * from './core/nonInteractiveToolExecutor.js';

export * from './fallback/types.js';

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
export * from './utils/gitUtils.js';
export * from './utils/editor.js';
export * from './utils/quotaErrorDetection.js';
export * from './utils/fileUtils.js';
export * from './utils/retry.js';
export * from './utils/shell-utils.js';
export * from './utils/terminalSerializer.js';
export * from './utils/systemEncoding.js';
export * from './utils/textUtils.js';
export * from './utils/formatters.js';
export * from './utils/generateContentResponseUtilities.js';
export * from './utils/filesearch/fileSearch.js';
export * from './utils/errorParsing.js';
export * from './utils/workspaceContext.js';
export * from './utils/ignorePatterns.js';
export * from './utils/partUtils.js';
export * from './utils/promptIdContext.js';

// Export services
export * from './services/fileDiscoveryService.js';
export * from './services/gitService.js';
export * from './services/chatRecordingService.js';
export * from './services/fileSystemService.js';

// Export IDE specific logic
export * from './ide/ide-client.js';
export * from './ide/ideContext.js';
export * from './ide/ide-installer.js';
export { IDE_DEFINITIONS, type IdeInfo } from './ide/detect-ide.js';
export * from './ide/constants.js';
export * from './ide/types.js';

// Export Shell Execution Service
export * from './services/shellExecutionService.js';

// Export base tool definitions
export * from './tools/tools.js';
export * from './tools/tool-error.js';
export * from './tools/tool-registry.js';

// Export prompt logic
export * from './prompts/mcp-prompts.js';

// Export specific tool logic
export * from './tools/read-file.js';
export * from './tools/ls.js';
export * from './tools/grep.js';
export * from './tools/ripGrep.js';
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

// MCP OAuth
export { MCPOAuthProvider } from './mcp/oauth-provider.js';
export type {
  OAuthToken,
  OAuthCredentials,
} from './mcp/token-storage/types.js';
export { MCPOAuthTokenStorage } from './mcp/oauth-token-storage.js';
export type { MCPOAuthConfig } from './mcp/oauth-provider.js';
export type {
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from './mcp/oauth-utils.js';
export { OAuthUtils } from './mcp/oauth-utils.js';

// Export telemetry functions
export * from './telemetry/index.js';
export { sessionId } from './utils/session.js';
export * from './utils/browser.js';
export { Storage } from './config/storage.js';

// Export test utils
export * from './test-utils/index.js';
