/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { AppContainer } from './ui/AppContainer.js';
import { loadCliConfig, parseArguments } from './config/config.js';
import * as cliConfig from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { basename } from 'node:path';
import v8 from 'node:v8';
import os from 'node:os';
import dns from 'node:dns';
import { start_sandbox } from './utils/sandbox.js';
import type { DnsResolutionOrder, LoadedSettings } from './config/settings.js';
import {
  loadTrustedFolders,
  type TrustedFoldersError,
} from './config/trustedFolders.js';
import { loadSettings, SettingScope } from './config/settings.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { getUserStartupWarnings } from './utils/userStartupWarnings.js';
import { ConsolePatcher } from './ui/utils/ConsolePatcher.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import {
  cleanupCheckpoints,
  registerCleanup,
  registerSyncCleanup,
  runExitCleanup,
  registerTelemetryConfig,
} from './utils/cleanup.js';
import {
  type Config,
  type ResumedSessionData,
  type OutputPayload,
  type ConsoleLogPayload,
  type UserFeedbackPayload,
  sessionId,
  logUserPrompt,
  AuthType,
  getOauthClient,
  UserPromptEvent,
  debugLogger,
  recordSlowRender,
  coreEvents,
  CoreEvent,
  createWorkingStdio,
  patchStdio,
  writeToStdout,
  writeToStderr,
  disableMouseEvents,
  enableMouseEvents,
  enterAlternateScreen,
  disableLineWrapping,
  shouldEnterAlternateScreen,
  startupProfiler,
  ExitCodes,
  SessionStartSource,
  SessionEndReason,
  getVersion,
} from '@google/gemini-cli-core';
import {
  initializeApp,
  type InitializationResult,
} from './core/initializer.js';
import { validateAuthMethod } from './config/auth.js';
import { runZedIntegration } from './zed-integration/zedIntegration.js';
import { cleanupExpiredSessions } from './utils/sessionCleanup.js';
import { validateNonInteractiveAuth } from './validateNonInterActiveAuth.js';
import { checkForUpdates } from './ui/utils/updateCheck.js';
import { handleAutoUpdate } from './utils/handleAutoUpdate.js';
import { appEvents, AppEvent } from './utils/events.js';
import { SessionSelector } from './utils/sessionUtils.js';
import { SettingsContext } from './ui/contexts/SettingsContext.js';
import { MouseProvider } from './ui/contexts/MouseContext.js';
import { StreamingState } from './ui/types.js';
import { computeTerminalTitle } from './utils/windowTitle.js';

import { SessionStatsProvider } from './ui/contexts/SessionContext.js';
import { VimModeProvider } from './ui/contexts/VimModeContext.js';
import { KeypressProvider } from './ui/contexts/KeypressContext.js';
import { useKittyKeyboardProtocol } from './ui/hooks/useKittyKeyboardProtocol.js';
import {
  relaunchAppInChildProcess,
  relaunchOnExitCode,
} from './utils/relaunch.js';
import { loadSandboxConfig } from './config/sandboxConfig.js';
import { deleteSession, listSessions } from './utils/sessions.js';
import { createPolicyUpdater } from './config/policy.js';
import { ScrollProvider } from './ui/contexts/ScrollProvider.js';
import { isAlternateBufferEnabled } from './ui/hooks/useAlternateBuffer.js';

import { setupTerminalAndTheme } from './utils/terminalTheme.js';
import { profiler } from './ui/components/DebugProfiler.js';

const SLOW_RENDER_MS = 200;

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
  debugLogger.warn(
    `Invalid value for dnsResolutionOrder in settings: "${order}". Using default "${defaultValue}".`,
  );
  return defaultValue;
}

export function getNodeMemoryArgs(isDebugMode: boolean): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(
    heapStats.heap_size_limit / 1024 / 1024,
  );

  // Set target to 50% of total memory
  const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);
  if (isDebugMode) {
    debugLogger.debug(
      `Current heap size ${currentMaxOldSpaceSizeMb.toFixed(2)} MB`,
    );
  }

  if (process.env['GEMINI_CLI_NO_RELAUNCH']) {
    return [];
  }

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    if (isDebugMode) {
      debugLogger.debug(
        `Need to relaunch with more memory: ${targetMaxOldSpaceSizeInMB.toFixed(2)} MB`,
      );
    }
    return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
  }

  return [];
}

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
    debugLogger.error(errorMessage);
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
  workspaceRoot: string = process.cwd(),
  resumedSessionData: ResumedSessionData | undefined,
  initializationResult: InitializationResult,
) {
  // Never enter Ink alternate buffer mode when screen reader mode is enabled
  // as there is no benefit of alternate buffer mode when using a screen reader
  // and the Ink alternate buffer mode requires line wrapping harmful to
  // screen readers.
  const useAlternateBuffer = shouldEnterAlternateScreen(
    isAlternateBufferEnabled(settings),
    config.getScreenReader(),
  );
  const mouseEventsEnabled = useAlternateBuffer;
  if (mouseEventsEnabled) {
    enableMouseEvents();
    registerCleanup(() => {
      disableMouseEvents();
    });
  }

  const version = await getVersion();
  setWindowTitle(basename(workspaceRoot), settings);

  const consolePatcher = new ConsolePatcher({
    onNewMessage: (msg) => {
      coreEvents.emitConsoleLog(msg.type, msg.content);
    },
    debugMode: config.getDebugMode(),
  });
  consolePatcher.patch();
  registerCleanup(consolePatcher.cleanup);

  const { stdout: inkStdout, stderr: inkStderr } = createWorkingStdio();

  // Create wrapper component to use hooks inside render
  const AppWrapper = () => {
    useKittyKeyboardProtocol();
    return (
      <SettingsContext.Provider value={settings}>
        <KeypressProvider
          config={config}
          debugKeystrokeLogging={settings.merged.general.debugKeystrokeLogging}
        >
          <MouseProvider
            mouseEventsEnabled={mouseEventsEnabled}
            debugKeystrokeLogging={
              settings.merged.general.debugKeystrokeLogging
            }
          >
            <ScrollProvider>
              <SessionStatsProvider>
                <VimModeProvider settings={settings}>
                  <AppContainer
                    config={config}
                    startupWarnings={startupWarnings}
                    version={version}
                    resumedSessionData={resumedSessionData}
                    initializationResult={initializationResult}
                  />
                </VimModeProvider>
              </SessionStatsProvider>
            </ScrollProvider>
          </MouseProvider>
        </KeypressProvider>
      </SettingsContext.Provider>
    );
  };

  const instance = render(
    process.env['DEBUG'] ? (
      <React.StrictMode>
        <AppWrapper />
      </React.StrictMode>
    ) : (
      <AppWrapper />
    ),
    {
      stdout: inkStdout,
      stderr: inkStderr,
      stdin: process.stdin,
      exitOnCtrlC: false,
      isScreenReaderEnabled: config.getScreenReader(),
      onRender: ({ renderTime }: { renderTime: number }) => {
        if (renderTime > SLOW_RENDER_MS) {
          recordSlowRender(config, renderTime);
        }
        profiler.reportFrameRendered();
      },
      patchConsole: false,
      alternateBuffer: useAlternateBuffer,
      incrementalRendering:
        settings.merged.ui.incrementalRendering !== false && useAlternateBuffer,
    },
  );

  checkForUpdates(settings)
    .then((info) => {
      handleAutoUpdate(info, settings, config.getProjectRoot());
    })
    .catch((err) => {
      // Silently ignore update check errors.
      if (config.getDebugMode()) {
        debugLogger.warn('Update check failed:', err);
      }
    });

  registerCleanup(() => instance.unmount());
}

export async function main() {
  const cliStartupHandle = startupProfiler.start('cli_startup');
  const cleanupStdio = patchStdio();
  registerSyncCleanup(() => {
    // This is needed to ensure we don't lose any buffered output.
    initializeOutputListenersAndFlush();
    cleanupStdio();
  });

  setupUnhandledRejectionHandler();
  const loadSettingsHandle = startupProfiler.start('load_settings');
  const settings = loadSettings();
  loadSettingsHandle?.end();

  // Report settings errors once during startup
  settings.errors.forEach((error) => {
    coreEvents.emitFeedback('warning', error.message);
  });

  const trustedFolders = loadTrustedFolders();
  trustedFolders.errors.forEach((error: TrustedFoldersError) => {
    coreEvents.emitFeedback(
      'warning',
      `Error in ${error.path}: ${error.message}`,
    );
  });

  await cleanupCheckpoints();

  const parseArgsHandle = startupProfiler.start('parse_arguments');
  const argv = await parseArguments(settings.merged);
  parseArgsHandle?.end();

  // Check for invalid input combinations early to prevent crashes
  if (argv.promptInteractive && !process.stdin.isTTY) {
    writeToStderr(
      'Error: The --prompt-interactive flag cannot be used when input is piped from stdin.\n',
    );
    await runExitCleanup();
    process.exit(ExitCodes.FATAL_INPUT_ERROR);
  }

  const isDebugMode = cliConfig.isDebugMode(argv);
  const consolePatcher = new ConsolePatcher({
    stderr: true,
    debugMode: isDebugMode,
    onNewMessage: (msg) => {
      coreEvents.emitConsoleLog(msg.type, msg.content);
    },
  });
  consolePatcher.patch();
  registerCleanup(consolePatcher.cleanup);

  dns.setDefaultResultOrder(
    validateDnsResolutionOrder(settings.merged.advanced.dnsResolutionOrder),
  );

  // Set a default auth type if one isn't set or is set to a legacy type
  if (
    !settings.merged.security.auth.selectedType ||
    settings.merged.security.auth.selectedType === AuthType.LEGACY_CLOUD_SHELL
  ) {
    if (
      process.env['CLOUD_SHELL'] === 'true' ||
      process.env['GEMINI_CLI_USE_COMPUTE_ADC'] === 'true'
    ) {
      settings.setValue(
        SettingScope.User,
        'selectedAuthType',
        AuthType.COMPUTE_ADC,
      );
    }
  }

  const partialConfig = await loadCliConfig(settings.merged, sessionId, argv, {
    projectHooks: settings.workspace.settings.hooks,
  });

  // Refresh auth to fetch remote admin settings from CCPA and before entering
  // the sandbox because the sandbox will interfere with the Oauth2 web
  // redirect.
  if (
    settings.merged.security.auth.selectedType &&
    !settings.merged.security.auth.useExternal
  ) {
    try {
      if (partialConfig.isInteractive()) {
        const err = validateAuthMethod(
          settings.merged.security.auth.selectedType,
        );
        if (err) {
          throw new Error(err);
        }

        await partialConfig.refreshAuth(
          settings.merged.security.auth.selectedType,
        );
      } else {
        const authType = await validateNonInteractiveAuth(
          settings.merged.security.auth.selectedType,
          settings.merged.security.auth.useExternal,
          partialConfig,
          settings,
        );
        await partialConfig.refreshAuth(authType);
      }
    } catch (err) {
      debugLogger.error('Error authenticating:', err);
      await runExitCleanup();
      process.exit(ExitCodes.FATAL_AUTHENTICATION_ERROR);
    }
  }

  const remoteAdminSettings = partialConfig.getRemoteAdminSettings();
  // Set remote admin settings if returned from CCPA.
  if (remoteAdminSettings) {
    settings.setRemoteAdminSettings(remoteAdminSettings);
  }

  // hop into sandbox if we are outside and sandboxing is enabled
  if (!process.env['SANDBOX']) {
    const memoryArgs = settings.merged.advanced.autoConfigureMemory
      ? getNodeMemoryArgs(isDebugMode)
      : [];
    const sandboxConfig = await loadSandboxConfig(settings.merged, argv);
    // We intentionally omit the list of extensions here because extensions
    // should not impact auth or setting up the sandbox.
    // TODO(jacobr): refactor loadCliConfig so there is a minimal version
    // that only initializes enough config to enable refreshAuth or find
    // another way to decouple refreshAuth from requiring a config.

    if (sandboxConfig) {
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

      await relaunchOnExitCode(() =>
        start_sandbox(sandboxConfig, memoryArgs, partialConfig, sandboxArgs),
      );
      await runExitCleanup();
      process.exit(ExitCodes.SUCCESS);
    } else {
      // Relaunch app so we always have a child process that can be internally
      // restarted if needed.
      await relaunchAppInChildProcess(memoryArgs, []);
    }
  }

  // We are now past the logic handling potentially launching a child process
  // to run Gemini CLI. It is now safe to perform expensive initialization that
  // may have side effects.
  {
    const loadConfigHandle = startupProfiler.start('load_cli_config');
    const config = await loadCliConfig(settings.merged, sessionId, argv, {
      projectHooks: settings.workspace.settings.hooks,
    });
    loadConfigHandle?.end();

    if (config.isInteractive() && config.storage && config.getDebugMode()) {
      const { registerActivityLogger } = await import(
        './utils/activityLogger.js'
      );
      registerActivityLogger(config);
    }

    // Register config for telemetry shutdown
    // This ensures telemetry (including SessionEnd hooks) is properly flushed on exit
    registerTelemetryConfig(config);

    const policyEngine = config.getPolicyEngine();
    const messageBus = config.getMessageBus();
    createPolicyUpdater(policyEngine, messageBus);

    // Register SessionEnd hook to fire on graceful exit
    // This runs before telemetry shutdown in runExitCleanup()
    registerCleanup(async () => {
      await config.getHookSystem()?.fireSessionEndEvent(SessionEndReason.Exit);
    });

    // Cleanup sessions after config initialization
    try {
      await cleanupExpiredSessions(config, settings.merged);
    } catch (e) {
      debugLogger.error('Failed to cleanup expired sessions:', e);
    }

    if (config.getListExtensions()) {
      debugLogger.log('Installed extensions:');
      for (const extension of config.getExtensions()) {
        debugLogger.log(`- ${extension.name}`);
      }
      await runExitCleanup();
      process.exit(ExitCodes.SUCCESS);
    }

    // Handle --list-sessions flag
    if (config.getListSessions()) {
      // Attempt auth for summary generation (gracefully skips if not configured)
      const authType = settings.merged.security.auth.selectedType;
      if (authType) {
        try {
          await config.refreshAuth(authType);
        } catch (e) {
          // Auth failed - continue without summary generation capability
          debugLogger.debug(
            'Auth failed for --list-sessions, summaries may not be generated:',
            e,
          );
        }
      }

      await listSessions(config);
      await runExitCleanup();
      process.exit(ExitCodes.SUCCESS);
    }

    // Handle --delete-session flag
    const sessionToDelete = config.getDeleteSession();
    if (sessionToDelete) {
      await deleteSession(config, sessionToDelete);
      await runExitCleanup();
      process.exit(ExitCodes.SUCCESS);
    }

    const wasRaw = process.stdin.isRaw;
    if (config.isInteractive() && !wasRaw && process.stdin.isTTY) {
      // Set this as early as possible to avoid spurious characters from
      // input showing up in the output.
      process.stdin.setRawMode(true);

      if (
        shouldEnterAlternateScreen(
          isAlternateBufferEnabled(settings),
          config.getScreenReader(),
        )
      ) {
        enterAlternateScreen();
        disableLineWrapping();

        // Ink will cleanup so there is no need for us to manually cleanup.
      }

      // This cleanup isn't strictly needed but may help in certain situations.
      process.on('SIGTERM', () => {
        process.stdin.setRawMode(wasRaw);
      });
      process.on('SIGINT', () => {
        process.stdin.setRawMode(wasRaw);
      });
    }

    await setupTerminalAndTheme(config, settings);

    const initAppHandle = startupProfiler.start('initialize_app');
    const initializationResult = await initializeApp(config, settings);
    initAppHandle?.end();

    if (
      settings.merged.security.auth.selectedType ===
        AuthType.LOGIN_WITH_GOOGLE &&
      config.isBrowserLaunchSuppressed()
    ) {
      // Do oauth before app renders to make copying the link possible.
      await getOauthClient(settings.merged.security.auth.selectedType, config);
    }

    if (config.getExperimentalZedIntegration()) {
      return runZedIntegration(config, settings, argv);
    }

    let input = config.getQuestion();
    const startupWarnings = [
      ...(await getStartupWarnings()),
      ...(await getUserStartupWarnings(settings.merged)),
    ];

    // Handle --resume flag
    let resumedSessionData: ResumedSessionData | undefined = undefined;
    if (argv.resume) {
      const sessionSelector = new SessionSelector(config);
      try {
        const result = await sessionSelector.resolveSession(argv.resume);
        resumedSessionData = {
          conversation: result.sessionData,
          filePath: result.sessionPath,
        };
        // Use the existing session ID to continue recording to the same session
        config.setSessionId(resumedSessionData.conversation.sessionId);
      } catch (error) {
        coreEvents.emitFeedback(
          'error',
          `Error resuming session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        await runExitCleanup();
        process.exit(ExitCodes.FATAL_INPUT_ERROR);
      }
    }

    cliStartupHandle?.end();
    // Render UI, passing necessary config values. Check that there is no command line question.
    if (config.isInteractive()) {
      await startInteractiveUI(
        config,
        settings,
        startupWarnings,
        process.cwd(),
        resumedSessionData,
        initializationResult,
      );
      return;
    }

    await config.initialize();
    startupProfiler.flush(config);

    // If not a TTY, read from stdin
    // This is for cases where the user pipes input directly into the command
    let stdinData: string | undefined = undefined;
    if (!process.stdin.isTTY) {
      stdinData = await readStdin();
      if (stdinData) {
        input = input ? `${stdinData}\n\n${input}` : stdinData;
      }
    }

    // Fire SessionStart hook through MessageBus (only if hooks are enabled)
    // Must be called AFTER config.initialize() to ensure HookRegistry is loaded
    const sessionStartSource = resumedSessionData
      ? SessionStartSource.Resume
      : SessionStartSource.Startup;
    const result = await config
      .getHookSystem()
      ?.fireSessionStartEvent(sessionStartSource);

    if (result?.finalOutput) {
      if (result.finalOutput.systemMessage) {
        writeToStderr(result.finalOutput.systemMessage + '\n');
      }
      const additionalContext = result.finalOutput.getAdditionalContext();
      if (additionalContext) {
        // Prepend context to input (System Context -> Stdin -> Question)
        input = input ? `${additionalContext}\n\n${input}` : additionalContext;
      }
    }

    // Register SessionEnd hook for graceful exit
    registerCleanup(async () => {
      await config.getHookSystem()?.fireSessionEndEvent(SessionEndReason.Exit);
    });

    if (!input) {
      debugLogger.error(
        `No input provided via stdin. Input can be provided by piping data into gemini or using the --prompt option.`,
      );
      await runExitCleanup();
      process.exit(ExitCodes.FATAL_INPUT_ERROR);
    }

    const prompt_id = Math.random().toString(16).slice(2);
    logUserPrompt(
      config,
      new UserPromptEvent(
        input.length,
        prompt_id,
        config.getContentGeneratorConfig()?.authType,
        input,
      ),
    );

    const authType = await validateNonInteractiveAuth(
      settings.merged.security.auth.selectedType,
      settings.merged.security.auth.useExternal,
      config,
      settings,
    );
    await config.refreshAuth(authType);

    if (config.getDebugMode()) {
      debugLogger.log('Session ID: %s', sessionId);
    }

    initializeOutputListenersAndFlush();

    await runNonInteractive({
      config,
      settings,
      input,
      prompt_id,
      resumedSessionData,
    });
    // Call cleanup before process.exit, which causes cleanup to not run
    await runExitCleanup();
    process.exit(ExitCodes.SUCCESS);
  }
}

function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.ui.hideWindowTitle) {
    // Initial state before React loop starts
    const windowTitle = computeTerminalTitle({
      streamingState: StreamingState.Idle,
      isConfirming: false,
      folderName: title,
      showThoughts: !!settings.merged.ui.showStatusInTitle,
      useDynamicTitle: settings.merged.ui.dynamicWindowTitle,
    });
    writeToStdout(`\x1b]0;${windowTitle}\x07`);

    process.on('exit', () => {
      writeToStdout(`\x1b]0;\x07`);
    });
  }
}

export function initializeOutputListenersAndFlush() {
  // If there are no listeners for output, make sure we flush so output is not
  // lost.
  if (coreEvents.listenerCount(CoreEvent.Output) === 0) {
    // In non-interactive mode, ensure we drain any buffered output or logs to stderr
    coreEvents.on(CoreEvent.Output, (payload: OutputPayload) => {
      if (payload.isStderr) {
        writeToStderr(payload.chunk, payload.encoding);
      } else {
        writeToStdout(payload.chunk, payload.encoding);
      }
    });

    if (coreEvents.listenerCount(CoreEvent.ConsoleLog) === 0) {
      coreEvents.on(CoreEvent.ConsoleLog, (payload: ConsoleLogPayload) => {
        if (payload.type === 'error' || payload.type === 'warn') {
          writeToStderr(payload.content);
        } else {
          writeToStdout(payload.content);
        }
      });
    }

    if (coreEvents.listenerCount(CoreEvent.UserFeedback) === 0) {
      coreEvents.on(CoreEvent.UserFeedback, (payload: UserFeedbackPayload) => {
        if (payload.severity === 'error' || payload.severity === 'warning') {
          writeToStderr(payload.message);
        } else {
          writeToStdout(payload.message);
        }
      });
    }
  }
  coreEvents.drainBacklogs();
}
