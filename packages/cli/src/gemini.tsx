/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
} from '@trust-cli/trust-cli-core';
import { validateAuthMethod } from './config/auth.js';
import { setMaxSizedBoxDebugging } from './ui/components/shared/MaxSizedBox.js';

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
  // Suppress specific deprecation warnings from dependencies
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    // Skip punycode and url.parse deprecation warnings from dependencies
    if (warning.name === 'DeprecationWarning' && 
        (warning.message.includes('punycode') || warning.message.includes('url.parse'))) {
      return;
    }
    // Log other warnings normally
    console.warn(warning);
  });

  // Check for specific commands first
  const args = process.argv.slice(2);
  
  // Authentication command
  if (args[0] === 'auth') {
    const { handleAuthCommand } = await import('./commands/authCommands.js');
    
    const action = args[1] as 'login' | 'logout' | 'status';
    if (!action || !['login', 'logout', 'status'].includes(action)) {
      console.error('Usage: trust auth [login|logout|status]');
      console.error('  trust auth login --hf-token YOUR_TOKEN');
      console.error('  trust auth logout');
      console.error('  trust auth status');
      process.exit(1);
    }
    
    try {
      await handleAuthCommand({
        action,
        hfToken: args.includes('--hf-token') ? args[args.indexOf('--hf-token') + 1] : undefined,
        verbose: args.includes('--verbose') || args.includes('-v')
      });
      return;
    } catch (error) {
      console.error(`❌ Auth command failed: ${error}`);
      process.exit(1);
    }
  }
  
  // Performance monitoring command
  if (args[0] === 'performance' || args[0] === 'perf') {
    const { handlePerformanceCommand } = await import('./commands/performanceCommands.js');
    try {
      await handlePerformanceCommand({
        action: (args[1] as 'status' | 'report' | 'watch' | 'optimize') || 'status',
        verbose: args.includes('--verbose') || args.includes('-v'),
        watch: args.includes('--watch') || args.includes('-w'),
        interval: args.includes('--interval') ? parseInt(args[args.indexOf('--interval') + 1]) : 1000
      });
      return;
    } catch (error) {
      console.error(`❌ Performance command failed: ${error}`);
      process.exit(1);
    }
  }
  
  // Model management commands
  if (args[0] === 'model') {
    const { handleModelCommand } = await import('./commands/modelCommands.js');
    
    const action = args[1];
    let modelName = args[2];
    let task = args[2];
    
    // For recommend command, the second argument is the task
    if (action === 'recommend') {
      task = args[2] || 'default';
      modelName = args[3]; // For recommend, model name might be optional
    }
    
    const allFlags = args.slice(2);
    
    try {
      await handleModelCommand({
        action: action as any,
        modelName,
        task,
        ramLimit: allFlags.includes('--ram') ? parseInt(allFlags[allFlags.indexOf('--ram') + 1]) : undefined,
        verbose: allFlags.includes('--verbose') || allFlags.includes('-v'),
      });
      return;
    } catch (error) {
      console.error(`❌ Model command failed: ${error}`);
      process.exit(1);
    }
  }

  const workspaceRoot = process.cwd();
  const settings = loadSettings(workspaceRoot);
  
  console.log('DEBUG: Loaded settings selectedAuthType:', settings.merged.selectedAuthType);

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

  // set default fallback to Trust for local-first AI
  // this has to go after load cli because that's where the env is set
  if (!settings.merged.selectedAuthType) {
    console.log('DEBUG: No auth type set, defaulting to trust-local');
    settings.setValue(
      SettingScope.User,
      'selectedAuthType',
      AuthType.USE_TRUST_LOCAL,
    );
  }
  
  console.log('DEBUG: Final selectedAuthType:', settings.merged.selectedAuthType);

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
  if (!process.stdin.isTTY && !input) {
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
    process.stdout.write(`\x1b]2; Trust - ${title} \x07`);

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
  // Trust operates locally, so no API key is required for most operations
  if (!selectedAuthType) {
    console.log('No authentication method set. Using Trust local inference mode.');
  }

  selectedAuthType = selectedAuthType || AuthType.USE_TRUST_LOCAL;
  
  // Trust authentication is always available for local inference
  if (selectedAuthType === AuthType.USE_TRUST_LOCAL) {
    await nonInteractiveConfig.refreshAuth(selectedAuthType);
    return nonInteractiveConfig;
  }
  const err = validateAuthMethod(selectedAuthType);
  if (err != null) {
    console.error(err);
    process.exit(1);
  }

  await nonInteractiveConfig.refreshAuth(selectedAuthType);
  return nonInteractiveConfig;
}
