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
import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import { loadExtensions } from './config/extension.js';
import { cleanupCheckpoints, registerCleanup } from './utils/cleanup.js';
import { getCliVersion } from './utils/version.js';
import {
  Config,
  sessionId,
  logUserPrompt,
  AuthType,
  getOauthClient,
  logIdeConnection,
  IdeConnectionEvent,
  IdeConnectionType,
  recordStartupPerformance,
  isPerformanceMonitoringActive,
  startGlobalMemoryMonitoring,
  recordCurrentMemoryUsage,
} from '@google/gemini-cli-core';
import { validateAuthMethod } from './config/auth.js';
import { setMaxSizedBoxDebugging } from './ui/components/shared/MaxSizedBox.js';
import { validateNonInteractiveAuth } from './validateNonInterActiveAuth.js';
import { detectAndEnableKittyProtocol } from './ui/utils/kittyProtocolDetector.js';
import { checkForUpdates } from './ui/utils/updateCheck.js';
import { handleAutoUpdate } from './utils/handleAutoUpdate.js';
import { appEvents, AppEvent } from './utils/events.js';
import { SettingsContext } from './ui/contexts/SettingsContext.js';

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

  if (process.env['GEMINI_CLI_NO_RELAUNCH']) {
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
import { runZedIntegration } from './zed-integration/zedIntegration.js';

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

export async function startInteractiveUI(
  config: Config,
  settings: LoadedSettings,
  startupWarnings: string[],
  workspaceRoot: string,
) {
  const version = await getCliVersion();
  // Detect and enable Kitty keyboard protocol once at startup
  await detectAndEnableKittyProtocol();
  setWindowTitle(basename(workspaceRoot), settings);
  const instance = render(
    <React.StrictMode>
      <SettingsContext.Provider value={settings}>
        <AppWrapper
          config={config}
          settings={settings}
          startupWarnings={startupWarnings}
          version={version}
        />
      </SettingsContext.Provider>
    </React.StrictMode>,
    { exitOnCtrlC: false, isScreenReaderEnabled: config.getScreenReader() },
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
}

export async function main() {
  setupUnhandledRejectionHandler();
  const startupStart = performance.now();
  const workspaceRoot = process.cwd();

  // Settings loading phase
  const settingsStart = performance.now();
  const settings = loadSettings(workspaceRoot);
  const settingsEnd = performance.now();
  const settingsDuration = settingsEnd - settingsStart;

  // Cleanup phase
  const cleanupStart = performance.now();
  await cleanupCheckpoints();
  const cleanupEnd = performance.now();
  const cleanupDuration = cleanupEnd - cleanupStart;

  if (settings.errors.length > 0) {
    for (const error of settings.errors) {
      let errorMessage = `Error in ${error.path}: ${error.message}`;
      if (!process.env['NO_COLOR']) {
        errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
      }
      console.error(errorMessage);
      console.error(`Please fix ${error.path} and try again.`);
    }
    process.exit(1);
  }

  const argv = await parseArguments();
  
  // Extensions loading phase
  const extensionsStart = performance.now();
  const extensions = loadExtensions(workspaceRoot);
  const extensionsEnd = performance.now();
  const extensionsDuration = extensionsEnd - extensionsStart;

  // CLI config loading phase
  const configStart = performance.now();
  const config = await loadCliConfig(
    settings.merged,
    extensions,
    sessionId,
    argv,
  );
  const configEnd = performance.now();
  const configDuration = configEnd - configStart;

  // Initialize memory monitoring if performance monitoring is enabled
  if (isPerformanceMonitoringActive()) {
    startGlobalMemoryMonitoring(config, 10000); // Monitor every 10 seconds
    recordCurrentMemoryUsage(config, 'startup_post_config');
  }

  const consolePatcher = new ConsolePatcher({
    stderr: true,
    debugMode: config.getDebugMode(),
  });
  consolePatcher.patch();
  registerCleanup(consolePatcher.cleanup);

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
    if (process.env['CLOUD_SHELL'] === 'true') {
      settings.setValue(
        SettingScope.User,
        'selectedAuthType',
        AuthType.CLOUD_SHELL,
      );
    }
  }

  setMaxSizedBoxDebugging(config.getDebugMode());

  // File service initialization phase
  const fileServiceStart = performance.now();
  config.getFileService();
  const fileServiceEnd = performance.now();
  const fileServiceDuration = fileServiceEnd - fileServiceStart;

  // Git service initialization phase
  let gitServiceDuration = 0;
  if (config.getCheckpointingEnabled()) {
    const gitServiceStart = performance.now();
    try {
      await config.getGitService();
    } catch (err) {
      // Log a warning if the git service fails to initialize, so the user knows checkpointing may not work.
      console.warn(
        `Warning: Could not initialize git service. Checkpointing may not be available. Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const gitServiceEnd = performance.now();
    gitServiceDuration = gitServiceEnd - gitServiceStart;
  }

  if (config.getIdeMode()) {
    await config.getIdeClient().connect();
    logIdeConnection(config, new IdeConnectionEvent(IdeConnectionType.START));
  }

  // Load custom themes from settings
  themeManager.loadCustomThemes(settings.merged.customThemes);

  // Theme loading phase
  const themeStart = performance.now();
  if (settings.merged.theme) {
    if (!themeManager.setActiveTheme(settings.merged.theme)) {
      // If the theme is not found during initial load, log a warning and continue.
      // The useThemeCommand hook in App.tsx will handle opening the dialog.
      console.warn(`Warning: Theme "${settings.merged.theme}" not found.`);
    }
  }
  const themeEnd = performance.now();
  const themeDuration = themeEnd - themeStart;

  // hop into sandbox if we are outside and sandboxing is enabled
  if (!process.env['SANDBOX']) {
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
          const authStart = performance.now();
          const err = validateAuthMethod(settings.merged.selectedAuthType);
          if (err) {
            throw new Error(err);
          }
          await config.refreshAuth(settings.merged.selectedAuthType);
          const authEnd = performance.now();
          const authDuration = authEnd - authStart;

          // Record authentication performance if monitoring is active
          if (isPerformanceMonitoringActive()) {
            recordStartupPerformance(config, 'authentication', authDuration, {
              auth_type: settings.merged.selectedAuthType,
            });
          }
        } catch (err) {
          console.error('Error authenticating:', err);
          process.exit(1);
        }
      }
      let stdinData = '';
      if (!process.stdin.isTTY) {
        stdinData = await readStdin();
      }

      // This function is a copy of the one from sandbox.ts
      // It is moved here to decouple sandbox.ts from the CLI's argument structure.
      const injectStdinIntoArgs = (
        args: string[],
        stdinData?: string,
      ): string[] => {
        const finalArgs = [...args];
        if (stdinData) {
          const promptIndex = finalArgs.findIndex(
            (arg) => arg === '--prompt' || arg === '-p',
          );
          if (promptIndex > -1 && finalArgs.length > promptIndex + 1) {
            // If there's a prompt argument, prepend stdin to it
            finalArgs[promptIndex + 1] =
              `${stdinData}\n\n${finalArgs[promptIndex + 1]}`;
          } else {
            // If there's no prompt argument, add stdin as the prompt
            finalArgs.push('--prompt', stdinData);
          }
        }
        return finalArgs;
      };

      const sandboxArgs = injectStdinIntoArgs(process.argv, stdinData);

      const sandboxStart = performance.now();
      await start_sandbox(sandboxConfig, memoryArgs, config, sandboxArgs);
      const sandboxEnd = performance.now();
      const sandboxDuration = sandboxEnd - sandboxStart;

      // Record sandbox performance if monitoring is active
      if (isPerformanceMonitoringActive()) {
        recordStartupPerformance(config, 'sandbox_setup', sandboxDuration, {
          sandbox_command: sandboxConfig.command,
        });
      }

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

  // Initialize config before any authentication or UI operations
  await config.initialize();

  if (
    settings.merged.selectedAuthType === AuthType.LOGIN_WITH_GOOGLE &&
    config.isBrowserLaunchSuppressed()
  ) {
    // Do oauth before app renders to make copying the link possible.
    await getOauthClient(settings.merged.selectedAuthType, config);
  }

  if (config.getExperimentalZedIntegration()) {
    return runZedIntegration(config, settings, extensions, argv);
  }

  let input = config.getQuestion();
  const startupWarnings = [
    ...(await getStartupWarnings()),
    ...(await getUserStartupWarnings(workspaceRoot)),
  ];

  // Record all startup performance metrics if monitoring is active
  if (isPerformanceMonitoringActive()) {
    recordStartupPerformance(config, 'settings_loading', settingsDuration, {
      settings_sources: 3, // system + user + workspace
      errors_count: settings.errors.length,
    });

    recordStartupPerformance(config, 'cleanup', cleanupDuration);

    recordStartupPerformance(config, 'extensions_loading', extensionsDuration, {
      extensions_count: extensions.length,
    });

    recordStartupPerformance(config, 'config_loading', configDuration, {
      auth_type: settings.merged.selectedAuthType ?? 'none',
      telemetry_enabled: config.getTelemetryEnabled(),
    });

    recordStartupPerformance(config, 'file_service_init', fileServiceDuration);

    if (gitServiceDuration > 0) {
      recordStartupPerformance(config, 'git_service_init', gitServiceDuration);
    }

    recordStartupPerformance(config, 'theme_loading', themeDuration, {
      theme_name: settings.merged.theme ?? 'default',
    });

    const totalStartupDuration = performance.now() - startupStart;
    recordStartupPerformance(config, 'total_startup', totalStartupDuration, {
      is_tty: process.stdin.isTTY,
      has_question: (input?.length ?? 0) > 0,
    });
  }
  // Render UI, passing necessary config values. Check that there is no command line question.
  if (config.isInteractive()) {
    await startInteractiveUI(config, settings, startupWarnings, workspaceRoot);
    return;
  }
  // If not a TTY, read from stdin
  // This is for cases where the user pipes input directly into the command
  if (!process.stdin.isTTY) {
    const stdinData = await readStdin();
    if (stdinData) {
      input = `${stdinData}\n\n${input}`;
    }
  }
  if (!input) {
    console.error(
      `No input provided via stdin. Input can be provided by piping data into gemini or using the --prompt option.`,
    );
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

  await runNonInteractive(nonInteractiveConfig, input, prompt_id);
  process.exit(0);
}

function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.hideWindowTitle) {
    const windowTitle = (
      process.env['CLI_TITLE'] || `Gemini - ${title}`
    ).replace(
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
