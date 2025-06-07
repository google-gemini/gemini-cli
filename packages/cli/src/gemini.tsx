/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import { loadCliConfig } from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { sandbox_command, start_sandbox } from './utils/sandbox.js';
import { LoadedSettings, loadSettings } from './config/settings.js';
import { themeManager } from './ui/themes/theme-manager.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import { loadGeminiIgnorePatterns } from './utils/loadIgnorePatterns.js';
import {
  ApprovalMode,
  Config,
  EditTool,
  GlobTool,
  GrepTool,
  LSTool,
  MemoryTool,
  ReadFileTool,
  ReadManyFilesTool,
  ShellTool,
  WebFetchTool,
  WebSearchTool,
} from '@gemini-code/core';

export async function main() {
  // warn about deprecated environment variables
  if (process.env.GEMINI_CODE_MODEL) {
    console.warn('GEMINI_CODE_MODEL is deprecated. Use GEMINI_MODEL instead.');
    process.env.GEMINI_MODEL = process.env.GEMINI_CODE_MODEL;
  }
  if (process.env.GEMINI_CODE_SANDBOX) {
    console.warn(
      'GEMINI_CODE_SANDBOX is deprecated. Use GEMINI_SANDBOX instead.',
    );
    process.env.GEMINI_SANDBOX = process.env.GEMINI_CODE_SANDBOX;
  }
  if (process.env.GEMINI_CODE_SANDBOX_IMAGE) {
    console.warn(
      'GEMINI_CODE_SANDBOX_IMAGE is deprecated. Use GEMINI_SANDBOX_IMAGE_NAME instead.',
    );
    process.env.GEMINI_SANDBOX_IMAGE_NAME =
      process.env.GEMINI_CODE_SANDBOX_IMAGE; // Corrected to GEMINI_SANDBOX_IMAGE_NAME
  }

  const workspaceRoot = process.cwd();
  const settings = loadSettings(workspaceRoot);
  const geminiIgnorePatterns = loadGeminiIgnorePatterns(workspaceRoot);

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

  const { config, modelWasSwitched, originalModelBeforeSwitch, finalModel } =
    await loadCliConfig(settings.merged, geminiIgnorePatterns);

  // Initialize centralized FileDiscoveryService
  await config.getFileService();

  if (modelWasSwitched && originalModelBeforeSwitch) {
    console.log(
      `[INFO] Your configured model (${originalModelBeforeSwitch}) was temporarily unavailable. Switched to ${finalModel} for this session.`,
    );
  }

  if (settings.merged.theme) {
    if (!themeManager.setActiveTheme(settings.merged.theme)) {
      // If the theme is not found during initial load, log a warning and continue.
      // The useThemeCommand hook in App.tsx will handle opening the dialog.
      console.warn(`Warning: Theme "${settings.merged.theme}" not found.`);
    }
  }

  // hop into sandbox if we are outside and sandboxing is enabled
  if (!process.env.SANDBOX) {
    const sandbox = sandbox_command(config.getSandbox());
    if (sandbox) {
      await start_sandbox(sandbox);
      process.exit(0);
    }
  }

  let input = config.getQuestion();
  const startupWarnings = await getStartupWarnings();

  // Render UI, passing necessary config values. Check that there is no command line question.
  if (process.stdin.isTTY && input?.length === 0) {
    render(
      <React.StrictMode>
        <App
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

  // Non-interactive mode handled by runNonInteractive
  const nonInteractiveConfig = await loadNonInteractiveConfig(config, settings);

  await runNonInteractive(nonInteractiveConfig, input);
  process.exit(0);
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
  settings: LoadedSettings,
) {
  if (config.getApprovalMode() === ApprovalMode.YOLO) {
    // Since everything is being allowed we can use normal yolo behavior.
    return config;
  }

  // Everything is not allowed, ensure that only read-only tools are configured.

  let existingCoreTools = config.getCoreTools();
  existingCoreTools = existingCoreTools || [
    ReadFileTool.Name,
    LSTool.Name,
    GrepTool.Name,
    GlobTool.Name,
    EditTool.Name,
    WebFetchTool.Name,
    WebSearchTool.Name,
    ReadManyFilesTool.Name,
    ShellTool.Name,
    MemoryTool.Name,
  ];
  const interactiveTools = [ShellTool.Name, EditTool.Name];
  const nonInteractiveTools = existingCoreTools.filter(
    (tool) => !interactiveTools.includes(tool),
  );
  const nonInteractiveSettings = {
    ...settings.merged,
    coreTools: nonInteractiveTools,
  };
  const nonInteractiveConfigResult = await loadCliConfig(
    nonInteractiveSettings,
    config.getGeminiIgnorePatterns(),
  );
  return nonInteractiveConfigResult.config;
}
