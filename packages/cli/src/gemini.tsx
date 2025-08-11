/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { AppWrapper } from './ui/App.js';
import { loadCliConfig, parseArguments } from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { basename } from 'node:path';
import v8 from 'node:v8';
import os from 'node:os';
import dns from 'node:dns';
import { spawn } from 'node:child_process';
import { start_sandbox } from './utils/sandbox.js';
import {
  DnsResolutionOrder,
  LoadedSettings,
  loadSettings,
  SettingScope,
} from './config/settings.js';
import { themeManager } from './ui/themes/theme-manager.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { getUserStartupWarnings } from './utils/userStartupWarnings.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import { loadExtensions } from './config/extension.js';
import { cleanupCheckpoints, registerCleanup } from './utils/cleanup.js';
import { getCliVersion } from './utils/version.js';
import { saveSession, loadSession, listSessions, getLatestSession, findSession } from './utils/session.js';
import {
  Config,
  sessionId,
  logUserPrompt,
  AuthType,
  getOauthClient,
  getProjectTempDir,
} from '@google/gemini-cli-core';
import { validateAuthMethod } from './config/auth.js';
import { setMaxSizedBoxDebugging } from './ui/components/shared/MaxSizedBox.js';
import { validateNonInteractiveAuth } from './validateNonInterActiveAuth.js';
import { checkForUpdates } from './ui/utils/updateCheck.js';
import { handleAutoUpdate } from './utils/handleAutoUpdate.js';
import { appEvents, AppEvent } from './utils/events.js';
import { SettingsContext } from './ui/contexts/SettingsContext.js';
import { Content } from '@google/genai';
import fs from 'fs';
import path from 'path';

let lastSessionHistory: Content[] = [];

// Function to update session history from interactive mode
export function updateSessionHistory(history: Content[]) {
  lastSessionHistory = history;
}

// Synchronous session save for immediate exits
function saveSessionSync(history: Content[]) {
  try {
    const tempDir = getProjectTempDir(process.cwd());
    const sessionsDir = path.join(tempDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `session-${timestamp}.json`;
    const filePath = path.join(sessionsDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
    console.log(`Session saved to ${filePath}`);
  } catch (error) {
    console.error('Failed to save session on exit:', error);
  }
}

// Track if we're already in the exit process to avoid double-saving
let isExiting = false;

// Handle graceful shutdown with async operations
process.on('beforeExit', async () => {
  if (!isExiting && lastSessionHistory.length > 0) {
    isExiting = true;
    try {
      await saveSession(lastSessionHistory);
    } catch (error) {
      console.error('Failed to save session on beforeExit:', error);
      // Fallback to sync save if async fails
      saveSessionSync(lastSessionHistory);
    }
  }
});

// Handle various exit signals
function handleExitSignal(signal: string) {
  return () => {
    if (!isExiting && lastSessionHistory.length > 0) {
      isExiting = true;
      console.log(`\nReceived ${signal}, saving session...`);
      saveSessionSync(lastSessionHistory);
    }
    process.exit(0);
  };
}

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', handleExitSignal('SIGINT'));

// Handle SIGTERM (termination)
process.on('SIGTERM', handleExitSignal('SIGTERM'));

// Handle SIGHUP (hang up)
process.on('SIGHUP', handleExitSignal('SIGHUP'));

// Handle SIGQUIT (quit)
process.on('SIGQUIT', handleExitSignal('SIGQUIT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (!isExiting && lastSessionHistory.length > 0) {
    isExiting = true;
    console.log('Saving session before crash...');
    saveSessionSync(lastSessionHistory);
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (!isExiting && lastSessionHistory.length > 0) {
    isExiting = true;
    console.log('Saving session before crash...');
    saveSessionSync(lastSessionHistory);
  }
  process.exit(1);
});

export function validateDnsResolutionOrder(
  order: string | undefined,
): DnsResolutionOrder {
  const defaultValue: DnsResolutionOrder = 'ipv4first';
  if (order === undefined) {
    return defaultValue;
  }
  if (order === 'ipv4first' || order === 'verbatim') {
    return order;
  }
  // We don't want to throw here, just warn and use the default.
  console.warn(
    `Invalid value for dnsResolutionOrder in settings: "${order}". Using default "${defaultValue}".`,
  );
  return defaultValue;
}

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
import { runAcpPeer } from './acp/acpPeer.js';

export function setupUnhandledRejectionHandler() {
  let unhandledRejectionOccurred = false;
  process.on('unhandledRejection', (reason, _promise) => {
    const errorMessage = `=========================================
This is an unexpected error. Please file a bug report using the /bug tool.
CRITICAL: Unhandled Promise Rejection!
=========================================
Reason: ${reason}${
      reason instanceof Error && reason.stack
        ? `
Stack trace:
${reason.stack}`
        : ''
    }`;
    appEvents.emit(AppEvent.LogError, errorMessage);
    if (!unhandledRejectionOccurred) {
      unhandledRejectionOccurred = true;
      appEvents.emit(AppEvent.OpenDebugConsole);
    }
  });
}

export async function main() {
  setupUnhandledRejectionHandler();
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

  const argv = await parseArguments();
  const extensions = loadExtensions(workspaceRoot);
  const config = await loadCliConfig(
    settings.merged,
    extensions,
    sessionId,
    argv,
  );

  dns.setDefaultResultOrder(
    validateDnsResolutionOrder(settings.merged.dnsResolutionOrder),
  );

  if (argv.promptInteractive && !process.stdin.isTTY) {
    console.error(
      'Error: The --prompt-interactive flag is not supported when piping input from stdin.',
    );
    process.exit(1);
  }

  if (config.getListExtensions()) {
    console.log('Installed extensions:');
    for (const extension of extensions) {
      console.log(`- ${extension.config.name}`);
    }
    process.exit(0);
  }

  // Set a default auth type if one isn't set.
  if (!settings.merged.selectedAuthType) {
    if (process.env.CLOUD_SHELL === 'true') {
      settings.setValue(
        SettingScope.User,
        'selectedAuthType',
        AuthType.CLOUD_SHELL,
      );
    }
  }

  setMaxSizedBoxDebugging(config.getDebugMode());

  await config.initialize();

  // Load custom themes from settings
  themeManager.loadCustomThemes(settings.merged.customThemes);

  if (settings.merged.theme) {
    if (!themeManager.setActiveTheme(settings.merged.theme)) {
      // If the theme is not found during initial load, log a warning and continue.
      // The useThemeCommand hook in App.tsx will handle opening the dialog.
      console.warn(`Warning: Theme "${settings.merged.theme}" not found.`);
    }
  }

  // hop into sandbox if we are outside and sandboxing is enabled
  if (!process.env.SANDBOX) {
    const memoryArgs = settings.merged.autoConfigureMaxOldSpaceSize
      ? getNodeMemoryArgs(config)
      : [];
    const sandboxConfig = config.getSandbox();
    if (sandboxConfig) {
      if (
        settings.merged.selectedAuthType &&
        !settings.merged.useExternalAuth
      ) {
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
      await start_sandbox(sandboxConfig, memoryArgs, config);
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
  if (
    settings.merged.selectedAuthType === AuthType.LOGIN_WITH_GOOGLE &&
    config.isBrowserLaunchSuppressed()
  ) {
    // Do oauth before app renders to make copying the link possible.
    await getOauthClient(settings.merged.selectedAuthType, config);
  }

  if (config.getExperimentalAcp()) {
    return runAcpPeer(config, settings);
  }

  let input: string = config.getQuestion() || '';
  const startupWarnings = [
    ...(await getStartupWarnings()),
    ...(await getUserStartupWarnings(workspaceRoot)),
  ];

  let initialHistory: Content[] = [];

  // Handle --resume-last flag
  if (argv.resumeLast) {
    const latestSessionId = await getLatestSession();
    if (latestSessionId) {
      const loadedHistory = await loadSession(latestSessionId);
      if (loadedHistory) {
        initialHistory = loadedHistory;
        console.log(`Resumed latest session: ${latestSessionId}`);
        input = '';
      } else {
        console.error(`Failed to load latest session ${latestSessionId}.`);
      }
    } else {
      console.error('No automatically saved sessions found to resume.');
    }
  }
  // TODO(sethtroisi): refactor to chat processor.
  else if (input.startsWith('/chat resume-auto ')) {
    const inputId = input.substring('/chat resume-auto '.length).trim();
    if (inputId) {
      const sessionId = await findSession(inputId);
      
      if (!sessionId) {
        console.error(`No session found with input: ${inputId}. Use /chat list-auto to see available sessions.`);
      } else {
        const loadedHistory = await loadSession(sessionId);
        if (loadedHistory) {
          initialHistory = loadedHistory;
          console.log(`Session ${sessionId} loaded successfully.`);
        } else {
          console.error(`Failed to load session ${sessionId}.`);
        }
      }
    } else {
      console.error('Please provide a session ID or number to resume.');
    }
    // Clear the input so it doesn't get processed as a new prompt
    input = '';
  } else if (input.startsWith('/chat list-auto')) {
    const sessions = await listSessions();
    if (sessions.length === 0) {
      console.log('No automatically saved sessions found.');
    } else {
      console.log('Automatically saved sessions:');
      sessions.forEach(
        (session: { shortId: number; fullId: string; timestamp: string }) => {
          console.log(
            `  ${session.timestamp} - ${session.fullId} - ${session.shortId} `,
          );
        },
      );
    }
    process.exit(0);
  }

  // Render UI, passing necessary config values. Check that there is no command line question.
  if (config.isInteractive()) {
    const version = await getCliVersion();
    setWindowTitle(basename(workspaceRoot), settings);
    const instance = render(
      <React.StrictMode>
        <SettingsContext.Provider value={settings}>
          <AppWrapper
            config={config}
            settings={settings}
            startupWarnings={startupWarnings}
            version={version}
            initialHistory={initialHistory}
          />
        </SettingsContext.Provider>
      </React.StrictMode>,
      { exitOnCtrlC: false },
    );

    checkForUpdates()
      .then((info) => {
        handleAutoUpdate(info, settings, config.getProjectRoot());
      })
      .catch((err) => {
        // Silently ignore update check errors.
        if (config.getDebugMode()) {
          console.error('Update check failed:', err);
        }
      });

    registerCleanup(() => instance.unmount());
    return;
  }
  // If not a TTY, read from stdin
  // This is for cases where the user pipes input directly into the command
  if (!process.stdin.isTTY) {
    input += await readStdin();
  }
  if (!input && initialHistory.length === 0) {
    console.error('No input provided via stdin.');
    process.exit(1);
  }

  const prompt_id = Math.random().toString(16).slice(2);
  logUserPrompt(config, {
    'event.name': 'user_prompt',
    'event.timestamp': new Date().toISOString(),
    prompt: input,
    prompt_id,
    auth_type: config.getContentGeneratorConfig()?.authType,
    prompt_length: input.length,
  });

  const nonInteractiveConfig = await validateNonInteractiveAuth(
    settings.merged.selectedAuthType,
    settings.merged.useExternalAuth,
    config,
  );

  try {
    lastSessionHistory = await runNonInteractive(
      nonInteractiveConfig,
      input,
      initialHistory,
      prompt_id,
    );
    
    // Save session before exiting non-interactive mode
    if (lastSessionHistory.length > 0) {
      await saveSession(lastSessionHistory);
    }
  } catch (error) {
    console.error('Error in non-interactive mode:', error);
    process.exit(1);
  }
  process.exit(0);
}

function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.hideWindowTitle) {
    const windowTitle = (process.env.CLI_TITLE || `Gemini - ${title}`).replace(
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1F\x7F]/g,
      '',
    );
    process.stdout.write(`\x1b]2;${windowTitle}\x07`);

    process.on('exit', () => {
      process.stdout.write(`\x1b]2;\x07`);
    });
  }
}
