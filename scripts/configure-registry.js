/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview This script automates the configuration of the user's
 * global .npmrc file to work with this repository's development workflow.
 *
 * Rationale:
 * This project uses a hybrid registry setup:
 * - Production packages (`@google/gemini-cli`) are on the public npmjs.org registry.
 * - Pre-release packages (`@google-gemini/gemini-cli`) are on the GitHub Packages registry.
 *
 * This script provides a consistent, automated, and less error-prone way to
 * configure the necessary scopes and authentication for both registries. It
 * backs up the user's existing .npmrc, making it a safe, one-time setup.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const homedir = os.homedir();
const npmrcPath = path.join(homedir, '.npmrc');
const backupPath = path.join(homedir, '.npmrc.bak');

const GITHUB_REGISTRY_URL = 'https://npm.pkg.github.com/';
const GITHUB_SCOPE = '@google-gemini';
const PROD_SCOPE = '@google';
const PROD_REGISTRY_URL = 'https://registry.npmjs.org/';

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

function setupNpmrc() {
  console.log('Configuring your global ~/.npmrc for development...');

  if (!checkGhCli() || !getGhAuthStatus()) {
    process.exit(1);
  }

  const token = getGhAuthToken();
  if (!token) {
    process.exit(1);
  }

  // Back up the original .npmrc if it exists and a backup doesn't already.
  if (fs.existsSync(npmrcPath) && !fs.existsSync(backupPath)) {
    fs.copyFileSync(npmrcPath, backupPath);
    console.log(`Backed up your existing configuration to ${backupPath}`);
  }

  const newContent = [
    `# Added by gemini-cli setup`,
    `# Configures scopes for both production and development registries`,
    ``,
    `# Production packages from npmjs.org`,
    `${PROD_SCOPE}:registry=${PROD_REGISTRY_URL}`,
    ``,
    `# Pre-release packages from GitHub Packages`,
    `${GITHUB_SCOPE}:registry=${GITHUB_REGISTRY_URL}`,
    `//${new URL(GITHUB_REGISTRY_URL).hostname}/:_authToken=${token}`,
    ``,
  ].join('\n');

  fs.writeFileSync(npmrcPath, newContent);
  console.log(`✅ Successfully configured your ~/.npmrc file.`);
  console.log('You can now install both production and pre-release packages.');
}

setupNpmrc();
