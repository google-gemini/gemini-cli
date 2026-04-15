#!/usr/bin/env node

/**
 * Copyright 2026 Google LLC
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     https://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node convert.cjs <input.mmd> <output.png> [mermaid_cli_options...]');
  console.error('Defaults: --scale 3, -b transparent');
  process.exit(1);
}

const inputPath = path.resolve(args[0]);
const outputPath = path.resolve(args[1]);

if (!fs.existsSync(inputPath)) {
  console.error(`Error: Input file not found: ${inputPath}`);
  process.exit(1);
}

const extraArgs = args.slice(2);

console.log(`Converting ${inputPath} to ${outputPath}...`);
if (extraArgs.length > 0) {
  console.log(`With extra arguments: ${extraArgs.join(' ')}`);
}

const result = spawnSync('npx', [
  '--yes',
  '@mermaid-js/mermaid-cli',
  '-i', inputPath,
  '-o', outputPath,
  '-b', 'white',
  '--scale', '3',
  ...extraArgs
], { stdio: 'pipe', encoding: 'utf-8' });

if (result.status !== 0) {
  console.error('Failed to convert Mermaid diagram:');
  console.error(result.stderr);
  process.exit(1);
}

console.log('Successfully converted Mermaid diagram to PNG.');
