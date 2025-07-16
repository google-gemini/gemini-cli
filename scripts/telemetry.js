#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const projectRoot = join(import.meta.dirname, '..');

const SETTINGS_DIRECTORY_NAME = '.gemini';
const USER_SETTINGS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '',
  SETTINGS_DIRECTORY_NAME,
);
const USER_SETTINGS_PATH = join(USER_SETTINGS_DIR, 'settings.json');
const WORKSPACE_SETTINGS_PATH = join(
  projectRoot,
  SETTINGS_DIRECTORY_NAME,
  'settings.json',
);

let settingsTarget = undefined;

function loadSettingsValue(filePath) {
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      const jsonContent = content.replace(/\/\/[^\n]*/g, '');
      const settings = JSON.parse(jsonContent);
      return settings.telemetry?.target;
    }
  } catch (e) {
    console.warn(
      `⚠️ Warning: Could not parse settings file at ${filePath}: ${e.message}`,
    );
  }
  return undefined;
}

settingsTarget = loadSettingsValue(WORKSPACE_SETTINGS_PATH);

if (!settingsTarget) {
  settingsTarget = loadSettingsValue(USER_SETTINGS_PATH);
}

let target = settingsTarget || 'local';
const allowedTargets = ['local', 'gcp'];

const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
if (targetArg) {
  const potentialTarget = targetArg.split('=')[1];
  if (allowedTargets.includes(potentialTarget)) {
    target = potentialTarget;
    console.log(`⚙️  Using command-line target: ${target}`);
  } else {
    console.error(
      `🛑 Error: Invalid target '${potentialTarget}'. Allowed targets are: ${allowedTargets.join(', ')}.`,
    );
    process.exit(1);
  }
} else if (settingsTarget) {
  console.log(
    `⚙️ Using telemetry target from settings.json: ${settingsTarget}`,
  );
}

const scriptPath = join(
  projectRoot,
  'scripts',
  target === 'gcp' ? 'telemetry_gcp.js' : 'local_telemetry.js',
);

try {
  console.log(`🚀 Running telemetry script for target: ${target}.`);
  execSync(`node ${scriptPath}`, { stdio: 'inherit', cwd: projectRoot });
} catch (error) {
  console.error(`🛑 Failed to run telemetry script for target: ${target}`);
  console.error(error);
  process.exit(1);
}
