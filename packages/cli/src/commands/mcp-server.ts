/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv, ArgumentsCamelCase } from 'yargs';
import { randomUUID } from 'node:crypto';
import {
  startGeminiMcpServer,
  createContentGenerator,
  createContentGeneratorConfig,
  AuthType,
  ExitCodes,
  writeToStderr,
} from '@google/gemini-cli-core';
import { loadSettings } from '../config/settings.js';
import { loadCliConfig, type CliArgs } from '../config/config.js';
import { validateNonInteractiveAuth } from '../validateNonInterActiveAuth.js';
import { runExitCleanup } from '../utils/cleanup.js';

interface McpServerArgs {
  debug?: boolean;
  model?: string;
}

/**
 * Flag to indicate that the MCP server command is running.
 * This is set synchronously in the handler to prevent main() from continuing.
 */
export let isMcpServerRunning = false;

/**
 * Command handler for `gemini mcp-server`
 *
 * Starts Gemini CLI as an MCP server, exposing Gemini capabilities
 * to external MCP clients via stdio transport.
 */
async function handleMcpServer(argv: ArgumentsCamelCase<McpServerArgs>): Promise<void> {
  try {
    // Load settings
    const settings = await loadSettings();

    // Generate a session ID for this server instance
    const serverSessionId = randomUUID();

    // Create minimal CLI args for config initialization
    const cliArgs: CliArgs = {
      query: undefined,
      model: argv.model,
      sandbox: false,
      debug: argv.debug,
      prompt: undefined,
      promptInteractive: undefined,
      yolo: false,
      approvalMode: undefined,
      allowedMcpServerNames: undefined,
      allowedTools: undefined,
      experimentalAcp: false,
      extensions: undefined,
      listExtensions: false,
      resume: undefined,
      listSessions: false,
      deleteSession: undefined,
      includeDirectories: undefined,
      screenReader: false,
      useSmartEdit: undefined,
      useWriteTodos: undefined,
      outputFormat: undefined,
      fakeResponses: undefined,
      recordResponses: undefined,
    };

    // Create config using the standard CLI config loader
    const config = await loadCliConfig(settings.merged, serverSessionId, cliArgs);

    // Determine auth type from settings or environment
    const authType = getAuthType(settings);
    if (!authType) {
      writeToStderr(
        'Error: No authentication configured.\n' +
        'Run `gemini` first to log in, or set GEMINI_API_KEY environment variable.\n'
      );
      await runExitCleanup();
      process.exit(ExitCodes.FATAL_AUTHENTICATION_ERROR);
    }

    // Validate authentication
    const useExternalAuth = settings.merged.security?.auth?.useExternal;
    await validateNonInteractiveAuth(authType, useExternalAuth, config, settings);

    // Create content generator
    const contentGeneratorConfig = await createContentGeneratorConfig(config, authType);
    const contentGenerator = await createContentGenerator(contentGeneratorConfig, config, serverSessionId);

    // Start the MCP server (this blocks until transport closes)
    await startGeminiMcpServer(config, contentGenerator);

    // Clean exit after MCP client disconnects
    await runExitCleanup();
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    writeToStderr(`MCP server error: ${errorMessage}\n`);
    await runExitCleanup();
    process.exit(1);
  }
}

/**
 * Get auth type from settings or environment variables
 * Priority: env vars > settings (to allow override)
 */
function getAuthType(settings: { merged: { security?: { auth?: { selectedType?: string } } } }): AuthType | undefined {
  // First check environment variables (allows override)
  if (process.env['GOOGLE_GENAI_USE_GCA'] === 'true') {
    return AuthType.LOGIN_WITH_GOOGLE;
  }
  if (process.env['GOOGLE_GENAI_USE_VERTEXAI'] === 'true') {
    return AuthType.USE_VERTEX_AI;
  }
  if (process.env['GEMINI_API_KEY']) {
    return AuthType.USE_GEMINI;
  }

  // Then check settings for configured auth
  const selectedType = settings.merged.security?.auth?.selectedType;
  if (selectedType) {
    // Map settings auth type to AuthType enum
    switch (selectedType) {
      case 'oauth-personal':
        return AuthType.LOGIN_WITH_GOOGLE;
      case 'gemini-api-key':
        return AuthType.USE_GEMINI;
      case 'vertex-ai':
        return AuthType.USE_VERTEX_AI;
      default:
        // Unknown auth type - return undefined to trigger auth error
        return undefined;
    }
  }

  return undefined;
}

/**
 * The `gemini mcp-server` command module
 */
export const mcpServerCommand: CommandModule<object, McpServerArgs> = {
  command: 'mcp-server',
  describe: 'Run Gemini CLI as an MCP server (Model Context Protocol)',
  builder: (yargs: Argv) =>
    yargs
      // Middleware runs synchronously before the handler
      .middleware(() => {
        isMcpServerRunning = true;
      })
      .option('debug', {
        alias: 'd',
        type: 'boolean',
        description: 'Enable debug logging to stderr',
        default: false,
      })
      .option('model', {
        alias: 'm',
        type: 'string',
        description: 'Model to use for generation',
      })
      .example('$0 mcp-server', 'Start Gemini as an MCP server')
      .example(
        'GEMINI_API_KEY=xxx $0 mcp-server',
        'Start with API key authentication',
      )
      .example(
        '$0 mcp-server --model gemini-2.0-flash',
        'Start with a specific model',
      )
      .epilogue(
        'The MCP server communicates via stdio using JSON-RPC 2.0.\n' +
        'Configure it in your MCP client settings to use Gemini as a tool provider.\n\n' +
        'Authentication:\n' +
        '  Uses your existing Gemini CLI auth (run `gemini` to log in first).\n' +
        '  Or override with environment variables:\n' +
        '    GEMINI_API_KEY=xxx              Use API key\n' +
        '    GOOGLE_GENAI_USE_VERTEXAI=true  Use Vertex AI'
      )
      .version(false),
  handler: handleMcpServer,
};
