#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import os from 'node:os';
import v8 from 'node:v8';

// --- Global Entry Point ---

/**
 * Whitelist of environment variables that Node.js and libcurl read during
 * process initialization (before user JS code runs), and therefore must be
 * present in the child process's initial environment for its TLS / proxy /
 * certificate-trust layer to pick them up. See:
 *   - https://nodejs.org/api/cli.html#node_extra_ca_certsfile
 *   - https://nodejs.org/api/cli.html#node_tls_reject_unauthorizedvalue
 *   - https://curl.se/docs/manpage.html (SSL_CERT_FILE, SSL_CERT_DIR)
 *
 * Any other variables defined in .gemini/.env continue to be loaded by the
 * child via loadEnvironment() in src/config/settings.ts, which applies the
 * full workspace-trust and exclusion logic.
 */
export const PARENT_PROCESS_TLS_ENV_ALLOWLIST: readonly string[] = [
  'NODE_EXTRA_CA_CERTS',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
];

const GEMINI_DIR_NAME = '.gemini';
const ENV_FILE_NAME = '.env';

/**
 * Minimal KEY=VALUE parser used only by the lightweight parent process.
 * Deliberately avoids importing `dotenv` (which would pull heavy deps into
 * the parent and defeat the purpose of PR #24667). Supports:
 *   - KEY=value
 *   - KEY="value" / KEY='value' (quotes stripped if balanced)
 *   - blank lines and `#` comments (including inline, when value is unquoted)
 *   - optional `export ` prefix
 * Malformed lines are silently ignored.
 */
export function parseSimpleEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trimStart();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const isQuoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")));
    if (!isQuoted) {
      const hashIdx = value.indexOf(' #');
      if (hashIdx !== -1) value = value.slice(0, hashIdx).trimEnd();
    } else {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Walk up from `startDir` looking for `<dir>/.gemini/.env`. Returns the first
 * hit, or `null` if none is found before the filesystem root.
 */
export function findProjectGeminiEnvFile(
  startDir: string,
  fsImpl: { existsSync: (p: string) => boolean },
  pathImpl: {
    resolve: (p: string) => string;
    join: (...parts: string[]) => string;
    dirname: (p: string) => string;
  },
): string | null {
  let currentDir = pathImpl.resolve(startDir);
  for (;;) {
    const candidate = pathImpl.join(currentDir, GEMINI_DIR_NAME, ENV_FILE_NAME);
    if (fsImpl.existsSync(candidate)) return candidate;
    const parent = pathImpl.dirname(currentDir);
    if (!parent || parent === currentDir) return null;
    currentDir = parent;
  }
}

/**
 * Read TLS-init-critical environment variables from `.gemini/.env` (project
 * first, then home) and return the subset that is both in the allowlist and
 * NOT already set in `currentEnv`. Never throws.
 */
export async function loadTlsEnvFromGemini(
  currentEnv: NodeJS.ProcessEnv,
  options?: {
    cwd?: string;
    homeDir?: string;
    allowlist?: readonly string[];
  },
): Promise<Record<string, string>> {
  const injected: Record<string, string> = {};
  try {
    const { readFileSync, existsSync } = await import('node:fs');
    const pathMod = await import('node:path');
    const allowlist = options?.allowlist ?? PARENT_PROCESS_TLS_ENV_ALLOWLIST;
    const cwd = options?.cwd ?? process.cwd();
    const homeDir = options?.homeDir ?? os.homedir();

    const candidates: string[] = [];
    const projectFile = findProjectGeminiEnvFile(
      cwd,
      { existsSync },
      {
        resolve: pathMod.resolve,
        join: pathMod.join,
        dirname: pathMod.dirname,
      },
    );
    if (projectFile) candidates.push(projectFile);

    const homeFile = pathMod.join(homeDir, GEMINI_DIR_NAME, ENV_FILE_NAME);
    if (homeFile !== projectFile && existsSync(homeFile)) {
      candidates.push(homeFile);
    }

    for (const file of candidates) {
      let parsed: Record<string, string>;
      try {
        const content = readFileSync(file, 'utf-8');
        parsed = parseSimpleEnv(content);
      } catch {
        // Ignore unreadable files (EACCES, ENOENT after race, etc.)
        continue;
      }
      for (const key of allowlist) {
        if (
          Object.hasOwn(parsed, key) &&
          !Object.hasOwn(injected, key) &&
          !Object.hasOwn(currentEnv, key)
        ) {
          injected[key] = parsed[key];
        }
      }
    }
  } catch {
    // Defensive: never block startup on a parent-env helper failure.
  }
  return injected;
}

// Suppress known race condition error in node-pty on Windows
// Tracking bug: https://github.com/microsoft/node-pty/issues/827
process.on('uncaughtException', (error) => {
  if (
    process.platform === 'win32' &&
    error instanceof Error &&
    error.message === 'Cannot resize a pty that has already exited'
  ) {
    // This error happens on Windows with node-pty when resizing a pty that has just exited.
    // It is a race condition in node-pty that we cannot prevent, so we silence it.
    return;
  }

  // For other errors, we rely on the default behavior, but since we attached a listener,
  // we must manually replicate it.
  if (error instanceof Error) {
    process.stderr.write(error.stack + '\n');
  } else {
    process.stderr.write(String(error) + '\n');
  }
  process.exit(1);
});

async function getMemoryNodeArgs(): Promise<string[]> {
  let autoConfigureMemory = true;
  try {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // Respect GEMINI_CLI_HOME environment variable, falling back to os.homedir()
    const baseDir =
      process.env['GEMINI_CLI_HOME'] || join(os.homedir(), '.gemini');
    const settingsPath = join(baseDir, 'settings.json');
    const rawSettings = readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(rawSettings);
    if (settings?.advanced?.autoConfigureMemory === false) {
      autoConfigureMemory = false;
    }
  } catch {
    // ignore
  }

  if (autoConfigureMemory) {
    const totalMemoryMB = os.totalmem() / (1024 * 1024);
    const heapStats = v8.getHeapStatistics();
    const currentMaxOldSpaceSizeMb = Math.floor(
      heapStats.heap_size_limit / 1024 / 1024,
    );
    const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);

    if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
      return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
    }
  }

  return [];
}

async function run() {
  if (!process.env['GEMINI_CLI_NO_RELAUNCH'] && !process.env['SANDBOX']) {
    // --- Lightweight Parent Process / Daemon ---
    // We avoid importing heavy dependencies here to save ~1.5s of startup time.

    const nodeArgs: string[] = [...process.execArgv];
    const scriptArgs = process.argv.slice(2);

    const memoryArgs = await getMemoryNodeArgs();
    nodeArgs.push(...memoryArgs);

    const script = process.argv[1];
    nodeArgs.push(script);
    nodeArgs.push(...scriptArgs);

    // Propagate TLS-initialization env vars from `.gemini/.env` into the
    // child's initial environment. Node reads these once at process start
    // (before any JS runs), so they must be set on the spawn env rather
    // than loaded later by the child's loadEnvironment(). Fixes #25987.
    // Keys already present in process.env take precedence — matching the
    // "shell env wins" rule enforced in loadEnvironment().
    const tlsEnvFromFile = await loadTlsEnvFromGemini(process.env);
    const newEnv = {
      ...tlsEnvFromFile,
      ...process.env,
      GEMINI_CLI_NO_RELAUNCH: 'true',
    };
    const RELAUNCH_EXIT_CODE = 199;
    let latestAdminSettings: unknown = undefined;

    // Prevent the parent process from exiting prematurely on signals.
    // The child process will receive the same signals and handle its own cleanup.
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      process.on(sig as NodeJS.Signals, () => {});
    }

    const runner = () => {
      process.stdin.pause();

      const child = spawn(process.execPath, nodeArgs, {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: newEnv,
      });

      if (latestAdminSettings) {
        child.send({ type: 'admin-settings', settings: latestAdminSettings });
      }

      child.on('message', (msg: { type?: string; settings?: unknown }) => {
        if (msg.type === 'admin-settings-update' && msg.settings) {
          latestAdminSettings = msg.settings;
        }
      });

      return new Promise<number>((resolve) => {
        child.on('error', (err) => {
          process.stderr.write(
            'Error: Failed to start child process: ' + err.message + '\n',
          );
          resolve(1);
        });
        child.on('close', (code) => {
          process.stdin.resume();
          resolve(code ?? 1);
        });
      });
    };

    while (true) {
      try {
        const exitCode = await runner();
        if (exitCode !== RELAUNCH_EXIT_CODE) {
          process.exit(exitCode);
        }
      } catch (error: unknown) {
        process.stdin.resume();
        process.stderr.write(
          `Fatal error: Failed to relaunch the CLI process.\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        );
        process.exit(1);
      }
    }
  } else {
    // --- Heavy Child Process ---
    // Now we can safely import everything.
    const { main } = await import('./src/gemini.js');
    const { FatalError, writeToStderr } = await import(
      '@google/gemini-cli-core'
    );
    const { runExitCleanup } = await import('./src/utils/cleanup.js');

    main().catch(async (error: unknown) => {
      // Set a timeout to force exit if cleanup hangs
      const cleanupTimeout = setTimeout(() => {
        writeToStderr('Cleanup timed out, forcing exit...\n');
        process.exit(1);
      }, 5000);

      try {
        await runExitCleanup();
      } catch (cleanupError: unknown) {
        writeToStderr(
          `Error during final cleanup: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}\n`,
        );
      } finally {
        clearTimeout(cleanupTimeout);
      }

      if (error instanceof FatalError) {
        let errorMessage = error.message;
        if (!process.env['NO_COLOR']) {
          errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
        }
        writeToStderr(errorMessage + '\n');
        process.exit(error.exitCode);
      }

      writeToStderr('An unexpected critical error occurred:');
      if (error instanceof Error) {
        writeToStderr(error.stack + '\n');
      } else {
        writeToStderr(String(error) + '\n');
      }
      process.exit(1);
    });
  }
}

// Only bootstrap when this module is the executed entrypoint. This lets
// unit tests import the helpers above without triggering a child spawn.
// Uses the standard Node ESM "is-main-module" idiom: compare the script
// path Node was launched with (process.argv[1]) against this module's URL.
async function isEntrypointModule(): Promise<boolean> {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    const { pathToFileURL } = await import('node:url');
    return pathToFileURL(entry).href === import.meta.url;
  } catch {
    // On any failure, preserve historical behavior and run — the CLI
    // binary must start even if this check misbehaves.
    return true;
  }
}

if (await isEntrypointModule()) {
  await run();
}
