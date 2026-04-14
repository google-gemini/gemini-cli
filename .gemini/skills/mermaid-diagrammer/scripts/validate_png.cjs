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

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node validate_png.cjs <path_to_png>');
  process.exit(1);
}

const filePath = path.resolve(args[0]);

if (!fs.existsSync(filePath)) {
  console.error(`Error: File not found: ${filePath}`);
  process.exit(1);
}

const stats = fs.statSync(filePath);
if (stats.size === 0) {
  console.error(`Error: File is empty: ${filePath}`);
  process.exit(1);
}

const buffer = Buffer.alloc(8);
const fd = fs.openSync(filePath, 'r');
fs.readSync(fd, buffer, 0, 8, 0);
fs.closeSync(fd);

// PNG Magic Numbers: 89 50 4E 47 0D 0A 1A 0A
const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

if (!buffer.equals(pngHeader)) {
  console.error(`Error: File is not a valid PNG: ${filePath}`);
  process.exit(1);
}

console.log(`Success: ${filePath} is a valid PNG file (${stats.size} bytes).`);
