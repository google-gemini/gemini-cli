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
const distDir = join(root, 'dist');

// Create the bundle and dist directories if they don't exist
if (!existsSync(bundleDir)) {
  mkdirSync(bundleDir);
}
if (!existsSync(distDir)) {
  mkdirSync(distDir);
}

function copyToDirs(src, destSubPath) {
  const isDir =
    existsSync(src) &&
    !src.endsWith('.sb') &&
    !src.endsWith('.toml') &&
    !src.endsWith('.json');
  if (isDir) {
    cpSync(src, join(bundleDir, destSubPath), {
      recursive: true,
      dereference: true,
    });
    cpSync(src, join(distDir, destSubPath), {
      recursive: true,
      dereference: true,
    });
  } else {
    copyFileSync(src, join(bundleDir, destSubPath));
    copyFileSync(src, join(distDir, destSubPath));
  }
}

// 1. Copy Sandbox definitions (.sb)
const sbFiles = glob.sync('packages/**/*.sb', { cwd: root });
for (const file of sbFiles) {
  copyToDirs(join(root, file), basename(file));
}

// 2. Copy Policy definitions (.toml)
const policyDirBundle = join(bundleDir, 'policies');
const policyDirDist = join(distDir, 'policies');
if (!existsSync(policyDirBundle)) mkdirSync(policyDirBundle);
if (!existsSync(policyDirDist)) mkdirSync(policyDirDist);

// Locate policy files specifically in the core package
const policyFiles = glob.sync('packages/core/src/policy/policies/*.toml', {
  cwd: root,
});

for (const file of policyFiles) {
  copyFileSync(join(root, file), join(policyDirBundle, basename(file)));
  copyFileSync(join(root, file), join(policyDirDist, basename(file)));
}

console.log(
  `Copied ${policyFiles.length} policy files to bundle/policies/ and dist/policies/`,
);

// 3. Copy Documentation (docs/)
const docsSrc = join(root, 'docs');
if (existsSync(docsSrc)) {
  copyToDirs(docsSrc, 'docs');
  console.log('Copied docs to bundle/docs/ and dist/docs/');
}

// 4. Copy Built-in Skills (packages/core/src/skills/builtin)
const builtinSkillsSrc = join(root, 'packages/core/src/skills/builtin');
if (existsSync(builtinSkillsSrc)) {
  copyToDirs(builtinSkillsSrc, 'builtin');
  console.log('Copied built-in skills to bundle/builtin/ and dist/builtin/');
}

// 5. Copy DevTools package so the external dynamic import resolves at runtime
const devtoolsSrc = join(root, 'packages/devtools');
const devtoolsDestBundle = join(
  bundleDir,
  'node_modules',
  '@google',
  'gemini-cli-devtools',
);
const devtoolsDestDist = join(
  distDir,
  'node_modules',
  '@google',
  'gemini-cli-devtools',
);
const devtoolsDistSrc = join(devtoolsSrc, 'dist');

if (existsSync(devtoolsDistSrc)) {
  mkdirSync(devtoolsDestBundle, { recursive: true });
  mkdirSync(devtoolsDestDist, { recursive: true });

  cpSync(devtoolsDistSrc, join(devtoolsDestBundle, 'dist'), {
    recursive: true,
    dereference: true,
  });
  cpSync(devtoolsDistSrc, join(devtoolsDestDist, 'dist'), {
    recursive: true,
    dereference: true,
  });

  copyFileSync(
    join(devtoolsSrc, 'package.json'),
    join(devtoolsDestBundle, 'package.json'),
  );
  copyFileSync(
    join(devtoolsSrc, 'package.json'),
    join(devtoolsDestDist, 'package.json'),
  );
  console.log(
    'Copied devtools package to bundle/node_modules/ and dist/node_modules/',
  );
}

// 6. Copy bundled chrome-devtools-mcp
const bundleMcpSrc = join(root, 'packages/core/dist/bundled');
if (existsSync(bundleMcpSrc)) {
  copyToDirs(bundleMcpSrc, 'bundled');
  console.log(
    'Copied bundled chrome-devtools-mcp to bundle/bundled/ and dist/bundled/',
  );
}

console.log('Assets copied to bundle/ and dist/');
