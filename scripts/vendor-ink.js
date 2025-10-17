/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

const inkRepo = 'https://github.com/jacob314/ink.git';
const inkCommit = 'b9e7025a4b624c3010e18caf7f504a0279d61fe9';
const vendorDir = join(root, 'third_party');
const inkDir = join(vendorDir, 'ink');
const cliPackageJsonPath = join(root, 'packages/cli/package.json');

function main() {
  console.log(
    'Ensuring vendored ink dependency is clean by starting from scratch...',
  );
  // Simple, non-idempotent approach: always remove and re-clone.
  rmSync(inkDir, { recursive: true, force: true });

  console.log(`Cloning ink repository into ${inkDir}...`);
  execFileSync('git', ['clone', inkRepo, inkDir], { stdio: 'inherit' });

  console.log(`Checking out ink commit ${inkCommit}...`);
  execFileSync('git', ['checkout', inkCommit], {
    stdio: 'inherit',
    cwd: inkDir,
  });

  console.log('Installing ink dependencies and building...');
  execSync('npm install', { stdio: 'inherit', cwd: inkDir });
  execSync('npm shrinkwrap', { stdio: 'inherit', cwd: inkDir });
  execSync('npm run build', { stdio: 'inherit', cwd: inkDir });

  console.log('Removing prepare script from ink package.json...');
  const inkPackageJsonPath = join(inkDir, 'package.json');
  const inkPackageJson = JSON.parse(readFileSync(inkPackageJsonPath, 'utf-8'));
  delete inkPackageJson.scripts.prepare;
  writeFileSync(
    inkPackageJsonPath,
    JSON.stringify(inkPackageJson, null, 2) + '\n',
  );

  console.log(`Updating ${cliPackageJsonPath} to use local ink...`);
  const packageJson = JSON.parse(readFileSync(cliPackageJsonPath, 'utf-8'));
  const localInkPath = `file:../../third_party/ink`;
  packageJson.dependencies.ink = localInkPath;
  writeFileSync(
    cliPackageJsonPath,
    JSON.stringify(packageJson, null, 2) + '\n',
  );
  console.log('Successfully updated ink dependency to local path.');
}

main();
