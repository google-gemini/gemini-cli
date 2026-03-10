/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Compiles the GeminiSandbox C# helper on Windows.
 * This is used to provide native restricted token sandboxing.
 */
function compileWindowsSandbox(): void {
  if (os.platform() !== 'win32') {
    return;
  }

  const helperPath = path.resolve(__dirname, '../src/services/scripts/GeminiSandbox.exe');
  const sourcePath = path.resolve(__dirname, '../src/services/scripts/GeminiSandbox.cs');

  if (!fs.existsSync(sourcePath)) {
    console.error(`Sandbox source not found at ${sourcePath}`);
    return;
  }

  // Find csc.exe (C# Compiler) which is built into Windows .NET Framework
  const systemRoot = process.env['SystemRoot'] || 'C:\\Windows';
  const cscPaths = [
    path.join(systemRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(systemRoot, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];

  const csc = cscPaths.find(p => fs.existsSync(p));

  if (!csc) {
    console.warn('Windows C# compiler (csc.exe) not found. Native sandboxing will attempt to compile on first run.');
    return;
  }

  console.log(`Compiling native Windows sandbox helper...`);
  const result = spawnSync(csc, [`/out:${helperPath}`, '/optimize', sourcePath], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error('Failed to compile Windows sandbox helper.');
  } else {
    console.log('Successfully compiled GeminiSandbox.exe');
  }
}

compileWindowsSandbox();
