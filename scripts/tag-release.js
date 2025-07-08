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

function createAndPushTag(tagName, isSigned) {
  const command = isSigned
    ? `git tag -s -a ${tagName} -m ''`
    : `git tag ${tagName}`;

  try {
    console.log(`Executing: ${command}`);
    execSync(command, { stdio: 'inherit' });
    console.log(`Successfully created tag: ${tagName}`);

    console.log(`Pushing tag to origin...`);
    execSync(`git push origin ${tagName}`, { stdio: 'inherit' });
    console.log(`Successfully pushed tag: ${tagName}`);
  } catch (error) {
    console.error(`Failed to create or push tag: ${tagName}`);
    console.error(error);
    process.exit(1);
  }
}

const tagName = getNightlyTagName();
// In GitHub Actions, the CI variable is set to true.
// We will create a signed commit if not in a CI environment.
const shouldSign = !process.env.CI;

createAndPushTag(tagName, shouldSign);
