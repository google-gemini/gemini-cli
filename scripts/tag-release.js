/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

function getVersion() {
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

function getShortSha() {
  return execSync('git rev-parse --short HEAD').toString().trim();
}

function getNightlyTagName() {
  const version = getVersion();
  const now = new Date();
  const year = now.getUTCFullYear().toString().slice(-2);
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  const date = `${year}${month}${day}`;

  const sha = getShortSha();
  return `v${version}-nightly.${date}.${sha}`;
}

function createAndPushTag(tagName, isSigned, isDryRun) {
  // Check if the tag already exists
  try {
    execSync(`git rev-parse ${tagName}`, { stdio: 'pipe' });
    console.log(`Tag ${tagName} already exists.`);
    if (isDryRun) {
      process.stdout.write(tagName);
    }
    return;
  } catch (error) {
    // An error means the tag doesn't exist, so we can proceed.
  }

  const command = isSigned
    ? `git tag -s -a ${tagName} -m ''`
    : `git tag ${tagName}`;

  if (isDryRun) {
    // In a dry run, we just print the tag name and exit.
    process.stdout.write(tagName);
    return;
  }

  try {
    execSync(command, { stdio: 'pipe' });
    execSync(`git push origin ${tagName}`, { stdio: 'pipe' });
    console.log(`Successfully created and pushed tag: ${tagName}`);
  } catch (error) {
    console.error(`Failed to create or push tag: ${tagName}`);
    console.error(error.stderr.toString());
    process.exit(1);
  }
}

const tagName = getNightlyTagName();
const shouldSign = !process.env.CI;
const isDryRun = process.argv.includes('--dry-run');

createAndPushTag(tagName, shouldSign, isDryRun);
