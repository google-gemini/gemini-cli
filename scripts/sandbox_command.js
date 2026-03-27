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

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import stripJsonComments from 'strip-json-comments';
import os from 'node:os';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import { GEMINI_DIR, Storage } from '@google/gemini-cli-core';

export function findSandboxEnvFile(startDir, userConfigDir) {
  let currentDir = startDir;
  while (true) {
    const geminiEnv = join(currentDir, GEMINI_DIR, '.env');
    if (existsSync(geminiEnv)) {
      return geminiEnv;
    }

    const regularEnv = join(currentDir, '.env');
    if (existsSync(regularEnv)) {
      return regularEnv;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      const userGeminiEnv = join(userConfigDir, '.env');
      if (existsSync(userGeminiEnv)) {
        return userGeminiEnv;
      }
      return null;
    }
    currentDir = parentDir;
  }
}

const commandExists = (cmd) => {
  const checkCommand = os.platform() === 'win32' ? 'where' : 'command -v';
  try {
    execSync(`${checkCommand} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    if (os.platform() === 'win32') {
      try {
        execSync(`${checkCommand} ${cmd}.exe`, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
};

function resolveGeminiSandbox() {
  let geminiSandbox = process.env.GEMINI_SANDBOX;

  if (!geminiSandbox) {
    const userSettingsFile = join(
      Storage.getGlobalGeminiDir(),
      'settings.json',
    );
    if (existsSync(userSettingsFile)) {
      const settings = JSON.parse(
        stripJsonComments(readFileSync(userSettingsFile, 'utf-8')),
      );
      if (settings.sandbox) {
        geminiSandbox = settings.sandbox;
      }
    }
  }

  if (!geminiSandbox) {
    const envPath = findSandboxEnvFile(
      process.cwd(),
      Storage.getGlobalGeminiDir(),
    );
    if (envPath) {
      dotenv.config({ path: envPath, quiet: true });
    }
    geminiSandbox = process.env.GEMINI_SANDBOX;
  }

  return (geminiSandbox || '').toLowerCase();
}

export function getSandboxCommand() {
  const geminiSandbox = resolveGeminiSandbox();

  if (['1', 'true'].includes(geminiSandbox)) {
    if (commandExists('docker')) {
      return 'docker';
    }
    if (commandExists('podman')) {
      return 'podman';
    }
    throw new Error(
      'ERROR: install docker or podman or specify command in GEMINI_SANDBOX',
    );
  }

  if (geminiSandbox && !['0', 'false'].includes(geminiSandbox)) {
    if (commandExists(geminiSandbox)) {
      return geminiSandbox;
    }
    throw new Error(
      `ERROR: missing sandbox command '${geminiSandbox}' (from GEMINI_SANDBOX)`,
    );
  }

  if (os.platform() === 'darwin' && process.env.SEATBELT_PROFILE !== 'none') {
    if (commandExists('sandbox-exec')) {
      return 'sandbox-exec';
    }
    return '';
  }

  return '';
}

function isExecutedDirectly() {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }

  return resolve(entrypoint) === fileURLToPath(import.meta.url);
}

function main() {
  const argv = yargs(hideBin(process.argv)).option('q', {
    alias: 'quiet',
    type: 'boolean',
    default: false,
  }).argv;

  let command = '';
  try {
    command = getSandboxCommand();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  if (!command) {
    return 1;
  }

  if (!argv.q) {
    console.log(command);
  }
  return 0;
}

if (isExecutedDirectly()) {
  process.exit(main());
}
