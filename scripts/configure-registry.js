/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const arg = process.argv[2];
const homedir = os.homedir();
const npmrcPath = path.join(homedir, '.npmrc');
const backupPath = path.join(homedir, '.npmrc.bak');

const GITHUB_REGISTRY_URL = 'https://npm.pkg.github.com/';
const GITHUB_SCOPE = '@google-gemini';
const REGISTRY_LINE = `${GITHUB_SCOPE}:registry=${GITHUB_REGISTRY_URL}`;

function checkGhCli() {
  try {
    execSync('gh --version', { stdio: 'ignore' });
    return true;
  } catch (_e) {
    console.error(
      'Error: The GitHub CLI (`gh`) is not installed or not in your PATH.',
    );
    console.error('Please install it to continue: https://cli.github.com/');
    return false;
  }
}

function getGhAuthStatus() {
  try {
    execSync('gh auth status', { stdio: 'ignore' });
    return true;
  } catch (_e) {
    console.error('Error: You are not logged in to the GitHub CLI (`gh`).');
    console.error(
      "Please run `gh auth login` and ensure you grant the 'read:packages' and 'write:packages' scopes.",
    );
    return false;
  }
}

function getGhAuthToken() {
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf8',
    }).trim();
    if (!token) {
      throw new Error('No token returned from `gh auth token`');
    }
    return token;
  } catch (_e) {
    console.error('Error: Failed to retrieve GitHub auth token.');
    console.error(
      'Please ensure you are logged in (`gh auth status`) and have the correct permissions.',
    );
    return null;
  }
}

function setupDev() {
  console.log(
    'Configuring your global ~/.npmrc for `dev` (GitHub Packages)...',
  );

  if (!checkGhCli() || !getGhAuthStatus()) {
    process.exit(1);
  }

  const token = getGhAuthToken();
  if (!token) {
    process.exit(1);
  }

  const AUTH_LINE = `//npm.pkg.github.com/:_authToken=${token}`;
  let npmrcContent = '';

  if (fs.existsSync(npmrcPath)) {
    npmrcContent = fs.readFileSync(npmrcPath, 'utf-8');
    if (npmrcContent.includes(REGISTRY_LINE)) {
      console.log('✅ Your ~/.npmrc file is already configured for dev.');
      return;
    }
    // Create a backup if one doesn't already exist
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(npmrcPath, backupPath);
      console.log(`Backed up your existing configuration to ${backupPath}`);
    }
  }

  const newContent = [
    npmrcContent,
    `\n# Added by gemini-cli for dev environment`,
    REGISTRY_LINE,
    AUTH_LINE,
  ]
    .join('\n')
    .trim();

  fs.writeFileSync(npmrcPath, newContent + '\n');
  console.log(`✅ Successfully updated your ~/.npmrc file.`);
  console.log(
    'You can now install pre-release packages, e.g., `npm install -g @google-gemini/gemini-cli@<version>`',
  );
}

function setupProd() {
  console.log('Configuring your global ~/.npmrc for `prod` (npmjs.org)...');
  if (!fs.existsSync(npmrcPath)) {
    console.log('No ~/.npmrc file found. Already configured for prod.');
    return;
  }

  let npmrcContent = fs.readFileSync(npmrcPath, 'utf-8');
  const lines = npmrcContent.split('\n');
  const filteredLines = lines.filter(
    (line) =>
      !line.includes('npm.pkg.github.com') &&
      !line.includes('@google-gemini:registry') &&
      !line.includes('# Added by gemini-cli'),
  );

  if (lines.length === filteredLines.length) {
    console.log('✅ Your ~/.npmrc file is already configured for prod.');
    return;
  }

  fs.writeFileSync(npmrcPath, filteredLines.join('\n').trim() + '\n');
  console.log(`✅ Successfully cleaned dev configuration from ~/.npmrc.`);
  if (fs.existsSync(backupPath)) {
    console.log(`Your original configuration was saved to ${backupPath}`);
  }
}

if (arg === 'dev') {
  setupDev();
} else if (arg === 'prod') {
  setupProd();
} else {
  console.error('Invalid argument. Please use `dev` or `prod`.');
  console.error('Usage: node scripts/configure-registry.js <dev|prod>');
  process.exit(1);
}
