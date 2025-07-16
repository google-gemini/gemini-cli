/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Fix for Node.js environment - ImageData is not available
if (typeof globalThis.ImageData === 'undefined') {
    class MockImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;

    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  (globalThis as any).ImageData = MockImageData;
}

import React from 'react';
import { render } from 'ink';
import { AppWrapper } from './ui/App.js';
import { loadCliConfig } from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { basename } from 'node:path';
import v8 from 'node:v8';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { start_sandbox } from './utils/sandbox.js';
import {
  LoadedSettings,
  loadSettings,
  SettingScope,
  USER_SETTINGS_PATH,
} from './config/settings.js';
import { themeManager } from './ui/themes/theme-manager.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import { loadExtensions, Extension } from './config/extension.js';
import { cleanupCheckpoints } from './utils/cleanup.js';
import {
  ApprovalMode,
  Config,
  EditTool,
  ShellTool,
  WriteFileTool,
  sessionId,
  logUserPrompt,
  AuthType,
} from '@google/gemini-cli-core';
import { validateAuthMethod } from './config/auth.js';
import { setMaxSizedBoxDebugging } from './ui/components/shared/MaxSizedBox.js';
import { connectToHyphaService } from './hypha-connect.js';

function getNodeMemoryArgs(config: Config): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(
    heapStats.heap_size_limit / 1024 / 1024,
  );

  // Set target to 50% of total memory
  const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);
  if (config.getDebugMode()) {
    console.debug(
      `Current heap size ${currentMaxOldSpaceSizeMb.toFixed(2)} MB`,
    );
  }

  if (process.env.GEMINI_CLI_NO_RELAUNCH) {
    return [];
  }

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    if (config.getDebugMode()) {
      console.debug(
        `Need to relaunch with more memory: ${targetMaxOldSpaceSizeInMB.toFixed(2)} MB`,
      );
    }
    return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
  }

  return [];
}

async function relaunchWithAdditionalArgs(additionalArgs: string[]) {
  const nodeArgs = [...additionalArgs, ...process.argv.slice(1)];
  const newEnv = { ...process.env, GEMINI_CLI_NO_RELAUNCH: 'true' };

  const child = spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: newEnv,
  });

  await new Promise((resolve) => child.on('close', resolve));
  process.exit(0);
}

export async function main() {
  const workspaceRoot = process.cwd();
  const settings = loadSettings(workspaceRoot);

  await cleanupCheckpoints();
  if (settings.errors.length > 0) {
    for (const error of settings.errors) {
      let errorMessage = `Error in ${error.path}: ${error.message}`;
      if (!process.env.NO_COLOR) {
        errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
      }
      console.error(errorMessage);
      console.error(`Please fix ${error.path} and try again.`);
    }
    process.exit(1);
  }

  const extensions = loadExtensions(workspaceRoot);
  const config = await loadCliConfig(settings.merged, extensions, sessionId);

  // Check for Hypha connection options
  const argv = process.argv;
  const connectIndex = argv.indexOf('--connect');
  const workspaceIndex = argv.indexOf('--workspace');
  const tokenIndex = argv.indexOf('--token');
  const serviceIdIndex = argv.indexOf('--service-id');
  const promptIndex = argv.indexOf('--prompt');

  // If --connect is specified, handle Hypha connection
  if (connectIndex !== -1) {
    const serverUrl = argv[connectIndex + 1];
    const workspace = workspaceIndex !== -1 ? argv[workspaceIndex + 1] : undefined;
    const token = tokenIndex !== -1 ? argv[tokenIndex + 1] : undefined;
    const serviceId = serviceIdIndex !== -1 ? argv[serviceIdIndex + 1] : 'gemini-agent';

    if (!serverUrl || !workspace || !token) {
      console.error('Error: When using --connect, you must also specify --workspace and --token');
      console.error('Usage:');
      console.error('  Register as service: gemini --connect <server-url> --workspace <workspace> --token <token> [--service-id <service-id>]');
      console.error('  Connect to service:  gemini --connect <server-url> --workspace <workspace> --token <token> [--service-id <service-id>] --prompt <query>');
      process.exit(1);
    }

    // If --prompt is provided, connect to existing service
    if (promptIndex !== -1) {
      let input = config.getQuestion();
      
      // If not a TTY, read from stdin
      if (!process.stdin.isTTY) {
        input += await readStdin();
      }
      
      if (!input) {
        console.error('No input provided. Please provide a query when using --connect mode with --prompt.');
        process.exit(1);
      }

      // Connect to Hypha service
      await connectToHyphaService(
        {
          serverUrl,
          workspace,
          token,
          serviceId,
        },
        input
      );
      
      process.exit(0);
    } else {
      // No --prompt provided, register as a service
      await registerAsHyphaService({
        serverUrl,
        workspace,
        token,
        serviceId,
        config
      });
      
      return; // Keep running as a service
    }
  }

  // Continue with normal local execution if not using Hypha connection
  // set default fallback to gemini api key
  // this has to go after load cli because thats where the env is set
  if (!settings.merged.selectedAuthType && process.env.GEMINI_API_KEY) {
    settings.setValue(
      SettingScope.User,
      'selectedAuthType',
      AuthType.USE_GEMINI,
    );
  }

  setMaxSizedBoxDebugging(config.getDebugMode());

  // Initialize centralized FileDiscoveryService
  config.getFileService();
  if (config.getCheckpointingEnabled()) {
    try {
      await config.getGitService();
    } catch {
      // For now swallow the error, later log it.
    }
  }

  if (settings.merged.theme) {
    if (!themeManager.setActiveTheme(settings.merged.theme)) {
      // If the theme is not found during initial load, log a warning and continue.
      // The useThemeCommand hook in App.tsx will handle opening the dialog.
      console.warn(`Warning: Theme "${settings.merged.theme}" not found.`);
    }
  }

  const memoryArgs = settings.merged.autoConfigureMaxOldSpaceSize
    ? getNodeMemoryArgs(config)
    : [];

  // hop into sandbox if we are outside and sandboxing is enabled
  if (!process.env.SANDBOX) {
    const sandboxConfig = config.getSandbox();
    if (sandboxConfig) {
      if (settings.merged.selectedAuthType) {
        // Validate authentication here because the sandbox will interfere with the Oauth2 web redirect.
        try {
          const err = validateAuthMethod(settings.merged.selectedAuthType);
          if (err) {
            throw new Error(err);
          }
          await config.refreshAuth(settings.merged.selectedAuthType);
        } catch (err) {
          console.error('Error authenticating:', err);
          process.exit(1);
        }
      }
      await start_sandbox(sandboxConfig, memoryArgs);
      process.exit(0);
    } else {
      // Not in a sandbox and not entering one, so relaunch with additional
      // arguments to control memory usage if needed.
      if (memoryArgs.length > 0) {
        await relaunchWithAdditionalArgs(memoryArgs);
        process.exit(0);
      }
    }
  }
  let input = config.getQuestion();
  const startupWarnings = await getStartupWarnings();

  // Render UI, passing necessary config values. Check that there is no command line question.
  if (process.stdin.isTTY && input?.length === 0) {
    setWindowTitle(basename(workspaceRoot), settings);
    render(
      <React.StrictMode>
        <AppWrapper
          config={config}
          settings={settings}
          startupWarnings={startupWarnings}
        />
      </React.StrictMode>,
      { exitOnCtrlC: false },
    );
    return;
  }
  // If not a TTY, read from stdin
  // This is for cases where the user pipes input directly into the command
  if (!process.stdin.isTTY) {
    input += await readStdin();
  }
  if (!input) {
    console.error('No input provided via stdin.');
    process.exit(1);
  }

  logUserPrompt(config, {
    'event.name': 'user_prompt',
    'event.timestamp': new Date().toISOString(),
    prompt: input,
    prompt_length: input.length,
  });

  // Non-interactive mode handled by runNonInteractive
  const nonInteractiveConfig = await loadNonInteractiveConfig(
    config,
    extensions,
    settings,
  );

  await runNonInteractive(nonInteractiveConfig, input);
  process.exit(0);
}

function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.hideWindowTitle) {
    process.stdout.write(`\x1b]2; Gemini - ${title} \x07`);

    process.on('exit', () => {
      process.stdout.write(`\x1b]2;\x07`);
    });
  }
}

// --- Global Unhandled Rejection Handler ---
process.on('unhandledRejection', (reason, _promise) => {
  // Log other unexpected unhandled rejections as critical errors
  console.error('=========================================');
  console.error('CRITICAL: Unhandled Promise Rejection!');
  console.error('=========================================');
  console.error('Reason:', reason);
  console.error('Stack trace may follow:');
  if (!(reason instanceof Error)) {
    console.error(reason);
  }
  // Exit for genuinely unhandled errors
  process.exit(1);
});

async function loadNonInteractiveConfig(
  config: Config,
  extensions: Extension[],
  settings: LoadedSettings,
) {
  let finalConfig = config;
  if (config.getApprovalMode() !== ApprovalMode.YOLO) {
    // Everything is not allowed, ensure that only read-only tools are configured.
    const existingExcludeTools = settings.merged.excludeTools || [];
    const interactiveTools = [
      ShellTool.Name,
      EditTool.Name,
      WriteFileTool.Name,
    ];

    const newExcludeTools = [
      ...new Set([...existingExcludeTools, ...interactiveTools]),
    ];

    const nonInteractiveSettings = {
      ...settings.merged,
      excludeTools: newExcludeTools,
    };
    finalConfig = await loadCliConfig(
      nonInteractiveSettings,
      extensions,
      config.getSessionId(),
    );
  }

  return await validateNonInterActiveAuth(
    settings.merged.selectedAuthType,
    finalConfig,
  );
}

async function validateNonInterActiveAuth(
  selectedAuthType: AuthType | undefined,
  nonInteractiveConfig: Config,
) {
  // making a special case for the cli. many headless environments might not have a settings.json set
  // so if GEMINI_API_KEY is set, we'll use that. However since the oauth things are interactive anyway, we'll
  // still expect that exists
  if (!selectedAuthType && !process.env.GEMINI_API_KEY) {
    console.error(
      `Please set an Auth method in your ${USER_SETTINGS_PATH} OR specify GEMINI_API_KEY env variable file before running`,
    );
    process.exit(1);
  }

  selectedAuthType = selectedAuthType || AuthType.USE_GEMINI;
  const err = validateAuthMethod(selectedAuthType);
  if (err != null) {
    console.error(err);
    process.exit(1);
  }

  await nonInteractiveConfig.refreshAuth(selectedAuthType);
  return nonInteractiveConfig;
}

// Configuration interfaces for better organization
interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  httpUrl?: string;
  headers?: Record<string, string>;
  tcp?: string;
  timeout?: number;
  trust?: boolean;
  description?: string;
}

interface ToolConfig {
  coreTools?: string[];
  excludeTools?: string[];
  discoveryCommand?: string;
  callCommand?: string;
  mcpServerCommand?: string;
}

interface ModelConfig {
  model?: string;
  debugMode?: boolean;
  fullContext?: boolean;
  showMemoryUsage?: boolean;
  proxy?: string;
}

interface FileConfig {
  contextFileName?: string | string[];
  respectGitIgnore?: boolean;
  enableRecursiveFileSearch?: boolean;
}

interface ChatOptions {
  // Simple options for common cases
  mode?: 'default' | 'autoEdit' | 'yolo';
  debug?: boolean;
  
  // Grouped configuration
  model?: ModelConfig;
  tools?: ToolConfig;
  files?: FileConfig;
  mcpServers?: Record<string, MCPServerConfig>;
  
  // Advanced options
  history?: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; [key: string]: unknown }> }>;
  checkpointing?: boolean;
  
  // Preset configurations
  preset?: 'minimal' | 'development' | 'production' | 'research';
}

// Preset configurations
const CHAT_PRESETS: Record<string, Partial<ChatOptions>> = {
  minimal: {
    mode: 'default',
    debug: false,
    model: { debugMode: false, fullContext: false },
    tools: { coreTools: ['read_file', 'write_file', 'shell'] }
  },
  development: {
    mode: 'autoEdit',
    debug: true,
    model: { debugMode: true, fullContext: true, showMemoryUsage: true },
    files: { respectGitIgnore: true, enableRecursiveFileSearch: true }
  },
  production: {
    mode: 'default',
    debug: false,
    model: { debugMode: false, fullContext: false },
    files: { respectGitIgnore: true }
  },
  research: {
    mode: 'yolo',
    debug: true,
    model: { debugMode: true, fullContext: true, showMemoryUsage: true },
    files: { enableRecursiveFileSearch: true }
  }
};

// Helper function to merge configurations
function mergeConfig(baseConfig: ChatOptions, overrides: ChatOptions): ChatOptions {
  const merged = { ...baseConfig };
  
  // Simple properties
  if (overrides.mode) merged.mode = overrides.mode;
  if (overrides.debug !== undefined) merged.debug = overrides.debug;
  if (overrides.checkpointing !== undefined) merged.checkpointing = overrides.checkpointing;
  if (overrides.history) merged.history = overrides.history;
  if (overrides.mcpServers) merged.mcpServers = overrides.mcpServers;
  
  // Grouped properties
  if (overrides.model) merged.model = { ...merged.model, ...overrides.model };
  if (overrides.tools) merged.tools = { ...merged.tools, ...overrides.tools };
  if (overrides.files) merged.files = { ...merged.files, ...overrides.files };
  
  return merged;
}

// Convert new format to legacy format
function convertToLegacyConfig(options: ChatOptions): Record<string, any> {
  const legacy: Record<string, any> = {};
  
  // Map simple options
  if (options.mode) {
    legacy.approvalMode = options.mode;
  }
  if (options.debug !== undefined) {
    legacy.debugMode = options.debug;
  }
  if (options.checkpointing !== undefined) {
    legacy.checkpointing = options.checkpointing;
  }
  if (options.history) {
    legacy.history = options.history;
  }
  if (options.mcpServers) {
    legacy.mcpServers = options.mcpServers;
  }
  
  // Map model config
  if (options.model) {
    if (options.model.model) legacy.model = options.model.model;
    if (options.model.debugMode !== undefined) legacy.debugMode = options.model.debugMode;
    if (options.model.fullContext !== undefined) legacy.fullContext = options.model.fullContext;
    if (options.model.showMemoryUsage !== undefined) legacy.showMemoryUsage = options.model.showMemoryUsage;
    if (options.model.proxy) legacy.proxy = options.model.proxy;
  }
  
  // Map tools config
  if (options.tools) {
    if (options.tools.coreTools) legacy.coreTools = options.tools.coreTools;
    if (options.tools.excludeTools) legacy.excludeTools = options.tools.excludeTools;
    if (options.tools.discoveryCommand) legacy.toolDiscoveryCommand = options.tools.discoveryCommand;
    if (options.tools.callCommand) legacy.toolCallCommand = options.tools.callCommand;
    if (options.tools.mcpServerCommand) legacy.mcpServerCommand = options.tools.mcpServerCommand;
  }
  
  // Map files config
  if (options.files) {
    if (options.files.contextFileName) legacy.contextFileName = options.files.contextFileName;
    legacy.fileFiltering = {};
    if (options.files.respectGitIgnore !== undefined) {
      legacy.fileFiltering.respectGitIgnore = options.files.respectGitIgnore;
    }
    if (options.files.enableRecursiveFileSearch !== undefined) {
      legacy.fileFiltering.enableRecursiveFileSearch = options.files.enableRecursiveFileSearch;
    }
  }
  
  return legacy;
}

async function registerAsHyphaService(options: {
  serverUrl: string;
  workspace: string;
  token: string;
  serviceId: string;
  config: Config;
}) {
  // Dynamic import for hypha-rpc
  const hyphaRpc = await import('hypha-rpc');
  const { hyphaWebsocketClient } = hyphaRpc.default;

  console.log(`Registering Gemini CLI as Hypha service...`);
  console.log(`Server: ${options.serverUrl}`);
  console.log(`Workspace: ${options.workspace}`);
  console.log(`Service ID: ${options.serviceId}`);

  try {
    // Ensure Gemini is properly configured and authenticated
    console.log('=== SERVICE REGISTRATION AUTH SETUP ===');
    const contentGenConfig = options.config.getContentGeneratorConfig();
    console.log('ContentGeneratorConfig exists:', !!contentGenConfig);
    console.log('GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
    
    if (!contentGenConfig) {
      // set default fallback to gemini api key
      if (process.env.GEMINI_API_KEY) {
        console.log('Setting up auth with GEMINI_API_KEY...');
        const settings = loadSettings(process.cwd());
        settings.setValue(SettingScope.User, 'selectedAuthType', AuthType.USE_GEMINI);
        await options.config.refreshAuth(AuthType.USE_GEMINI);
        console.log('Auth setup completed in service registration');
      } else {
        console.error('No Gemini API key found. Please set GEMINI_API_KEY environment variable.');
        process.exit(1);
      }
    } else {
      console.log('ContentGeneratorConfig already exists, skipping auth setup');
    }
    
    // Verify the client is working
    const testClient = options.config.getGeminiClient();
    console.log('Test client after service registration auth:', testClient ? 'exists' : 'undefined');

    // Connect to Hypha server
    const server = await hyphaWebsocketClient.connectToServer({
      server_url: options.serverUrl,
      workspace: options.workspace,
      token: options.token
    });

    console.log(`Connected to workspace: ${server.config.workspace}`);

         // Create chat function with elegant configuration
     const chat = async function* (query: string, chatOptions: ChatOptions = {}) {
       console.log(`Processing query: ${query}`);
       
       let geminiClient: any; // Will be assigned the GeminiClient instance
       let legacyConfig: Record<string, any> = {}; // Declare at function scope for catch block access
       
       try {
         yield {
           type: 'status',
           content: 'Initializing Gemini client...',
           timestamp: new Date().toISOString()
         };

         console.log('=== CHAT FUNCTION START ===');
         console.log('chatOptions provided:', Object.keys(chatOptions).length > 0);
         console.log('chatOptions:', chatOptions);

         // Apply preset if specified
         let finalConfig = chatOptions;
         if (chatOptions.preset) {
           const presetConfig = CHAT_PRESETS[chatOptions.preset];
           if (presetConfig) {
             finalConfig = mergeConfig(presetConfig, chatOptions);
             console.log('Applied preset:', chatOptions.preset);
           }
         }

         // Convert to legacy format for backward compatibility
         legacyConfig = convertToLegacyConfig(finalConfig);
         console.log('Legacy config:', legacyConfig);

        // Create a modified config if chatConfig is provided
        let activeConfig = options.config;
        if (legacyConfig) {
          // Import ApprovalMode and MCPServerConfig
          const { ApprovalMode, MCPServerConfig } = await import('@google/gemini-cli-core');
          
          // Convert string approval mode to enum
          let approvalMode = ApprovalMode.DEFAULT;
          if (legacyConfig.approvalMode === 'autoEdit') {
            approvalMode = ApprovalMode.AUTO_EDIT;
          } else if (legacyConfig.approvalMode === 'yolo') {
            approvalMode = ApprovalMode.YOLO;
          }

                     // Convert MCP server configs
           const mcpServers: Record<string, InstanceType<typeof MCPServerConfig>> = {};
           if (legacyConfig.mcpServers) {
             for (const [key, config] of Object.entries(legacyConfig.mcpServers)) {
               const mcpConfig = config as MCPServerConfig;
               mcpServers[key] = new MCPServerConfig(
                 mcpConfig.command,
                 mcpConfig.args,
                 mcpConfig.env,
                 mcpConfig.cwd,
                 mcpConfig.url,
                 mcpConfig.httpUrl,
                 mcpConfig.headers,
                 mcpConfig.tcp,
                 mcpConfig.timeout,
                 mcpConfig.trust,
                 mcpConfig.description
               );
             }
           }

          // Create new Config with merged parameters
          const { Config } = await import('@google/gemini-cli-core');
          const originalConfigParams = {
            sessionId: options.config.getSessionId(),
            embeddingModel: options.config.getEmbeddingModel(),
            targetDir: options.config.getTargetDir(),
            debugMode: legacyConfig.debugMode ?? options.config.getDebugMode(),
            question: options.config.getQuestion(),
            fullContext: legacyConfig.fullContext ?? options.config.getFullContext(),
            coreTools: legacyConfig.coreTools ?? options.config.getCoreTools(),
            excludeTools: legacyConfig.excludeTools ?? options.config.getExcludeTools(),
            toolDiscoveryCommand: legacyConfig.toolDiscoveryCommand ?? options.config.getToolDiscoveryCommand(),
            toolCallCommand: legacyConfig.toolCallCommand ?? options.config.getToolCallCommand(),
            mcpServerCommand: legacyConfig.mcpServerCommand ?? options.config.getMcpServerCommand(),
            mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : options.config.getMcpServers(),
            userMemory: options.config.getUserMemory(),
            geminiMdFileCount: options.config.getGeminiMdFileCount(),
            approvalMode,
            showMemoryUsage: legacyConfig.showMemoryUsage ?? options.config.getShowMemoryUsage(),
            contextFileName: legacyConfig.contextFileName,
            accessibility: options.config.getAccessibility(),
            telemetry: {
              enabled: options.config.getTelemetryEnabled(),
              target: options.config.getTelemetryTarget(),
              otlpEndpoint: options.config.getTelemetryOtlpEndpoint(),
              logPrompts: options.config.getTelemetryLogPromptsEnabled(),
            },
            usageStatisticsEnabled: options.config.getUsageStatisticsEnabled(),
            fileFiltering: legacyConfig.fileFiltering ?? {
              respectGitIgnore: options.config.getFileFilteringRespectGitIgnore(),
              enableRecursiveFileSearch: options.config.getEnableRecursiveFileSearch(),
            },
            checkpointing: legacyConfig.checkpointing ?? options.config.getCheckpointingEnabled(),
            proxy: legacyConfig.proxy ?? options.config.getProxy(),
            cwd: options.config.getWorkingDir(),
            model: legacyConfig.model ?? options.config.getModel(),
            extensionContextFilePaths: options.config.getExtensionContextFilePaths(),
          };

          activeConfig = new Config(originalConfigParams);
          
          // Initialize the new config to set up GeminiClient and ToolRegistry
          console.log('Initializing new config...');
          const { AuthType } = await import('@google/gemini-cli-core');
          const authType = options.config.getContentGeneratorConfig()?.authType || AuthType.USE_GEMINI;
          console.log('Auth type:', authType);
          await activeConfig.refreshAuth(authType);
          console.log('refreshAuth completed for new config');
        } else {
          // Even when using original config, ensure it's properly initialized
          console.log('Using original config, checking if initialized...');
          const originalClient = options.config.getGeminiClient();
          console.log('Original config geminiClient:', originalClient ? 'exists' : 'undefined');
          
          if (!originalClient) {
            console.log('Initializing original config...');
            const { AuthType } = await import('@google/gemini-cli-core');
            const authType = options.config.getContentGeneratorConfig()?.authType || AuthType.USE_GEMINI;
            console.log('Auth type:', authType);
            await activeConfig.refreshAuth(authType);
            console.log('refreshAuth completed for original config');
          } else {
            console.log('Original config already has geminiClient, skipping auth');
          }
        }

        // Get the Gemini client from the active config
        console.log('Getting GeminiClient from activeConfig...');
        geminiClient = activeConfig.getGeminiClient();
        console.log('GeminiClient:', geminiClient ? 'initialized' : 'undefined');
        
        if (!geminiClient) {
          console.log('GeminiClient is undefined! Attempting manual auth...');
          const { AuthType } = await import('@google/gemini-cli-core');
          await activeConfig.refreshAuth(AuthType.USE_GEMINI);
          geminiClient = activeConfig.getGeminiClient();
          console.log('After manual auth, GeminiClient:', geminiClient ? 'initialized' : 'still undefined');
        }
        const toolRegistry = await activeConfig.getToolRegistry();
        const geminiChat = await geminiClient.getChat();

        // Set history if provided
        if (legacyConfig?.history) {
          await geminiClient.setHistory(legacyConfig.history);
        }

        yield {
          type: 'status',
          content: 'Processing query with Gemini...',
          timestamp: new Date().toISOString()
        };

        let currentMessages = [{ role: 'user', parts: [{ text: query }] }];
        let fullResponse = '';

        while (true) {
          const functionCalls: Array<{ id?: string; name: string; args?: Record<string, unknown> }> = [];

          try {
            const responseStream = await geminiChat.sendMessageStream({
              message: currentMessages[0]?.parts || [],
              config: {
                tools: [
                  { functionDeclarations: toolRegistry.getFunctionDeclarations() },
                ],
              },
            });

            // Process streaming response with timeout and better error handling
            try {
              const streamIterator = responseStream[Symbol.asyncIterator]();
              let iterationCount = 0;
              const maxIterations = 1000; // Prevent infinite loops
              
              while (iterationCount < maxIterations) {
                try {
                  // Add timeout to prevent hanging
                  const timeoutPromise = new Promise<{ done: true; value: undefined }>((_, reject) => {
                    setTimeout(() => reject(new Error('Stream iteration timeout')), 30000);
                  });
                  
                  const iterationPromise = streamIterator.next();
                  const result = await Promise.race([iterationPromise, timeoutPromise]);
                  
                  if (result.done) {
                    console.log('Stream iteration completed normally');
                    break;
                  }
                  
                  const resp = result.value;
                  if (!resp) {
                    console.log('Received empty response, continuing...');
                    iterationCount++;
                    continue;
                  }
                  
                  try {
                    const textPart = getResponseText(resp);
                    if (textPart) {
                      fullResponse += textPart;
                      yield {
                        type: 'text',
                        content: textPart,
                        timestamp: new Date().toISOString()
                      };
                    }
                    
                    if (resp.functionCalls) {
                      functionCalls.push(...resp.functionCalls);
                    }
                  } catch (respError) {
                    console.error('Error processing individual response chunk:', respError);
                    yield {
                      type: 'error',
                      content: `Response processing error: ${(respError as Error).message}`,
                      history: await geminiClient.getHistory().catch(() => legacyConfig?.history || []),
                      timestamp: new Date().toISOString()
                    };
                    break; // Exit iteration on processing error
                  }
                  
                  iterationCount++;
                } catch (iterError) {
                  console.error('Error in single iteration:', iterError);
                  const errorMessage = (iterError as Error).message || String(iterError);
                  
                  // Check if this is a termination error
                  if (errorMessage.includes('terminated') || errorMessage.includes('closed')) {
                    console.log('Stream was terminated, ending iteration gracefully');
                    break;
                  }
                  
                  // For other errors, yield error and continue
                  yield {
                    type: 'error',
                    content: `Stream iteration error: ${errorMessage}`,
                    history: await geminiClient.getHistory().catch(() => legacyConfig?.history || []),
                    timestamp: new Date().toISOString()
                  };
                  break;
                }
              }
              
              if (iterationCount >= maxIterations) {
                console.warn('Stream iteration reached maximum iterations, stopping');
                yield {
                  type: 'status',
                  content: 'Stream processing reached maximum iterations',
                  timestamp: new Date().toISOString()
                };
              }
              
            } catch (streamIterationError) {
              console.error('Error iterating over response stream:', streamIterationError);
              const errorMessage = (streamIterationError as Error).message || String(streamIterationError);
              
              // Handle specific termination errors more gracefully
              if (errorMessage.includes('terminated') || errorMessage.includes('closed')) {
                console.log('Stream was terminated, continuing with available data');
                yield {
                  type: 'status',
                  content: 'Stream connection was terminated, continuing with available data',
                  timestamp: new Date().toISOString()
                };
              } else {
                yield {
                  type: 'error',
                  content: `Stream iteration error: ${errorMessage}`,
                  history: await geminiClient.getHistory().catch(() => legacyConfig?.history || []),
                  timestamp: new Date().toISOString()
                };
                break; // Exit the main loop on unrecoverable stream errors
              }
            }
          } catch (streamError) {
            console.error('Error in sendMessageStream:', streamError);
            yield {
              type: 'error',
              content: `Stream error: ${(streamError as Error).message}`,
              history: await geminiClient.getHistory().catch(() => legacyConfig?.history || []),
              timestamp: new Date().toISOString()
            };
            break; // Exit the main loop on stream creation errors
          }

          // Handle function calls if any
          if (functionCalls.length > 0) {
            try {
              console.log(`Starting execution of ${functionCalls.length} tool call(s)`);
              yield {
                type: 'status',
                content: `Executing ${functionCalls.length} tool call(s)...`,
                timestamp: new Date().toISOString()
              };

              const toolResponseParts: any[] = [];

              for (const fc of functionCalls) {
                try {
                  console.log(`Executing tool: ${fc.name} with args:`, fc.args);
                  
                  const callId = fc.id ?? `${fc.name}-${Date.now()}`;
                  const requestInfo = {
                    callId,
                    name: fc.name,
                    args: fc.args ?? {},
                    isClientInitiated: false,
                  };

                  const { executeToolCall } = await import('@google/gemini-cli-core');
                  const toolResponse = await executeToolCall(
                    activeConfig,
                    requestInfo,
                    toolRegistry,
                    new AbortController().signal
                  );

                  console.log(`Tool ${fc.name} completed. Error: ${toolResponse.error?.message || 'none'}, Has response: ${!!toolResponse.responseParts}`);

                  if (toolResponse.error) {
                    console.error(`Tool execution error for ${fc.name}:`, toolResponse.error);
                    yield {
                      type: 'error',
                      content: `Tool execution error: ${toolResponse.error.message}`,
                      history: await geminiClient.getHistory().catch(() => legacyConfig?.history || []),
                      timestamp: new Date().toISOString()
                    };
                    // Continue with other tools rather than returning
                  }

                  if (toolResponse.responseParts) {
                    const parts = Array.isArray(toolResponse.responseParts)
                      ? toolResponse.responseParts
                      : [toolResponse.responseParts];
                    for (const part of parts) {
                      if (typeof part === 'string') {
                        toolResponseParts.push({ text: part });
                      } else if (part) {
                        toolResponseParts.push(part);
                      }
                    }
                  }
                } catch (toolError) {
                  console.error(`Critical error executing tool ${fc.name}:`, toolError);
                  yield {
                    type: 'error',
                    content: `Tool execution failed: ${(toolError as Error).message}`,
                    history: await geminiClient.getHistory().catch(() => legacyConfig?.history || []),
                    timestamp: new Date().toISOString()
                  };
                  // Continue with other tools rather than returning
                }
              }

              console.log(`All tools completed. Response parts count: ${toolResponseParts.length}`);
              currentMessages = [{ role: 'user', parts: toolResponseParts }];
            } catch (toolGroupError) {
              console.error('Critical error in tool execution group:', toolGroupError);
              yield {
                type: 'error',
                content: `Tool group execution failed: ${(toolGroupError as Error).message}`,
                history: await geminiClient.getHistory().catch(() => legacyConfig?.history || []),
                timestamp: new Date().toISOString()
              };
              return;
            }
          } else {
            // No more function calls, we're done
            console.log('No more function calls, conversation complete');
            break;
          }
        }

        // Yield final response with history
        const finalHistory = await geminiClient.getHistory();
        yield {
          type: 'final',
          content: fullResponse || 'Query processed successfully',
          history: finalHistory,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        console.error('Error processing query:', error);
        // Try to get history even on error
        let errorHistory;
        try {
          errorHistory = await geminiClient.getHistory();
        } catch {
          // If we can't get history, that's okay
          errorHistory = legacyConfig?.history || [];
        }
        yield {
          type: 'error',
          content: (error as Error).message,
          history: errorHistory,
          timestamp: new Date().toISOString()
        };
      }
    };

    // Register the service
    const service = await server.registerService({
      id: options.serviceId,
      name: 'Gemini CLI Agent Service',
      description: 'Remote access to Gemini CLI agent with streaming responses',
      config: {
        visibility: 'public',
        require_context: false
      },
      chat
    });

    console.log(`✅ Service registered with ID: ${service.id}`);
    console.log(`🌐 Service URL: ${options.serverUrl}/${server.config.workspace}/services/${options.serviceId}/chat`);
    console.log(`🚀 Service is now running. Press Ctrl+C to stop.`);
    
    // Keep the service running
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down service...');
      process.exit(0);
    });

    // Keep alive
    await new Promise(() => {});
    
  } catch (error) {
    console.error(`❌ Failed to register service: ${error}`);
    process.exit(1);
  }
}

function getResponseText(response: any) {
  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts.length > 0
    ) {
      // Skip thought parts in headless mode
      const thoughtPart = candidate.content.parts[0];
      if (thoughtPart?.thought) {
        return null;
      }
      return candidate.content.parts
        .filter((part: any) => part.text)
        .map((part: any) => part.text)
        .join('');
    }
  }
  return null;
}
