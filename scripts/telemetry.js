#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { GEMINI_DIR } from '@google/gemini-cli-core';

const projectRoot = join(import.meta.dirname, '..');

const USER_SETTINGS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '',
  GEMINI_DIR,
);
const USER_SETTINGS_PATH = join(USER_SETTINGS_DIR, 'settings.json');
const WORKSPACE_SETTINGS_PATH = join(projectRoot, GEMINI_DIR, 'settings.json');

let telemetrySettings = undefined;

function loadSettings(filePath) {
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      const jsonContent = content.replace(/\/\/[^\n]*/g, '');
      const settings = JSON.parse(jsonContent);
      return settings.telemetry;
    }
  } catch (e) {
    console.warn(
      `⚠️ Warning: Could not parse settings file at ${filePath}: ${e.message}`,
    );
  }
  return undefined;
}

telemetrySettings = loadSettings(WORKSPACE_SETTINGS_PATH);

if (!telemetrySettings) {
  telemetrySettings = loadSettings(USER_SETTINGS_PATH);
}

let target = telemetrySettings?.target || 'local';
const allowedTargets = ['local', 'gcp', 'genkit'];

const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
if (targetArg) {
  const potentialTarget = targetArg.split('=')[1];
  if (allowedTargets.includes(potentialTarget)) {
    target = potentialTarget;
    console.log(`⚙️  Using command-line target: ${target}`);
  } else {
    console.error(
      `🛑 Error: Invalid target '${potentialTarget}'. Allowed targets are: ${allowedTargets.join(
        ', ',
      )}.`,
    );
    process.exit(1);
  }
} else if (telemetrySettings?.target) {
  console.log(
    `⚙️ Using telemetry target from settings.json: ${telemetrySettings.target}`,
  );
}

const targetScripts = {
  gcp: 'telemetry_gcp.js',
  local: 'local_telemetry.js',
  genkit: 'telemetry_genkit.js',
};

const scriptPath = join(projectRoot, 'scripts', targetScripts[target]);

try {
  console.log(`🚀 Running telemetry script for target: ${target}.`);
  const env = { ...process.env };

  execFileSync('node', [scriptPath], {
    stdio: 'inherit',
    cwd: projectRoot,
    env,
  });
} catch (error) {
  console.error(`🛑 Failed to run telemetry script for target: ${target}`);
  console.error(error);
  process.exit(1);
}
