/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn as nodeSpawn } from 'node:child_process';
import chalk from 'chalk';
import { debugLogger } from '@google/gemini-cli-core';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { exitCli } from '../utils.js';
import {
  DEFAULT_PORT,
  GEMMA_MODEL_NAME,
  PLATFORM_BINARY_SHA256,
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

async function downloadFile(url: string, destPath: string): Promise<void> {
  const tmpPath = destPath + '.downloading';
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
    process.stderr.write('\r' + ' '.repeat(80) + '\r');
  }

  await new Promise<void>((resolve, reject) => {
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });

  fs.renameSync(tmpPath, destPath);
}

export async function computeFileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const fileStream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    fileStream.on('data', (chunk) => {
      hash.update(chunk);
    });
    fileStream.on('error', reject);
    fileStream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}

export async function verifyFileSha256(
  filePath: string,
  expectedHash: string,
): Promise<boolean> {
  const actualHash = await computeFileSha256(filePath);
  return actualHash === expectedHash;
}

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
  let settingsUpdated = false;
  let serverStarted = false;
  let autoStartServer = true;

  log('');
  log(chalk.bold('Gemma Local Model Routing Setup'));
  log(chalk.dim('─'.repeat(40)));
  log('');

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
      const binDir = path.dirname(binaryPath);
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

    const expectedHash = PLATFORM_BINARY_SHA256[platform.binaryName];
    if (!expectedHash) {
      logError(
        chalk.red(
          `  ✗ No checksum is configured for ${platform.binaryName}. Refusing to install the binary.`,
        ),
      );
      try {
        fs.rmSync(binaryPath, { force: true });
      } catch {
        // ignore
      }
      return 1;
    }

    try {
      const checksumVerified = await verifyFileSha256(binaryPath, expectedHash);
      if (!checksumVerified) {
        logError(
          chalk.red(
            '  ✗ Downloaded binary checksum did not match the expected release hash.',
          ),
        );
        try {
          fs.rmSync(binaryPath, { force: true });
        } catch {
          // ignore
        }
        return 1;
      }
      log(chalk.green('  ✓ Binary checksum verified'));
    } catch (error) {
      logError(
        chalk.red(
          `  ✗ Failed to verify binary checksum: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      try {
        fs.rmSync(binaryPath, { force: true });
      } catch {
        // ignore
      }
      return 1;
    }

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
        execFileSync('xattr', ['-d', 'com.apple.quarantine', binaryPath], {
          stdio: 'ignore',
        });
        log(chalk.green('  ✓ macOS quarantine attribute removed'));
      } catch {
        // Expected if the attribute doesn't exist.
      }
    }
  }

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

  log('');
  log('  Configuring settings...');
  try {
    const settings = loadSettings(process.cwd());

    // User scope: security-sensitive settings that must not be overridable
    // by workspace configs (prevents arbitrary binary execution).
    const existingUserGemma =
      settings.forScope(SettingScope.User).settings.experimental
        ?.gemmaModelRouter ?? {};
    autoStartServer = existingUserGemma.autoStartServer ?? true;
    const existingUserExperimental =
      settings.forScope(SettingScope.User).settings.experimental ?? {};
    settings.setValue(SettingScope.User, 'experimental', {
      ...existingUserExperimental,
      gemmaModelRouter: {
        autoStartServer,
        ...(existingUserGemma.binaryPath !== undefined
          ? { binaryPath: existingUserGemma.binaryPath }
          : {}),
      },
    });

    // Workspace scope: project-isolated settings so the local model only
    // runs for this specific project, saving resources globally.
    const existingWorkspaceGemma =
      settings.forScope(SettingScope.Workspace).settings.experimental
        ?.gemmaModelRouter ?? {};
    const existingWorkspaceExperimental =
      settings.forScope(SettingScope.Workspace).settings.experimental ?? {};
    settings.setValue(SettingScope.Workspace, 'experimental', {
      ...existingWorkspaceExperimental,
      gemmaModelRouter: {
        ...existingWorkspaceGemma,
        enabled: true,
        classifier: {
          ...existingWorkspaceGemma.classifier,
          host: `http://localhost:${port}`,
          model: GEMMA_MODEL_NAME,
        },
      },
    });

    log(chalk.green('  ✓ Settings updated'));
    log(chalk.dim('    User (~/.gemini/settings.json): autoStartServer'));
    log(
      chalk.dim('    Workspace (.gemini/settings.json): enabled, classifier'),
    );
    settingsUpdated = true;
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

  if (argv.start) {
    log('');
    log('  Starting LiteRT server...');
    serverStarted = await startServer(binaryPath, port);
    if (serverStarted) {
      log(chalk.green(`  ✓ Server started on port ${port}`));
    } else {
      log(
        chalk.yellow(
          `  ! Server may not have started correctly. Check: gemini gemma status`,
        ),
      );
    }
  }

  const routingActive = settingsUpdated && serverStarted;
  const setupSucceeded = settingsUpdated && (!argv.start || serverStarted);
  log('');
  log(chalk.dim('─'.repeat(40)));
  if (routingActive) {
    log(chalk.bold.green('  Setup complete! Local model routing is active.'));
  } else if (settingsUpdated) {
    log(
      chalk.bold.green('  Setup complete! Local model routing is configured.'),
    );
  } else {
    log(
      chalk.bold.yellow(
        '  Setup incomplete. Manual settings changes are still required.',
      ),
    );
  }
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
  if (!settingsUpdated) {
    log(
      chalk.yellow(
        '  Fix the settings update above, then rerun "gemini gemma status".',
      ),
    );
    log('');
  } else if (!argv.start) {
    log(chalk.yellow('  Note: Run "gemini gemma start" to start the server.'));
    if (autoStartServer) {
      log(
        chalk.yellow(
          '  Or restart the CLI to auto-start it on the next launch.',
        ),
      );
    }
    log('');
  } else if (!serverStarted) {
    log(
      chalk.yellow(
        '  Review the server logs and rerun "gemini gemma start" after fixing the issue.',
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

  return setupSucceeded ? 0 : 1;
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
