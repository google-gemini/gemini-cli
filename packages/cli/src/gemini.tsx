/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type StartupWarning,
  WarningPriority,
  type Config,
  type ResumedSessionData,
  type WorktreeInfo,
  type OutputPayload,
  type ConsoleLogPayload,
  type UserFeedbackPayload,
  sessionId,
  logUserPrompt,
  AuthType,
  UserPromptEvent,
  coreEvents,
  CoreEvent,
  getOauthClient,
  patchStdio,
  writeToStdout,
  writeToStderr,
  shouldEnterAlternateScreen,
  startupProfiler,
  ExitCodes,
  SessionStartSource,
  SessionEndReason,
  ValidationCancelledError,
  ValidationRequiredError,
  type AdminControlsSettings,
  debugLogger,
} from '@google/gemini-cli-core';

import { loadCliConfig, parseArguments } from './config/config.js';
import * as cliConfig from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { createHash } from 'node:crypto';
import v8 from 'node:v8';
import os from 'node:os';
import dns from 'node:dns';
import { start_sandbox } from './utils/sandbox.js';
import {
  loadSettings,
  SettingScope,
  type DnsResolutionOrder,
  type LoadedSettings,
} from './config/settings.js';
import {
  loadTrustedFolders,
  type TrustedFoldersError,
} from './config/trustedFolders.js';
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
  setupSignalHandlers,
} from './utils/cleanup.js';
import { setupWorktree } from './utils/worktreeSetup.js';
import {
  cleanupToolOutputFiles,
  cleanupExpiredSessions,
} from './utils/sessionCleanup.js';
import {
  initializeApp,
  type InitializationResult,
} from './core/initializer.js';
import { validateAuthMethod } from './config/auth.js';
import { runAcpClient } from './acp/acpClient.js';
import { validateNonInteractiveAuth } from './validateNonInterActiveAuth.js';
import { appEvents, AppEvent } from './utils/events.js';
import { SessionError, SessionSelector } from './utils/sessionUtils.js';

import {
  relaunchAppInChildProcess,
  relaunchOnExitCode,
} from './utils/relaunch.js';
import { loadSandboxConfig } from './config/sandboxConfig.js';
import { deleteSession, listSessions } from './utils/sessions.js';
import { createPolicyUpdater } from './config/policy.js';
import { isAlternateBufferEnabled } from './ui/hooks/useAlternateBuffer.js';

import { setupTerminalAndTheme } from './utils/terminalTheme.js';
import { runDeferredCommand } from './deferred.js';
import { cleanupBackgroundLogs } from './utils/logCleanup.js';
import { SlashCommandConflictHandler } from './services/SlashCommandConflictHandler.js';

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
  startupWarnings: StartupWarning[],
  workspaceRoot: string = process.cwd(),
  resumedSessionData: ResumedSessionData | undefined,
  initializationResult: InitializationResult,
) {
  // Dynamically import the heavy UI module so React/Ink are only parsed when needed
  const { startInteractiveUI: doStartUI } = await import('./interactiveCli.js');
  await doStartUI(
    config,
    settings,
    startupWarnings,
    workspaceRoot,
    resumedSessionData,
    initializationResult,
  );
}

export async function main() {
  const cliStartupHandle = startupProfiler.start('cli_startup');

  // Listen for admin controls from parent process (IPC) in non-sandbox mode. In
  // sandbox mode, we re-fetch the admin controls from the server once we enter
  // the sandbox.
  // TODO: Cache settings in sandbox mode as well.
  const adminControlsListner = setupAdminControlsListener();
  registerCleanup(adminControlsListner.cleanup);

  const cleanupStdio = patchStdio();
  registerSyncCleanup(() => {
    // This is needed to ensure we don't lose any buffered output.
    initializeOutputListenersAndFlush();
    cleanupStdio();
  });

  setupUnhandledRejectionHandler();

  setupSignalHandlers();

  const slashCommandConflictHandler = new SlashCommandConflictHandler();
  slashCommandConflictHandler.start();
  registerCleanup(() => slashCommandConflictHandler.stop());

  const loadSettingsHandle = startupProfiler.start('load_settings');
  const settings = loadSettings();
  loadSettingsHandle?.end();

  // If a worktree is requested and enabled, set it up early.
  // This must be awaited before any other async tasks that depend on CWD (like loadCliConfig)
  // because setupWorktree calls process.chdir().
  const requestedWorktree = cliConfig.getRequestedWorktreeName(settings);
  let worktreeInfo: WorktreeInfo | undefined;
  if (requestedWorktree !== undefined) {
    const worktreeHandle = startupProfiler.start('setup_worktree');
    worktreeInfo = await setupWorktree(requestedWorktree || undefined);
    worktreeHandle?.end();
  }

  const cleanupOpsHandle = startupProfiler.start('cleanup_ops');
  Promise.all([
    cleanupCheckpoints(),
    cleanupToolOutputFiles(settings.merged),
    cleanupBackgroundLogs(),
  ])
    .catch((e) => {
      debugLogger.error('Early cleanup failed:', e);
    })
    .finally(() => {
      cleanupOpsHandle?.end();
    });

  const parseArgsHandle = startupProfiler.start('parse_arguments');
  const argvPromise = parseArguments(settings.merged).finally(() => {
    parseArgsHandle?.end();
  });

  const rawStartupWarningsPromise = getStartupWarnings();

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

  const argv = await argvPromise;

  if (
    (argv.allowedTools && argv.allowedTools.length > 0) ||
    (settings.merged.tools?.allowed && settings.merged.tools.allowed.length > 0)
  ) {
    coreEvents.emitFeedback(
      'warning',
      'Warning: --allowed-tools cli argument and tools.allowed in settings.json are deprecated and will be removed in 1.0: Migrate to Policy Engine: https://geminicli.com/docs/core/policy-engine/',
    );
  }

  if (
    settings.merged.tools?.exclude &&
    settings.merged.tools.exclude.length > 0
  ) {
    coreEvents.emitFeedback(
      'warning',
      'Warning: tools.exclude in settings.json is deprecated and will be removed in 1.0. Migrate to Policy Engine: https://geminicli.com/docs/core/policy-engine/',
    );
  }

  if (argv.startupMessages) {
    argv.startupMessages.forEach((msg) => {
      coreEvents.emitFeedback('info', msg);
    });
  }

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
        'security.auth.selectedType',
        AuthType.COMPUTE_ADC,
      );
    }
  }

  const partialConfig = await loadCliConfig(settings.merged, sessionId, argv, {
    projectHooks: settings.workspace.settings.hooks,
  });
  adminControlsListner.setConfig(partialConfig);

  // Refresh auth to fetch remote admin settings from CCPA and before entering
  // the sandbox because the sandbox will interfere with the Oauth2 web
  // redirect.
  let initialAuthFailed = false;
  if (!settings.merged.security.auth.useExternal && !argv.isCommand) {
    try {
      if (
        partialConfig.isInteractive() &&
        settings.merged.security.auth.selectedType
      ) {
        const err = validateAuthMethod(
          settings.merged.security.auth.selectedType,
        );
        if (err) {
          throw new Error(err);
        }

        await partialConfig.refreshAuth(
          settings.merged.security.auth.selectedType,
        );
      } else if (!partialConfig.isInteractive()) {
        const authType = await validateNonInteractiveAuth(
          settings.merged.security.auth.selectedType,
          settings.merged.security.auth.useExternal,
          partialConfig,
          settings,
        );
        await partialConfig.refreshAuth(authType);
      }
    } catch (err) {
      if (err instanceof ValidationCancelledError) {
        // User cancelled verification, exit immediately.
        await runExitCleanup();
        process.exit(ExitCodes.SUCCESS);
      }

      // If validation is required, we don't treat it as a fatal failure.
      // We allow the app to start, and the React-based ValidationDialog
      // will handle it.
      if (!(err instanceof ValidationRequiredError)) {
        debugLogger.error('Error authenticating:', err);
        initialAuthFailed = true;
      }
    }
  }

  const remoteAdminSettings = partialConfig.getRemoteAdminSettings();
  // Set remote admin settings if returned from CCPA.
  if (remoteAdminSettings) {
    settings.setRemoteAdminSettings(remoteAdminSettings);
  }

  // Run deferred command now that we have admin settings.
  await runDeferredCommand(settings.merged);

  // hop into sandbox if we are outside and sandboxing is enabled
  if (!process.env['SANDBOX'] && !argv.isCommand) {
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
      if (initialAuthFailed) {
        await runExitCleanup();
        process.exit(ExitCodes.FATAL_AUTHENTICATION_ERROR);
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

      await relaunchOnExitCode(() =>
        start_sandbox(sandboxConfig, memoryArgs, partialConfig, sandboxArgs),
      );
      await runExitCleanup();
      process.exit(ExitCodes.SUCCESS);
    } else {
      // Relaunch app so we always have a child process that can be internally
      // restarted if needed.
      await relaunchAppInChildProcess(memoryArgs, [], remoteAdminSettings);
    }
  }

  // We are now past the logic handling potentially launching a child process
  // to run Gemini CLI. It is now safe to perform expensive initialization that
  // may have side effects.
  {
    const loadConfigHandle = startupProfiler.start('load_cli_config');
    const config = await loadCliConfig(settings.merged, sessionId, argv, {
      projectHooks: settings.workspace.settings.hooks,
      worktreeSettings: worktreeInfo,
    });
    loadConfigHandle?.end();

    // Initialize storage immediately after loading config to ensure that
    // storage-related operations (like listing or resuming sessions) have
    // access to the project identifier.
    await config.storage.initialize();

    adminControlsListner.setConfig(config);

    if (config.isInteractive() && settings.merged.general.devtools) {
      const { setupInitialActivityLogger } = await import(
        './utils/devtoolsService.js'
      );
      await setupInitialActivityLogger(config);
    }

    // Register config for telemetry shutdown
    // This ensures telemetry (including SessionEnd hooks) is properly flushed on exit
    registerTelemetryConfig(config);

    const policyEngine = config.getPolicyEngine();
    const messageBus = config.getMessageBus();
    createPolicyUpdater(policyEngine, messageBus, config.storage);

    // Register SessionEnd hook to fire on graceful exit
    // This runs before telemetry shutdown in runExitCleanup()
    registerCleanup(async () => {
      await config.getHookSystem()?.fireSessionEndEvent(SessionEndReason.Exit);
    });

    // Launch cleanup expired sessions as a background task
    cleanupExpiredSessions(config, settings.merged).catch((e) => {
      debugLogger.error('Failed to cleanup expired sessions:', e);
    });

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

      // This cleanup isn't strictly needed but may help in certain situations.
      registerSyncCleanup(() => {
        process.stdin.setRawMode(wasRaw);
      });
    }

    const terminalHandle = startupProfiler.start('setup_terminal');
    await setupTerminalAndTheme(config, settings);
    terminalHandle?.end();

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

    if (config.getAcpMode()) {
      return runAcpClient(config, settings, argv);
    }

    let input = config.getQuestion();
    const useAlternateBuffer = shouldEnterAlternateScreen(
      isAlternateBufferEnabled(config),
      config.getScreenReader(),
    );
    const rawStartupWarnings = await rawStartupWarningsPromise;
    const startupWarnings: StartupWarning[] = [
      ...rawStartupWarnings.map((message) => ({
        id: `startup-${createHash('sha256').update(message).digest('hex').substring(0, 16)}`,
        message,
        priority: WarningPriority.High,
      })),
      ...(await getUserStartupWarnings(settings.merged, undefined, {
        isAlternateBuffer: useAlternateBuffer,
      })),
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
        if (
          error instanceof SessionError &&
          error.code === 'NO_SESSIONS_FOUND'
        ) {
          // No sessions to resume — start a fresh session with a warning
          startupWarnings.push({
            id: 'resume-no-sessions',
            message: error.message,
            priority: WarningPriority.High,
          });
        } else {
          coreEvents.emitFeedback(
            'error',
            `Error resuming session: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          await runExitCleanup();
          process.exit(ExitCodes.FATAL_INPUT_ERROR);
        }
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

    const hookSystem = config?.getHookSystem();
    if (hookSystem) {
      const result = await hookSystem.fireSessionStartEvent(sessionStartSource);

      if (result) {
        if (result.systemMessage) {
          writeToStderr(result.systemMessage + '\n');
        }
        const additionalContext = result.getAdditionalContext();
        if (additionalContext) {
          // Prepend context to input (System Context -> Stdin -> Question)
          const wrappedContext = `<hook_context>${additionalContext}</hook_context>`;
          input = input ? `${wrappedContext}\n\n${input}` : wrappedContext;
        }
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

    const prompt_id = sessionId;
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

function setupAdminControlsListener() {
  let pendingSettings: AdminControlsSettings | undefined;
  let config: Config | undefined;

  const messageHandler = (msg: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const message = msg as {
      type?: string;
      settings?: AdminControlsSettings;
    };
    if (message?.type === 'admin-settings' && message.settings) {
      if (config) {
        config.setRemoteAdminSettings(message.settings);
      } else {
        pendingSettings = message.settings;
      }
    }
  };

  process.on('message', messageHandler);

  return {
    setConfig: (newConfig: Config) => {
      config = newConfig;
      if (pendingSettings) {
        config.setRemoteAdminSettings(pendingSettings);
      }
    },
    cleanup: () => {
      process.off('message', messageHandler);
    },
  };
}
