/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { constants } from 'node:os';
import { summarizeProfiles } from './startup-profile.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function getPreloadOption(preloadUrl) {
  // Sandboxes can inherit NODE_OPTIONS without access to the host checkout.
  // An optional data-URL loader allows that CLI to run without the profiler.
  const source = `if (process.env.GEMINI_STARTUP_PROFILE_RUN_DIR) await import(${JSON.stringify(preloadUrl)}).catch(() => {});`;
  return `--import=data:text/javascript,${encodeURIComponent(source)}`;
}

export function readSummary(directory) {
  const profiles = readdirSync(directory)
    .filter((name) => /^process-\d+\.json$/.test(name))
    .flatMap((name) => {
      try {
        return [JSON.parse(readFileSync(join(directory, name), 'utf8'))];
      } catch {
        // A killed child may leave no final snapshot, or an incomplete file.
        return [];
      }
    });
  return summarizeProfiles(profiles);
}

export async function runStartupProfile({
  args = process.argv.slice(2),
  env = process.env,
  output = process.stderr,
} = {}) {
  if (!env['npm_execpath']) {
    output.write('Run this profiler with npm run start:profile.\n');
    return 1;
  }
  let directory;
  let launchEnv = env;
  try {
    const parent = resolve(
      env['GEMINI_STARTUP_PROFILE_DIR'] ||
        join(root, '.gemini/startup-profiles'),
    );
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    const prefix = new Date().toISOString().replace(/[:.]/g, '-');
    directory = mkdtempSync(join(parent, `${prefix}-`));
    const option = getPreloadOption(
      new URL('./startup-profile-preload.js', import.meta.url).href,
    );
    launchEnv = {
      ...env,
      NODE_OPTIONS: [env['NODE_OPTIONS'], option].filter(Boolean).join(' '),
      GEMINI_STARTUP_PROFILE_RUN_DIR: directory,
      GEMINI_STARTUP_PROFILE_LAUNCH_TIME: String(Date.now()),
    };
    output.write(`[startup profile] Reports: ${directory}\n`);
  } catch {
    output.write(
      '[startup profile] Cannot create reports; running npm start.\n',
    );
  }

  const result = await new Promise((resolveResult) => {
    const child = spawn(
      process.execPath,
      [env['npm_execpath'], 'start', '--', ...args],
      { cwd: root, env: launchEnv, stdio: 'inherit' },
    );
    // Like the CLI supervisor, keep this wrapper alive for the final report.
    // Foreground terminal signals also reach its children. Forwarding here
    // would deliver Ctrl-C twice; detached groups would change terminal control.
    const keepAlive = () => {};
    const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    for (const signal of signals) process.on(signal, keepAlive);
    const cleanup = () => {
      for (const signal of signals) process.off(signal, keepAlive);
    };
    child.once('error', () => {
      cleanup();
      output.write('[startup profile] Could not launch npm start.\n');
      resolveResult(1);
    });
    child.once('close', (code, signal) => {
      cleanup();
      resolveResult(code ?? 128 + (constants.signals[signal] || 1));
    });
  });

  if (directory) {
    try {
      const summary = readSummary(directory);
      writeFileSync(
        join(directory, 'summary.json'),
        JSON.stringify(summary, null, 2) + '\n',
        { mode: 0o600 },
      );
      if (summary.cliStartupEndMs !== undefined) {
        output.write(
          `[startup profile] CLI startup phase ended at ${summary.cliStartupEndMs} ms (before UI rendering).\n` +
            `[startup profile] CLI main began at ${summary.launchToCliMainMs} ms; time before main in the CLI process: ${summary.preMainMs} ms.\n`,
        );
      } else {
        output.write(
          '[startup profile] No completed cli_startup phase was observed.\n',
        );
      }
      output.write(
        `[startup profile] Summary: ${join(directory, 'summary.json')}\n`,
      );
    } catch {
      output.write('[startup profile] Could not write the timing summary.\n');
    }
  }
  return result;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  process.exitCode = await runStartupProfile();
}
