/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Foundational Imports ---
import React from 'react';
import { render } from 'ink';
import { basename } from 'node:path';
import v8 from 'node:v8';
import os from 'node:os';
import { spawn } from 'node:child_process';
import {
  ApprovalMode,
  Config,
  EditTool,
  shellTool,
  WriteFileTool,
  sessionId,
  logUserPrompt,
  AuthType,
  readFileTool,
} from '@google/gemini-cli-core';

// --- Local Module Imports ---
import { AppWrapper } from './ui/App.js';
import { loadCliConfig } from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { start_sandbox } from './utils/sandbox.js';
import {
  LoadedSettings,
  loadSettings,
  SettingScope,
} from './config/settings.js';
import { themeManager } from './ui/themes/theme-manager.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import { loadExtensions, Extension } from './config/extension.js';
import { cleanupCheckpoints } from './utils/cleanup.js';
import { validateAuthMethod } from './config/auth.js';
import { setMaxSizedBoxDebugging } from './ui/components/shared/MaxSizedBox.js';

// --- Arcane Constants & Colors ---
import { logger, logError } from '../../core/src/core/logger.js';

const TARGET_MEMORY_MULTIPLIER = 0.5; // 50% of total memory.

// --- Helper Spells: Memory and Process Management ---

/**
 * A spell to determine if more memory should be allocated to Node.js.
 * This incantation compares current memory limits to a target based on total system memory.
 */
function getNodeMemoryArgs(config: Config): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(
    heapStats.heap_size_limit / 1024 / 1024,
  );

  const targetMaxOldSpaceSizeInMB = Math.floor(
    totalMemoryMB * TARGET_MEMORY_MULTIPLIER,
  );

  if (config.getDebugMode()) {
    logger.debug(
      `Current heap size limit: ${currentMaxOldSpaceSizeMb.toFixed(2)} MB`,
    );
  }

  // The GEMINI_CLI_NO_RELAUNCH ward prevents infinite relaunch loops.
  if (process.env.GEMINI_CLI_NO_RELAUNCH) {
    return [];
  }

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    if (config.getDebugMode()) {
      logger.debug(
        `Relaunching to claim more memory: ${targetMaxOldSpaceSizeInMB.toFixed(2)} MB`,
      );
    }
    return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
  }

  return [];
}

/**
 * A spell to relaunch the CLI with new arguments.
 * This is used to increase memory allocation without user intervention.
 */
async function relaunchWithAdditionalArgs(additionalArgs: string[]) {
  const nodeArgs = [...additionalArgs, ...process.argv.slice(1)];
  // The GEMINI_CLI_NO_RELAUNCH ward is applied to the new process.
  const newEnv = { ...process.env, GEMINI_CLI_NO_RELAUNCH: 'true' };

  const child = spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: newEnv,
  });

  await new Promise((resolve) => child.on('close', resolve));
  process.exit(0);
}

/**
 * A spell to set the terminal window's title.
 * The incantation `\x1b]2;...\x07` is an ANSI escape sequence for this purpose.
 */
function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.hideWindowTitle) {
    process.stdout.write(`\x1b]2; Gemini - ${title} \x07`);
    process.on('exit', () => {
      // Clear the title on exit.
      process.stdout.write(`\x1b]2;\x07`);
    });
  }
}

function validateInput(input: string): boolean {
  // Reject input that contains control characters, except for whitespace.
  // This is a basic security measure to prevent command injection.
  const invalidCharRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
  if (invalidCharRegex.test(input)) {
    logger.error(
      'Invalid characters detected in input. Please use only printable characters.',
    );
    return false;
  }
  return true;
}

// --- Core Logic Spells ---

/**
 * A spell to initialize settings and handle any errors found in the scrolls.
 */
async function handleSettingsInitialization(
  workspaceRoot: string,
): Promise<LoadedSettings> {
  try {
    await cleanupCheckpoints();
    const settings = loadSettings(workspaceRoot);

    if (settings.errors.length > 0) {
      logger.error(
        'Errors were found in your configuration scrolls. The ritual cannot proceed.',
      );
      for (const error of settings.errors) {
        logger.error(
          `In ${error.path}: ${error.message}`,
          `Please mend the scroll and try again.`,
        );
      }
      process.exit(1);
    }
    return settings;
  } catch (err) {
    logger.error('An error occurred during settings initialization.', err);
    process.exit(1);
  }
}

/**
 * A spell to conjure the core configuration and initialize essential services.
 */
async function initializeCoreServices(
  settings: LoadedSettings,
  workspaceRoot: string,
) {
  try {
    const extensions = loadExtensions(workspaceRoot);
    const config = await loadCliConfig(settings.merged, extensions, sessionId);

    // A fallback enchantment to use GEMINI_API_KEY if no other auth method is chosen.
    // This must be cast after loadCliConfig, which summons the environment variables.
    if (!settings.merged.selectedAuthType && process.env.GEMINI_API_KEY) {
      settings.setValue(
        SettingScope.User,
        'selectedAuthType',
        AuthType.USE_GEMINI,
      );
    }

    setMaxSizedBoxDebugging(config.getDebugMode());

    // Initialize centralized services.
    config.getFileService();
    if (config.getCheckpointingEnabled()) {
      try {
        await config.getGitService();
      } catch {
        logger.warn(
          'Could not initialize Git service. Checkpointing may be affected.',
        );
      }
    }

    // An enchantment to load the user's chosen theme.
    if (settings.merged.theme) {
      if (!themeManager.setActiveTheme(settings.merged.theme)) {
        logger.warn(
          `Theme "${settings.merged.theme}" not found. The default theme will be used.`,
        );
      }
    }

    return { config, extensions };
  } catch (err) {
    logger.error('An error occurred during core service initialization.', err);
    process.exit(1);
  }
}

/**
 * A powerful spell to prepare the execution environment, handling sandboxing and memory.
 */
async function prepareExecutionEnvironment(
  config: Config,
  settings: LoadedSettings,
) {
  try {
    const memoryArgs = settings.merged.autoConfigureMaxOldSpaceSize
      ? getNodeMemoryArgs(config)
      : [];

    // If not already in a sandbox, and sandboxing is enabled, we must enter it.
    if (!process.env.SANDBOX) {
      const sandboxConfig = config.getSandbox();
      if (sandboxConfig) {
        // Validate authentication before entering the sandbox, as it can interfere with web redirects.
        if (settings.merged.selectedAuthType) {
          try {
            const err = validateAuthMethod(settings.merged.selectedAuthType);
            if (err) throw new Error(err);
            await config.refreshAuth(settings.merged.selectedAuthType);
          } catch (err) {
            logger.error('Authentication failed before entering the sandbox:', err);
            process.exit(1);
          }
        }
        await start_sandbox(sandboxConfig, memoryArgs);
        process.exit(0);
      } else {
        // Not in a sandbox and not entering one. Relaunch for memory if needed.
        if (memoryArgs.length > 0) {
          await relaunchWithAdditionalArgs(memoryArgs);
          process.exit(0);
        }
      }
    }
  } catch (err) {
    logger.error('An error occurred during execution environment preparation.', err);
    process.exit(1);
  }
}

/**
 * The spell to invoke the interactive TTY-based user interface.
 */
async function runInteractiveMode(
  config: Config,
  settings: LoadedSettings,
  workspaceRoot: string,
) {
  try {
    const startupWarnings = await getStartupWarnings();
    setWindowTitle(basename(workspaceRoot), settings);

    // React.StrictMode is a ward that detects potential problems in the component tree.
    // exitOnCtrlC is false because we have our own graceful shutdown handler in index.ts.
    render(
      <React.StrictMode>
        <AppWrapper
          config={config}
          settings={settings}
          startupWarnings={startupWarnings}
          validateInput={validateInput}
        />
      </React.StrictMode>,
      { exitOnCtrlC: false },
    );
  } catch (err) {
    logger.error('An error occurred during interactive mode.', err);
    process.exit(1);
  }
}

/**
 * The spell to run the CLI in non-interactive mode (for pipes and scripts).
 */
async function runNonInteractiveMode(
  config: Config,
  settings: LoadedSettings,
  extensions: Extension[],
  initialInput: string,
) {
  try {
    let input = initialInput;
    if (input.trim() === '/test-indicators') {
      logger.info('Running indicators.py tests...');
      await shellTool.run({ command: 'npm test packages/core/tests/indicators.test.ts' });
      process.exit(0);
    } else if (input.startsWith('/replace-decorator ')) {
      const parts = input.split(' ');
      if (parts.length < 4) {
        logger.error('Usage: /replace-decorator <file_path> <old_decorator> <new_decorator>');
        process.exit(1);
      }
      const filePath = parts[1];
      const oldDecorator = parts[2];
      const newDecorator = parts[3];
      logger.info(`Replacing decorator in ${filePath}: ${oldDecorator} with ${newDecorator}...`);
      await EditTool.run({
        file_path: filePath,
        old_string: `@${oldDecorator}`,
        new_string: `@${newDecorator}`,
        use_regex: true,
        expected_replacements: 1, // Assuming one replacement for now
      });
      process.exit(0);
    } else if (input.trim() === '/test-edit-decorator') {
      logger.info('Running EditTool decorator tests...');
      await shellTool.run({ command: 'npm test packages/core/tests/edit.test.ts' });
      process.exit(0);
    } else if (input.startsWith('/check-imports ')) {
      const filePath = input.substring('/check-imports '.length).trim();
      if (!filePath.endsWith('.py')) {
        logger.error('Please provide a Python file path (e.g., /path/to/your_file.py).');
        process.exit(1);
      }
      logger.info(`Checking imports for ${filePath}...`);
      try {
        await shellTool.run({ command: `python -m py_compile ${filePath}` });
        logger.info('Basic syntax check passed. For more comprehensive import checks, consider running: pip install pylint && pylint ' + filePath);
      } catch (error) {
        logger.error(`Error checking imports for ${filePath}: ${error}`);
      }
      process.exit(0);
    } else if (input.trim() === '/test-read-imports') {
      logger.info('Running ReadFileTool import detection tests...');
      await shellTool.run({ command: 'npm test packages/core/tests/readFile.test.ts' });
      process.exit(0);
    } else if (input.startsWith('/read-url ')) {
      const [url] = input.substring('/read-url '.length).trim().split(' ');
      logger.info(`Reading URL: ${url}...`);
      try {
        const content = await readFileTool.run({ filePath: url });
        logger.info(`Content from ${url}:
${content}`);
      } catch (error) {
        logger.error(`Failed to read URL ${url}: ${error}`);
      }
      process.exit(0);
    } else if (input.startsWith('/read-sdcard ')) {
      const [path] = input.substring('/read-sdcard '.length).trim().split(' ');
      logger.info(`Reading from /sdcard/${path}...`);
      try {
        const content = await readFileTool.run({ filePath: `/sdcard/${path}` });
        logger.info(`Content from /sdcard/${path}:\n${content}`);
      } catch (error) {
        logger.error(`Failed to read from /sdcard/${path}: ${error}`);
      }
      process.exit(0);
    } else if (input.startsWith('/read-json ')) {
      const [path] = input.substring('/read-json '.length).trim().split(' ');
      logger.info(`Reading and parsing JSON from ${path}...`);
      try {
        const content = await readFileTool.run({ filePath: path });
        logger.info(`Content from ${path}:\n${content}`);
      } catch (error) {
        logger.error(`Failed to read and parse JSON from ${path}: ${error}`);
      }
      process.exit(0);
    } else if (input.trim() === '/read-clipboard') {
      logger.info('Reading from clipboard...');
      try {
        const content = await readFileTool.run({ filePath: 'clipboard' });
        logger.info(`Content from clipboard:\n${content}`);
      } catch (error) {
        logger.error(`Failed to read from clipboard: ${error}`);
      }
      process.exit(0);
    } else if (input.startsWith('/write-sdcard ')) {
      const [path, ...content] = input.substring('/write-sdcard '.length).trim().split(' ');
      logger.info(`Writing to /sdcard/${path}...`);
      try {
        await WriteFileTool.run({ filePath: `/sdcard/${path}`, content: content.join(' '), overwrite: true });
        logger.info(`Content written to /sdcard/${path}`);
      } catch (error) {
        logger.error(`Failed to write to /sdcard/${path}: ${error}`);
      }
      process.exit(0);
    } else if (input.startsWith('/replace ')) {
      const parts = input.substring('/replace '.length).trim().split(' ');
      if (parts.length < 3) {
        logger.error('Usage: /replace <file_path> <search_string> <replace_string>');
        process.exit(1);
      }
      const filePath = parts[0];
      const search = parts[1];
      const replace = parts[2];
      logger.info(`Replacing in ${filePath}: '${search}' with '${replace}' using regex...`);
      await EditTool.run({
        file_path: filePath,
        old_string: search,
        new_string: replace,
        use_regex: true,
      });
      process.exit(0);
      process.exit(0);
    } else if (input.startsWith('/write-sdcard ')) {
      const [path, ...content] = input.substring('/write-sdcard '.length).trim().split(' ');
      logger.info(`Writing to /sdcard/${path}...`);
      try {
        await WriteFileTool.run({ filePath: `/sdcard/${path}`, content: content.join(' '), overwrite: true });
        logger.info(`Content written to /sdcard/${path}`);
      } catch (error) {
        logger.error(`Failed to write to /sdcard/${path}: ${error}`);
      }
      process.exit(0);
      logger.info('Displaying edit error logs...');
      await shellTool.run({ command: 'cat logs/edit_errors.log || echo "No edit errors logged yet."', directory: '/data/data/com.termux/files/home/pyrm-cli' });
      process.exit(0);
    } else if (input.trim() === '/test-edit-log') {
      logger.info('Running EditTool error logging tests...');
      await shellTool.run({ command: 'npm test packages/core/tests/edit.test.ts' });
      process.exit(0);
    } else if (input.trim() === '/test-all') {
      logger.info('Running all Jest tests...');
      await shellTool.run({ command: './run-tests.sh', directory: '/data/data/com.termux/files/home/pyrm-cli' });
      process.exit(0);
    } else if (input.startsWith('/validate-python ')) {
      const filePath = input.substring('/validate-python '.length).trim();
      if (!filePath.endsWith('.py')) {
        logger.error('Please provide a Python file path (e.g., /path/to/your_file.py).');
        process.exit(1);
      }
      logger.info(`Validating Python syntax for ${filePath}...`);
      try {
        await shellTool.run({ command: `python -m py_compile ${filePath}` });
        logger.info(`Python syntax for ${filePath} is valid.`);
      } catch (error) {
        logger.error(`Python syntax validation failed for ${filePath}: ${error}`);
      }
      process.exit(0);
    } else if (input.trim() === '/test-validate') {
      logger.info('Running ReadFileTool Python syntax validation tests...');
      await shellTool.run({ command: 'npm test packages/core/tests/readFile.test.ts' });
      process.exit(0);
    }
    // If not a TTY, we must read the sacred input from stdin.
    if (!process.stdin.isTTY) {
      input += await readStdin();
    }

    if (!input) {
      logger.error('No input was provided via stdin for non-interactive mode.');
      process.exit(1);
    }

    logUserPrompt(config, {
      'event.name': 'user_prompt',
      'event.timestamp': new Date().toISOString(),
      prompt: input,
      prompt_length: input.length,
    });

    const nonInteractiveConfig = await loadNonInteractiveConfig(
      config,
      extensions,
      settings,
    );
    await runNonInteractive(nonInteractiveConfig, input);
    process.exit(0);
  } catch (err) {
    logger.error('An error occurred during non-interactive mode.', err);
    process.exit(1);
  }
}

// --- Main Orchestration Spell ---

/**
 * The main function, refactored into a grand orchestrator of spells.
 */
export async function main() {
  try {
    const workspaceRoot = process.cwd();
    const settings = await handleSettingsInitialization(workspaceRoot);
    const { config, extensions } = await initializeCoreServices(
      settings,
      workspaceRoot,
    );

    await prepareExecutionEnvironment(config, settings);

    const input = config.getQuestion();

    // We enter interactive mode only if we are in a TTY and no direct question was asked.
    switch (process.stdin.isTTY && input?.length === 0) {
      case true:
        await runInteractiveMode(config, settings, workspaceRoot);
        break;
      case false:
        runNonInteractiveMode(config, settings, extensions, input);
        break;
      default:
        logger.error('Unexpected error determining execution mode.');
        process.exit(1);
    }
  } catch (err) {
    logger.error('An unexpected error occurred.', err);
    process.exit(1);
  }
}

// --- Configuration Spells for Non-Interactive Mode ---

async function loadNonInteractiveConfig(
  config: Config,
  extensions: Extension[],
  settings: LoadedSettings,
) {
  let finalConfig = config;
  // If not in YOLO mode, we must disable interactive tools that require user approval.
  // This is a critical ward to prevent scripts from hanging indefinitely.
  if (config.getApprovalMode() !== ApprovalMode.YOLO) {
    const existingExcludeTools = settings.merged.excludeTools || [];
    const interactiveTools = [
      shellTool.Name,
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
  // A special case for headless environments: if GEMINI_API_KEY is set, we use it.
  if (!selectedAuthType && !process.env.GEMINI_API_KEY) {
    logError(
      'An authentication method must be set in your .gemini/settings.json scroll,',
      'or the GEMINI_API_KEY environment variable must be declared before running non-interactively.',
    );
    process.exit(1);
  }

  selectedAuthType = selectedAuthType || AuthType.USE_GEMINI;
  const err = validateAuthMethod(selectedAuthType);
  if (err != null) {
    logError(err);
    process.exit(1);
  }

  await nonInteractiveConfig.refreshAuth(selectedAuthType);
  return nonInteractiveConfig;
}

// --- The Final Ward: Global Unhandled Rejection Catcher ---
// A fortified global ward to catch any promise spirits that escape our grasp.
process.on('unhandledRejection', (reason, _promise) => {
  logger.error('=========================================');
  logger.error('CRITICAL: A Promise Spirit Was Left Unhandled!');
  logger.error('=========================================');
  logger.error('Reason:', reason);
  if (!(reason instanceof Error)) {
    logger.error('The spirit was not of a known Error form:', reason);
  }
  // Exit to prevent the realm from falling into an unknown state.
  process.exit(1);
});
