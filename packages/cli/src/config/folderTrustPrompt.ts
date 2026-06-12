/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import prompts from 'prompts';
import {
  coreEvents,
  createWorkingStdio,
  ExitCodes,
  isHeadlessMode,
} from '@google/gemini-cli-core';
import { runExitCleanup } from '../utils/cleanup.js';
import { relaunchApp } from '../utils/processUtils.js';
import type { CliArgs } from './config.js';
import type { MergedSettings } from './settings.js';
import {
  isFolderTrustEnabled,
  isTrustLevel,
  isWorkspaceTrusted,
  loadTrustedFolders,
  TrustLevel,
} from './trustedFolders.js';

type FolderTrustPromptArgs = Pick<CliArgs, 'prompt' | 'query' | 'isCommand'>;

async function exitAfterFailedTrustSave(): Promise<never> {
  coreEvents.emitFeedback(
    'error',
    'Failed to save trust settings. Exiting Gemini CLI.',
  );
  await runExitCleanup();
  process.exit(ExitCodes.FATAL_CONFIG_ERROR);
}

async function exitAfterCancelledTrustPrompt(): Promise<never> {
  await runExitCleanup();
  process.exit(ExitCodes.FATAL_CANCELLATION_ERROR);
}

/**
 * Resolves an unknown workspace trust state before slow startup work like auth.
 *
 * Trusting a folder requires a relaunch so startup can reload workspace settings,
 * hooks, MCP servers, and context files under the new trust decision.
 */
export async function maybePromptForFolderTrust(
  settings: MergedSettings,
  argv: FolderTrustPromptArgs,
  workspaceDir: string = process.cwd(),
): Promise<void> {
  if (!isFolderTrustEnabled(settings)) {
    return;
  }

  if (
    argv.isCommand ||
    isHeadlessMode({ prompt: argv.prompt, query: argv.query })
  ) {
    return;
  }

  const { isTrusted } = isWorkspaceTrusted(settings, workspaceDir, {
    prompt: argv.prompt,
    query: argv.query,
  });
  if (isTrusted !== undefined) {
    return;
  }

  const dirName = path.basename(workspaceDir);
  const parentFolder = path.basename(path.dirname(workspaceDir));
  const { stdout } = createWorkingStdio();
  const response = await prompts({
    type: 'select',
    name: 'trustLevel',
    message: 'Do you want to trust this folder?',
    choices: [
      {
        title: `Trust folder (${dirName})`,
        value: TrustLevel.TRUST_FOLDER,
      },
      {
        title: `Trust parent folder (${parentFolder})`,
        value: TrustLevel.TRUST_PARENT,
      },
      {
        title: "Don't trust",
        value: TrustLevel.DO_NOT_TRUST,
      },
    ],
    initial: 0,
    stdin: process.stdin,
    stdout,
  });

  if (!isTrustLevel(response.trustLevel)) {
    await exitAfterCancelledTrustPrompt();
  }

  try {
    await loadTrustedFolders().setValue(workspaceDir, response.trustLevel);
  } catch {
    await exitAfterFailedTrustSave();
  }

  if (
    response.trustLevel === TrustLevel.TRUST_FOLDER ||
    response.trustLevel === TrustLevel.TRUST_PARENT
  ) {
    await relaunchApp();
  }
}
