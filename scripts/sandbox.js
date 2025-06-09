/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { execSync, spawn } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

try {
  execSync('node scripts/sandbox_command.js -q');
} catch {
  console.error('ERROR: sandboxing disabled. See docs to enable sandboxing.');
  process.exit(1);
}

const argv = yargs(hideBin(process.argv)).option('i', {
  alias: 'interactive',
  type: 'boolean',
  default: false,
}).argv;

if (argv.i && !process.stdin.isTTY) {
  console.error(
    'ERROR: interactive mode (-i) requested without a terminal attached',
  );
  process.exit(1);
}

const image = 'gemini-cli-sandbox';
const sandboxCommand = execSync('node scripts/sandbox_command.js')
  .toString()
  .trim();

const sandboxes = execSync(
  `${sandboxCommand} ps --filter "ancestor=${image}" --format "{{.Names}}"`,
)
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);

let sandboxName;
const firstArg = argv._[0];

if (firstArg) {
  if (firstArg.startsWith(image) || /^\d+$/.test(firstArg)) {
    sandboxName = firstArg.startsWith(image)
      ? firstArg
      : `${image}-${firstArg}`;
    argv._.shift();
  }
}

if (!sandboxName) {
  if (sandboxes.length === 0) {
    console.error(
      'No sandboxes found. Are you running gemini-cli with sandboxing enabled?',
    );
    process.exit(1);
  }
  if (sandboxes.length > 1) {
    console.error('Multiple sandboxes found:');
    sandboxes.forEach((s) => console.error(`  ${s}`));
    console.error(
      'Sandbox name or index (0,1,...) must be specified as first argument',
    );
    process.exit(1);
  }
  sandboxName = sandboxes[0];
}

if (!sandboxes.includes(sandboxName)) {
  console.error(`unknown sandbox ${sandboxName}`);
  console.error('known sandboxes:');
  sandboxes.forEach((s) => console.error(`  ${s}`));
  process.exit(1);
}

const execArgs = [];
let commandToRun = [];

// Determine interactive flags.
// If a command is provided, only be interactive if -i is passed.
// If no command is provided, always be interactive.
if (argv._.length > 0) {
  if (argv.i) {
    execArgs.push('-it');
  }
} else {
  execArgs.push('-it');
}

// Determine the command to run inside the container.
if (argv._.length > 0) {
  // Join all positional arguments into a single command string.
  const userCommand = argv._.join(' ');
  // The container is Linux, so we use bash -l -c to execute the command string.
  // This is cross-platform because it's what the container runs, not the host.
  commandToRun = ['bash', '-l', '-c', userCommand];
} else {
  // No command provided, so we start an interactive bash login shell.
  commandToRun = ['bash', '-l'];
}

const spawnArgs = ['exec', ...execArgs, sandboxName, ...commandToRun];

// Use spawn to avoid shell injection issues and handle arguments correctly.
spawn(sandboxCommand, spawnArgs, { stdio: 'inherit' });
