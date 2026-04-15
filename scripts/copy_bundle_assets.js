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

import { copyFileSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const bundleDir = join(root, 'bundle');

// Create the bundle directory if it doesn't exist
if (!existsSync(bundleDir)) {
  mkdirSync(bundleDir);
}

// 1. Copy Sandbox definitions (.sb)
const sbFiles = glob.sync('packages/**/*.sb', { cwd: root });
for (const file of sbFiles) {
  copyFileSync(join(root, file), join(bundleDir, basename(file)));
}

// 2. Copy Policy definitions (.toml)
const policyDir = join(bundleDir, 'policies');
if (!existsSync(policyDir)) {
  mkdirSync(policyDir);
}

// Locate policy files specifically in the core package
const policyFiles = glob.sync('packages/core/src/policy/policies/*.toml', {
  cwd: root,
});

for (const file of policyFiles) {
  copyFileSync(join(root, file), join(policyDir, basename(file)));
}

console.log(`Copied ${policyFiles.length} policy files to bundle/policies/`);

// 3. Copy Documentation (docs/)
const docsSrc = join(root, 'docs');
const docsDest = join(bundleDir, 'docs');
if (existsSync(docsSrc)) {
  cpSync(docsSrc, docsDest, { recursive: true, dereference: true });
  console.log('Copied docs to bundle/docs/');
}

// 4. Copy Built-in Skills (packages/core/src/skills/builtin)
const builtinSkillsSrc = join(root, 'packages/core/src/skills/builtin');
const builtinSkillsDest = join(bundleDir, 'builtin');
if (existsSync(builtinSkillsSrc)) {
  cpSync(builtinSkillsSrc, builtinSkillsDest, {
    recursive: true,
    dereference: true,
  });
  console.log('Copied built-in skills to bundle/builtin/');
}

// 5. Copy DevTools package so the external dynamic import resolves at runtime
const devtoolsSrc = join(root, 'packages/devtools');
const devtoolsDest = join(
  bundleDir,
  'node_modules',
  '@google',
  'gemini-cli-devtools',
);
const devtoolsDistSrc = join(devtoolsSrc, 'dist');
if (existsSync(devtoolsDistSrc)) {
  mkdirSync(devtoolsDest, { recursive: true });
  cpSync(devtoolsDistSrc, join(devtoolsDest, 'dist'), {
    recursive: true,
    dereference: true,
  });
  copyFileSync(
    join(devtoolsSrc, 'package.json'),
    join(devtoolsDest, 'package.json'),
  );
  console.log('Copied devtools package to bundle/node_modules/');
}

// 6. Copy bundled chrome-devtools-mcp
const bundleMcpSrc = join(root, 'packages/core/dist/bundled');
const bundleMcpDest = join(bundleDir, 'bundled');
if (!existsSync(bundleMcpSrc)) {
  console.error(
    `Error: chrome-devtools-mcp bundle not found at ${bundleMcpSrc}.\n` +
      `Run "npm run bundle:browser-mcp -w @google/gemini-cli-core" first.`,
  );
  process.exit(1);
}
cpSync(bundleMcpSrc, bundleMcpDest, { recursive: true, dereference: true });
console.log('Copied bundled chrome-devtools-mcp to bundle/bundled/');

// 7. Copy pre-built ripgrep vendor binaries
const ripgrepVendorSrc = join(root, 'packages/core/vendor/ripgrep');
const ripgrepVendorDest = join(bundleDir, 'vendor', 'ripgrep');
if (existsSync(ripgrepVendorSrc)) {
  mkdirSync(ripgrepVendorDest, { recursive: true });
  cpSync(ripgrepVendorSrc, ripgrepVendorDest, {
    recursive: true,
    dereference: true,
  });
  console.log('Copied ripgrep vendor binaries to bundle/vendor/ripgrep/');
}

console.log('Assets copied to bundle/');
