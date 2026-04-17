/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import fs from 'node:fs';
import { execSync, spawn as nodeSpawn } from 'node:child_process';
import chalk from 'chalk';
import { debugLogger } from '@google/gemini-cli-core';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { exitCli } from '../utils.js';
import {
  DEFAULT_PORT,
  GEMMA_MODEL_NAME,
  getLiteRtBinDir,
} from './constants.js';
import {
  detectPlatform,
  getBinaryDownloadUrl,
  getBinaryPath,
  isBinaryInstalled,
  isModelDownloaded,
} from './platform.js';
import { startServer } from './start.js';
import readline from 'node:readline';

const log = (msg: string) => debugLogger.log(msg);
const logError = (msg: string) => debugLogger.error(msg);

/**
 * Prompts the user for a yes/no confirmation.
 * Returns true if the user answers 'y' or 'yes'.
 */
async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(
        answer.trim().toLowerCase() === 'y' ||
          answer.trim().toLowerCase() === 'yes',
      );
    });
  });
}

/** Formats a byte count into a human-readable string (e.g. "12.3 MB"). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Renders a single-line progress bar to stderr (overwriting in place). */
function renderProgress(downloaded: number, total: number | null): void {
  const barWidth = 30;
  if (total && total > 0) {
    const pct = Math.min(downloaded / total, 1);
    const filled = Math.round(barWidth * pct);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    const pctStr = (pct * 100).toFixed(0).padStart(3);
    process.stderr.write(
      `\r  [${bar}] ${pctStr}% ${formatBytes(downloaded)} / ${formatBytes(total)}`,
    );
  } else {
    process.stderr.write(`\r  Downloaded ${formatBytes(downloaded)}`);
  }
}

/**
 * Downloads a file from a URL to a local path with a progress bar.
 * Uses a temporary `.downloading` suffix for safety against interrupted downloads.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const tmpPath = destPath + '.downloading';

  // Clean up any previous interrupted download.
  if (fs.existsSync(tmpPath)) {
    fs.unlinkSync(tmpPath);
  }

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(
      `Download failed: HTTP ${response.status} ${response.statusText}`,
    );
  }
  if (!response.body) {
    throw new Error('Download failed: No response body');
  }

  const contentLength = response.headers.get('content-length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : null;
  let downloadedBytes = 0;

  const fileStream = fs.createWriteStream(tmpPath);
  const reader = response.body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const writeOk = fileStream.write(value);
      if (!writeOk) {
        await new Promise<void>((resolve) => fileStream.once('drain', resolve));
      }
      downloadedBytes += value.byteLength;
      renderProgress(downloadedBytes, totalBytes);
    }
  } finally {
    fileStream.end();
    // Clear the progress line.
    process.stderr.write('\r' + ' '.repeat(80) + '\r');
  }

  // Wait for the file to finish flushing.
  await new Promise<void>((resolve, reject) => {
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });

  // Atomic rename after successful download.
  fs.renameSync(tmpPath, destPath);
}

/**
 * Spawns a child process and returns a promise that resolves with the exit code.
 * Inherits stdio so the user sees all output (progress, terms acceptance, etc.).
 */
function spawnInherited(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = nodeSpawn(command, args, {
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', reject);
  });
}

interface SetupArgs {
  port: number;
  skipModel: boolean;
  start: boolean;
  force: boolean;
  consent: boolean;
}

async function handleSetup(argv: SetupArgs): Promise<number> {
  const { port, force } = argv;

  log('');
  log(chalk.bold('Gemma Local Model Routing Setup'));
  log(chalk.dim('─'.repeat(40)));
  log('');

  // Step 1: Platform detection
  const platform = detectPlatform();
  if (!platform) {
    logError(
      chalk.red(`Unsupported platform: ${process.platform}-${process.arch}`),
    );
    logError(
      'LiteRT-LM binaries are available for: macOS (ARM64), Linux (x86_64), Windows (x86_64)',
    );
    return 1;
  }
  log(chalk.dim(`  Platform: ${platform.key} → ${platform.binaryName}`));

  // Step 2: Consent
  if (!argv.consent) {
    log('');
    log('This will download and install the LiteRT-LM runtime and the');
    log(
      `Gemma model (${GEMMA_MODEL_NAME}, ~1 GB). By proceeding, you agree to the`,
    );
    log('Gemma Terms of Use: https://ai.google.dev/gemma/terms');
    log('');

    const accepted = await promptYesNo('Do you want to continue?');
    if (!accepted) {
      log('Setup cancelled.');
      return 0;
    }
  }

  // Step 3: Download binary
  const binaryPath = getBinaryPath(platform.binaryName)!;
  const alreadyInstalled = isBinaryInstalled();

  if (alreadyInstalled && !force) {
    log('');
    log(chalk.green('  ✓ LiteRT-LM binary already installed at:'));
    log(chalk.dim(`    ${binaryPath}`));
  } else {
    log('');
    log('  Downloading LiteRT-LM binary...');
    const downloadUrl = getBinaryDownloadUrl(platform.binaryName);
    debugLogger.log(`Downloading from: ${downloadUrl}`);

    try {
      const binDir = getLiteRtBinDir();
      fs.mkdirSync(binDir, { recursive: true });
      await downloadFile(downloadUrl, binaryPath);
      log(chalk.green('  ✓ Binary downloaded successfully'));
    } catch (error) {
      logError(
        chalk.red(
          `  ✗ Failed to download binary: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      logError('  Check your internet connection and try again.');
      return 1;
    }

    // Step 4: Make executable and handle macOS gatekeeper
    if (process.platform !== 'win32') {
      try {
        fs.chmodSync(binaryPath, 0o755);
      } catch (error) {
        logError(
          chalk.red(
            `  ✗ Failed to set executable permission: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
        return 1;
      }
    }

    if (process.platform === 'darwin') {
      try {
        execSync(`xattr -d com.apple.quarantine "${binaryPath}"`, {
          stdio: 'ignore',
        });
        log(chalk.green('  ✓ macOS quarantine attribute removed'));
      } catch {
        // This is expected to fail if the attribute doesn't exist.
        debugLogger.log(
          'xattr quarantine removal not needed or failed (non-fatal)',
        );
      }
    }
  }

  // Step 5: Pull the model
  if (!argv.skipModel) {
    const modelAlreadyDownloaded = isModelDownloaded(binaryPath);
    if (modelAlreadyDownloaded && !force) {
      log('');
      log(chalk.green(`  ✓ Model ${GEMMA_MODEL_NAME} already downloaded`));
    } else {
      log('');
      log(`  Downloading model ${GEMMA_MODEL_NAME}...`);
      log(chalk.dim('  You may be prompted to accept the Gemma Terms of Use.'));
      log('');

      const exitCode = await spawnInherited(binaryPath, [
        'pull',
        GEMMA_MODEL_NAME,
      ]);
      if (exitCode !== 0) {
        logError('');
        logError(
          chalk.red(`  ✗ Model download failed (exit code ${exitCode})`),
        );
        return 1;
      }
      log('');
      log(chalk.green(`  ✓ Model ${GEMMA_MODEL_NAME} downloaded`));
    }
  }

  // Step 6: Configure settings
  log('');
  log('  Configuring settings...');
  try {
    const settings = loadSettings(process.cwd());
    const existingGemma =
      settings.forScope(SettingScope.User).settings.experimental
        ?.gemmaModelRouter ?? {};

    const newGemmaSettings = {
      ...existingGemma,
      enabled: true,
      autoStartServer: existingGemma.autoStartServer ?? true,
      classifier: {
        host: `http://localhost:${port}`,
        model: GEMMA_MODEL_NAME,
        ...existingGemma.classifier,
      },
    };

    // Read existing experimental settings to avoid overwriting them.
    const existingExperimental =
      settings.forScope(SettingScope.User).settings.experimental ?? {};
    settings.setValue(SettingScope.User, 'experimental', {
      ...existingExperimental,
      gemmaModelRouter: newGemmaSettings,
    });

    log(chalk.green('  ✓ Settings updated in ~/.gemini/settings.json'));
  } catch (error) {
    logError(
      chalk.red(
        `  ✗ Failed to update settings: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    logError(
      '  You can manually add the configuration to ~/.gemini/settings.json',
    );
  }

  // Step 7: Start server (if requested)
  if (argv.start) {
    log('');
    log('  Starting LiteRT server...');
    const started = await startServer(binaryPath, port);
    if (started) {
      log(chalk.green(`  ✓ Server started on port ${port}`));
    } else {
      log(
        chalk.yellow(
          `  ! Server may not have started correctly. Check: gemini gemma status`,
        ),
      );
    }
  }

  // Step 8: Summary
  log('');
  log(chalk.dim('─'.repeat(40)));
  log(chalk.bold.green('  Setup complete! Local model routing is now active.'));
  log('');
  log('  How it works: Every request is classified by the local Gemma model.');
  log(
    '  Simple tasks (file reads, quick edits) route to ' +
      chalk.cyan('Flash') +
      ' for speed.',
  );
  log(
    '  Complex tasks (debugging, architecture) route to ' +
      chalk.cyan('Pro') +
      ' for quality.',
  );
  log('  This happens automatically — just use the CLI as usual.');
  log('');
  if (!argv.start) {
    log(
      chalk.yellow(
        '  Note: Run "gemini gemma start" to start the server, or restart',
      ),
    );
    log(
      chalk.yellow(
        '  the CLI to auto-start it (if autoStartServer is enabled).',
      ),
    );
    log('');
  }
  log('  Useful commands:');
  log(chalk.dim('    gemini gemma status   Check routing status'));
  log(chalk.dim('    gemini gemma start    Start the LiteRT server'));
  log(chalk.dim('    gemini gemma stop     Stop the LiteRT server'));
  log(chalk.dim('    /gemma               Check status inside a session'));
  log('');

  return 0;
}

export const setupCommand: CommandModule = {
  command: 'setup',
  describe: 'Download and configure Gemma local model routing',
  builder: (yargs) =>
    yargs
      .option('port', {
        type: 'number',
        default: DEFAULT_PORT,
        description: 'Port for the LiteRT server',
      })
      .option('skip-model', {
        type: 'boolean',
        default: false,
        description: 'Skip model download (binary only)',
      })
      .option('start', {
        type: 'boolean',
        default: true,
        description: 'Start the server after setup',
      })
      .option('force', {
        type: 'boolean',
        default: false,
        description: 'Re-download binary and model even if already present',
      })
      .option('consent', {
        type: 'boolean',
        default: false,
        description: 'Skip interactive consent prompt (implies acceptance)',
      }),
  handler: async (argv) => {
    const exitCode = await handleSetup({
      port: Number(argv['port']),
      skipModel: Boolean(argv['skipModel']),
      start: Boolean(argv['start']),
      force: Boolean(argv['force']),
      consent: Boolean(argv['consent']),
    });
    await exitCli(exitCode);
  },
};
