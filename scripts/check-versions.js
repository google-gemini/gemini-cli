/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'fs';
import path from 'path';

function readPackageJson(dir) {
  const p = path.join(dir, 'package.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

const root = readPackageJson('.');
const cli = readPackageJson('packages/cli');
const core = readPackageJson('packages/core');

const errors = [];

console.log('Checking version consistency...');

// 1. Check that all package versions are the same.
if (root.version !== cli.version || root.version !== core.version) {
  errors.push(
    `Version mismatch: root (${root.version}), cli (${cli.version}), core (${core.version})`,
  );
} else {
  console.log(`- All packages are at version ${root.version}.`);
}

// 2. Check that the cli's dependency on core matches the core version.
const coreDepVersion = cli.dependencies['@google/gemini-cli-core'];
const expectedCoreVersion = `^${core.version}`;
if (
  coreDepVersion !== expectedCoreVersion &&
  coreDepVersion !== 'file:../core'
) {
  errors.push(
    `CLI dependency on core is wrong: expected ${expectedCoreVersion} or "file:../core", got ${coreDepVersion}`,
  );
} else {
  console.log(`- CLI dependency on core (${coreDepVersion}) is correct.`);
}

// 3. Check that the sandbox image tag matches the root version.
const imageUri = root.config.sandboxImageUri;
const imageTag = imageUri.split(':').pop();
if (imageTag !== root.version) {
  errors.push(
    `Sandbox image tag mismatch: expected ${root.version}, got ${imageTag}`,
  );
} else {
  console.log(`- Sandbox image tag (${imageTag}) is correct.`);
}

if (errors.length > 0) {
  console.error('\nVersion consistency checks failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('\nAll version checks passed!');
