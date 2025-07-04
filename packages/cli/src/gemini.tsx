/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@google/gemini-cli-core';
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
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Import new commands
import { generateCode } from './commands/generate.js';
import { debugCode } from './commands/debug.js';
import { explainCode } from './commands/explain.js';
import { listFiles } from './commands/listFiles.js';
import { deleteFile } from './commands/deleteFile.js';
import { searchFiles } from './commands/searchFiles.js';
import { fileInfo } from './commands/fileInfo.js';
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

function getNodeMemoryArgs(config: Config): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(
    heapStats.heap_size_limit / 1024 / 1024,
  );

  // Set target to 50% of total memory
  const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);
  if (config.getDebugMode()) {
    logger.debug(
      `Current heap size ${currentMaxOldSpaceSizeMb.toFixed(2)} MB`,
    );
  }

  if (process.env.GEMINI_CLI_NO_RELAUNCH) {
    return [];
  }

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    if (config.getDebugMode()) {
      logger.debug(
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
      logger.error(errorMessage);
      logger.error(`Please fix ${error.path} and try again.`);
    }
    process.exit(1);
  }

  const extensions = loadExtensions(workspaceRoot);
  const config = await loadCliConfig(settings.merged, extensions, sessionId);

  // Handle direct CLI commands using yargs
  const argv = await yargs(hideBin(process.argv))
    .command(
      'generate <prompt>',
      'Generates code based on user prompts.',
      (yargs) => {
        yargs.positional('prompt', {
          describe: 'The prompt for code generation.',
          type: 'string',
        });
      },
      (argv) => {
        generateCode(argv.prompt as string).catch(logger.error);
      },
    )
    .command(
      'debug <codeOrPath> [errorMsg]',
      'Debugs code snippets or files with error analysis.',
      (yargs) => {
        yargs
          .positional('codeOrPath', {
            describe: 'The code snippet or path to the file to debug.',
            type: 'string',
          })
          .positional('errorMsg', {
            describe:
              'Optional error message to provide context for debugging.',
            type: 'string',
          });
      },
      (argv) => {
        debugCode(argv.codeOrPath as string, argv.errorMsg as string).catch(
          logger.error,
        );
      },
    )
    .command(
      'explain <codeOrPath>',
      'Explains code or concepts.',
      (yargs) => {
        yargs.positional('codeOrPath', {
          describe: 'The code snippet or path to the file to explain.',
          type: 'string',
        });
      },
      (argv) => {
        explainCode(argv.codeOrPath as string).catch(logger.error);
      },
    )
    .command(
      'listFiles [dirPath] [filter]',
      'Lists directory contents with filtering.',
      (yargs) => {
        yargs
          .positional('dirPath', {
            describe: 'Optional directory path to list (defaults to home).',
            type: 'string',
          })
          .positional('filter', {
            describe: 'Optional filter for file names.',
            type: 'string',
          });
      },
      (argv) => {
        listFiles(argv.dirPath as string, argv.filter as string).catch(
          logger.error,
        );
      },
    )
    .command(
      'deleteFile <pathToDelete> <confirm>',
      'Deletes files or directories with confirmation.',
      (yargs) => {
        yargs
          .positional('pathToDelete', {
            describe: 'The path to the file or directory to delete.',
            type: 'string',
          })
          .positional('confirm', {
            describe: 'Type "yes" to confirm deletion.',
            type: 'string',
          });
      },
      (argv) => {
        deleteFile(argv.pathToDelete as string, argv.confirm as string).catch(
          logger.error,
        );
      },
    )
    .command(
      'searchFiles [dirPath] <searchTerm> [searchContent]',
      'Searches for files by name or content.',
      (yargs) => {
        yargs
          .positional('dirPath', {
            describe:
              'Optional directory path to search within (defaults to home).',
            type: 'string',
          })
          .positional('searchTerm', {
            describe: 'The term to search for in file names or content.',
            type: 'string',
          })
          .positional('searchContent', {
            describe:
              'Type "yes" to search file content, otherwise only search names.',
            type: 'string',
          });
      },
      (argv) => {
        searchFiles(
          argv.dirPath as string,
          argv.searchTerm as string,
          argv.searchContent as string,
        ).catch(logger.error);
      },
    )
    .command(
      'fileInfo <filePath>',
      'Displays file metadata.',
      (yargs) => {
        yargs.positional('filePath', {
          describe: 'The path to the file to inspect.',
          type: 'string',
        });
      },
      (argv) => {
        fileInfo(argv.filePath as string).catch(logger.error);
      },
    )
    .demandCommand(1, 'You need to specify a command.')
    .help().argv;

  // If a command was executed, yargs will handle process.exit.
  // Otherwise, continue with the existing interactive/non-interactive logic.
  if (argv._.length > 0) {
    return; // A command was found and executed, exit main function.
  }

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
      logger.warn(`Warning: Theme "${settings.merged.theme}" not found.`);
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
          logger.error('Error authenticating:', err);
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
    logger.error('No input provided via stdin.');
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
  logger.error('=========================================');
  logger.error('CRITICAL: Unhandled Promise Rejection!');
  logger.error('=========================================');
  logger.error('Reason:', reason);
  logger.error('Stack trace may follow:');
  if (!(reason instanceof Error)) {
    logger.error(reason);
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
    logger.error(
      `Please set an Auth method in your ${USER_SETTINGS_PATH} OR specify GEMINI_API_KEY env variable file before running`,
    );
    process.exit(1);
  }

  selectedAuthType = selectedAuthType || AuthType.USE_GEMINI;
  const err = validateAuthMethod(selectedAuthType);
  if (err != null) {
    logger.error(err);
    process.exit(1);
  }

  await nonInteractiveConfig.refreshAuth(selectedAuthType);
  return nonInteractiveConfig;
}
