/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Fix for Node.js environment - ImageData is not available
if (typeof globalThis.ImageData === 'undefined') {
  class MockImageData {
    data: any;
    width: number;
    height: number;
    
    constructor(data: any, width: number, height: number) {
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
    if (!options.config.getContentGeneratorConfig()) {
      // set default fallback to gemini api key
      if (process.env.GEMINI_API_KEY) {
        const settings = loadSettings(process.cwd());
        settings.setValue(SettingScope.User, 'selectedAuthType', AuthType.USE_GEMINI);
        await options.config.refreshAuth(AuthType.USE_GEMINI);
      } else {
        console.error('No Gemini API key found. Please set GEMINI_API_KEY environment variable.');
        process.exit(1);
      }
    }

    // Connect to Hypha server
    const server = await hyphaWebsocketClient.connectToServer({
      server_url: options.serverUrl,
      workspace: options.workspace,
      token: options.token
    });

    console.log(`Connected to workspace: ${server.config.workspace}`);

    // Create chat function
    const chat = async function* (query: string) {
      console.log(`Processing query: ${query}`);
      
      try {
        yield {
          type: 'status',
          content: 'Initializing Gemini client...',
          timestamp: new Date().toISOString()
        };

        // Get the Gemini client
        const geminiClient = options.config.getGeminiClient();
        const toolRegistry = await options.config.getToolRegistry();
        const geminiChat = await geminiClient.getChat();

        yield {
          type: 'status',
          content: 'Processing query with Gemini...',
          timestamp: new Date().toISOString()
        };

        let currentMessages = [{ role: 'user', parts: [{ text: query }] }];
        let fullResponse = '';

        while (true) {
          const functionCalls: any[] = [];

          const responseStream = await geminiChat.sendMessageStream({
            message: currentMessages[0]?.parts || [],
            config: {
              tools: [
                { functionDeclarations: toolRegistry.getFunctionDeclarations() },
              ],
            },
          });

          // Process streaming response
          for await (const resp of responseStream) {
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
          }

          // Handle function calls if any
          if (functionCalls.length > 0) {
            yield {
              type: 'status',
              content: `Executing ${functionCalls.length} tool call(s)...`,
              timestamp: new Date().toISOString()
            };

            const toolResponseParts: any[] = [];

            for (const fc of functionCalls) {
              const callId = fc.id ?? `${fc.name}-${Date.now()}`;
              const requestInfo = {
                callId,
                name: fc.name,
                args: fc.args ?? {},
                isClientInitiated: false,
              };

              try {
                const { executeToolCall } = await import('@google/gemini-cli-core');
                const toolResponse = await executeToolCall(
                  options.config,
                  requestInfo,
                  toolRegistry,
                  new AbortController().signal
                );

                if (toolResponse.error) {
                  yield {
                    type: 'error',
                    content: `Tool execution error: ${toolResponse.error.message}`,
                    timestamp: new Date().toISOString()
                  };
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
              } catch (error) {
                yield {
                  type: 'error',
                  content: `Tool execution failed: ${(error as Error).message}`,
                  timestamp: new Date().toISOString()
                };
              }
            }

            currentMessages = [{ role: 'user', parts: toolResponseParts }];
          } else {
            // No more function calls, we're done
            break;
          }
        }

        // Yield final response
        yield {
          type: 'final',
          content: fullResponse || 'Query processed successfully',
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        console.error('Error processing query:', error);
        yield {
          type: 'error',
          content: (error as Error).message,
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
