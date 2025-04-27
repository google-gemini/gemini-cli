/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';
import { loadCliConfig } from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { GeminiClient } from '@gemini-code/server';
import { readPackageUp } from 'read-package-up';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { execSync, spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// node.js equivalent of scripts/sandbox_command.sh
function sandbox_command(): string {
  const sandbox = process.env.GEMINI_CODE_SANDBOX?.toLowerCase().trim() ?? '';
  const opts: object = { stdio: 'ignore' };
  if (['1', 'true'].includes(sandbox)) {
    // look for docker or podman, in that order
    if (spawnSync('command', ['-v', 'docker'], opts).status === 0) {
      return 'docker'; // Set sandbox to 'docker' if found
    } else if (spawnSync('command', ['-v', 'podman'], opts).status === 0) {
      return 'podman'; // Set sandbox to 'podman' if found
    } else {
      console.error(
        'ERROR: failed to determine command for sandbox; ' +
          'install docker or podman or specify command in GEMINI_CODE_SANDBOX',
      );
      process.exit(1);
    }
  } else if (sandbox) {
    // confirm that specfied command exists
    if (spawnSync('command', ['-v', sandbox], opts).status !== 0) {
      console.error(
        `ERROR: missing sandbox command '${sandbox}' (from GEMINI_CODE_SANDBOX)`,
      );
      process.exit(1);
    }
    return sandbox;
  } else {
    return ''; // no sandbox
  }
}

// node.js equivalent of scripts/start_sandbox.sh
function start_sandbox(sandbox: string) {
  // determine full path for gemini-code to distinguish linked vs installed setting
  const gcPath = execSync(`realpath $(which gemini-code)`).toString().trim();

  // stop if image is missing
  const image = 'gemini-code-sandbox';
  if (!execSync(`${sandbox} images -q ${image}`).toString().trim()) {
    const remedy = gcPath.includes('gemini-code/packages/')
      ? 'Try `scripts/build_sandbox.sh` under gemini-code repo.'
      : 'Please notify gemini-code-dev@google.com.';
    console.error(`ERROR: ${image} is missing. ${remedy}`);
    process.exit(1);
  }

  // stop if debugging in sandbox using linked/installed gemini-code
  // note this is because it does not work (unclear why, parent process interferes somehow)
  // note `npm run debug` runs sandbox directly and avoids any interference from parent process
  if (process.env.DEBUG) {
    console.error(
      'ERROR: cannot debug in sandbox using linked/installed gemini-code; ' +
        'use `npm run debug` under gemini-code repo instead',
    );
    process.exit(1);
  }

  // if project is gemini-code, then run sandboxed CLI from ${workdir}/packages/cli
  // otherwise refuse debug mode (see comments in launch.json around remoteRoot)
  const project = path.basename(process.cwd());
  const workdir = `/sandbox/${project}`;
  let cliPath = '/usr/local/share/npm-global/lib/node_modules/@gemini-code/cli';
  if (project === 'gemini-code') {
    cliPath = `${workdir}/packages/cli`;
  } else if (process.env.DEBUG) {
    console.error('ERROR: cannot debug in sandbox outside gemini-code repo');
    process.exit(1);
  }

  // use interactive tty mode and auto-remove container on exit
  // run init binary inside container to forward signals & reap zombies
  const args = ['run', '-it', '--rm', '--init', '--workdir', workdir];

  // mount current directory as ${workdir} inside container
  args.push('-v', `${process.cwd()}:${workdir}`);

  // mount os.tmpdir() as /tmp inside container
  args.push('-v', `${os.tmpdir()}:/tmp`);

  // name container after image, plus numeric suffix to avoid conflicts
  let index = 0;
  while (
    execSync(
      `${sandbox} ps -a --format "{{.Names}}" | grep "${image}-${index}" || true`,
    )
      .toString()
      .trim()
  ) {
    index++;
  }
  args.push('--name', `${image}-${index}`, '--hostname', `${image}-${index}`);

  // copy GEMINI_API_KEY
  if (process.env.GEMINI_API_KEY) {
    args.push('--env', `GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`);
  }

  // copy GEMINI_CODE_MODEL
  if (process.env.GEMINI_CODE_MODEL) {
    args.push('--env', `GEMINI_CODE_MODEL=${process.env.GEMINI_CODE_MODEL}`);
  }

  // copy SHELL_TOOL to optionally enable shell tool
  if (process.env.SHELL_TOOL) {
    args.push('--env', `SHELL_TOOL=${process.env.SHELL_TOOL}`);
  }

  // copy TERM and COLORTERM to try to maintain terminal setup
  if (process.env.TERM) {
    args.push('--env', `TERM=${process.env.TERM}`);
  }
  if (process.env.COLORTERM) {
    args.push('--env', `COLORTERM=${process.env.COLORTERM}`);
  }

  // set SANDBOX as container name
  args.push('--env', `SANDBOX=${image}-${index}`);

  // for podman, use empty --authfile to skip unnecessary auth refresh overhead
  const emptyAuthFilePath = path.join(os.tmpdir(), 'empty_auth.json');
  fs.writeFileSync(emptyAuthFilePath, '{}', 'utf-8');
  args.push('--authfile', emptyAuthFilePath);

  // enable debugging via node --inspect-brk if DEBUG is set
  const nodeArgs = [];
  const debugPort = process.env.DEBUG_PORT || '9229';
  if (process.env.DEBUG) {
    args.push('-p', `${debugPort}:${debugPort}`);
    nodeArgs.push('--inspect-brk', `0.0.0.0:${debugPort}`);
  }

  // append remaining args (image, node, node args, cli path, cli args)
  args.push(image, 'node', ...nodeArgs, cliPath, ...process.argv.slice(2));

  // spawn child and let it inherit stdio
  spawnSync(sandbox, args, { stdio: 'inherit' });
}

async function main() {
  const config = loadCliConfig();
  let input = config.getQuestion();

  // hop into sandbox if enabled but outside
  const sandbox = sandbox_command();
  if (sandbox && !process.env.SANDBOX) {
    console.log('hopping into sandbox ...');
    start_sandbox(sandbox);
    process.exit(0);
  }

  // Render UI, passing necessary config values. Check that there is no command line question.
  if (process.stdin.isTTY && input?.length === 0) {
    const readUpResult = await readPackageUp({ cwd: __dirname });
    const cliVersion =
      process.env.CLI_VERSION || readUpResult?.packageJson.version || 'unknown';

    render(
      React.createElement(App, {
        config,
        cliVersion,
      }),
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

  // If not a TTY and we have initial input, process it directly
  const geminiClient = new GeminiClient(config);
  const chat = await geminiClient.startChat();
  try {
    for await (const event of geminiClient.sendMessageStream(chat, [
      { text: input },
    ])) {
      if (event.type === 'content') {
        process.stdout.write(event.value);
      }
      // We might need to handle other event types later, but for now, just content.
    }
    process.stdout.write('\n'); // Add a newline at the end
    process.exit(0);
  } catch (error) {
    console.error('Error processing piped input:', error);
    process.exit(1);
  }
}

// --- Global Unhandled Rejection Handler ---
process.on('unhandledRejection', (reason, _promise) => {
  // Check if this is the known 429 ClientError that sometimes escapes
  // this is a workaround for a specific issue with the way we are calling gemini
  // where a 429 error is thrown but not caught, causing an unhandled rejection
  // TODO(adh): Remove this when the race condition is fixed
  const isKnownEscaped429 =
    reason instanceof Error &&
    reason.name === 'ClientError' &&
    reason.message.includes('got status: 429');

  if (isKnownEscaped429) {
    // Log it differently and DON'T exit, as it's likely already handled visually
    console.warn('-----------------------------------------');
    console.warn(
      'WORKAROUND: Suppressed known escaped 429 Unhandled Rejection.',
    );
    console.warn('-----------------------------------------');
    console.warn('Reason:', reason);
    return;
    // No process.exit(1); Don't exit.
  }

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

// --- Global Entry Point ---
main().catch((error) => {
  console.error('An unexpected critical error occurred:');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
