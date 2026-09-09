/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import chalk from 'chalk';
import { DEFAULT_PORT, GEMMA_MODEL_NAME } from './constants.js';
import {
  detectPlatform,
  getBinaryPath,
  isBinaryInstalled,
  isModelDownloaded,
  isServerRunning,
  readServerPid,
  isProcessRunning,
  resolveGemmaConfig,
} from './platform.js';
import { exitCli } from '../utils.js';

export interface GemmaStatusResult {
  binaryInstalled: boolean;
  binaryPath: string | null;
  modelDownloaded: boolean;
  serverRunning: boolean;
  serverPid: number | null;
  settingsEnabled: boolean;
  port: number;
  allPassing: boolean;
}

export async function checkGemmaStatus(
  port?: number,
): Promise<GemmaStatusResult> {
  const { settingsEnabled, configuredPort } = resolveGemmaConfig(DEFAULT_PORT);

  const effectivePort = port ?? configuredPort;
  const binaryPath = getBinaryPath();
  const binaryInstalled = isBinaryInstalled(binaryPath);
  const modelDownloaded =
    binaryInstalled && binaryPath ? isModelDownloaded(binaryPath) : false;
  const serverRunning = await isServerRunning(effectivePort);
  const pid = readServerPid();
  const serverPid = pid && isProcessRunning(pid) ? pid : null;

  const allPassing =
    binaryInstalled && modelDownloaded && serverRunning && settingsEnabled;

  return {
    binaryInstalled,
    binaryPath,
    modelDownloaded,
    serverRunning,
    serverPid,
    settingsEnabled,
    port: effectivePort,
    allPassing,
  };
}

export function formatGemmaStatus(status: GemmaStatusResult): string {
  const check = (ok: boolean) => (ok ? chalk.green('✓') : chalk.red('✗'));

  const lines: string[] = [
    '',
    chalk.bold('Gemma Local Model Routing Status'),
    chalk.dim('─'.repeat(40)),
    '',
  ];

  if (status.binaryInstalled) {
    lines.push(`  Binary:    ${check(true)} Installed (${status.binaryPath})`);
  } else {
    const platform = detectPlatform();
    if (platform) {
      lines.push(`  Binary:    ${check(false)} Not installed`);
      lines.push(chalk.dim(`             Run: gemini gemma setup`));
    } else {
      lines.push(
        `  Binary:    ${check(false)} Unsupported platform (${process.platform}-${process.arch})`,
      );
    }
  }

  if (status.modelDownloaded) {
    lines.push(`  Model:     ${check(true)} ${GEMMA_MODEL_NAME} downloaded`);
  } else {
    lines.push(`  Model:     ${check(false)} ${GEMMA_MODEL_NAME} not found`);
    if (status.binaryInstalled) {
      lines.push(
        chalk.dim(
          `             Run: ${status.binaryPath} pull ${GEMMA_MODEL_NAME}`,
        ),
      );
    } else {
      lines.push(chalk.dim(`             Run: gemini gemma setup`));
    }
  }

  if (status.serverRunning) {
    const pidInfo = status.serverPid ? ` (PID ${status.serverPid})` : '';
    lines.push(
      `  Server:    ${check(true)} Running on port ${status.port}${pidInfo}`,
    );
  } else {
    lines.push(
      `  Server:    ${check(false)} Not running on port ${status.port}`,
    );
    lines.push(chalk.dim(`             Run: gemini gemma start`));
  }

  if (status.settingsEnabled) {
    lines.push(`  Settings:  ${check(true)} Enabled in settings.json`);
  } else {
    lines.push(`  Settings:  ${check(false)} Not enabled in settings.json`);
    lines.push(
      chalk.dim(
        `             Run: gemini gemma setup (auto-configures settings)`,
      ),
    );
  }

  lines.push('');

  if (status.allPassing) {
    lines.push(chalk.green('  Routing is active — no action needed.'));
    lines.push('');
    lines.push(
      chalk.dim(
        '  Simple requests → Flash (fast) | Complex requests → Pro (powerful)',
      ),
    );
    lines.push(chalk.dim('  This happens automatically on every request.'));
  } else {
    lines.push(
      chalk.yellow(
        '  Some checks failed. Run "gemini gemma setup" for guided installation.',
      ),
    );
  }

  lines.push('');
  return lines.join('\n');
}

export const statusCommand: CommandModule = {
  command: 'status',
  describe: 'Check Gemma local model routing status',
  builder: (yargs) =>
    yargs.option('port', {
      type: 'number',
      description: 'Port to check for the LiteRT server',
    }),
  handler: async (argv) => {
    let port: number | undefined;
    if (argv['port'] !== undefined) {
      port = Number(argv['port']);
    }
    const status = await checkGemmaStatus(port);
    const output = formatGemmaStatus(status);
    process.stdout.write(output);
    await exitCli(status.allPassing ? 0 : 1);
  },
};
