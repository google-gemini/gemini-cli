/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-env node */

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
function compileWindowsSandbox() {
  if (os.platform() !== 'win32') {
    return;
  }

  const srcHelperPath = path.resolve(
    __dirname,
    '../src/services/scripts/GeminiSandbox.exe',
  );
  const distHelperPath = path.resolve(
    __dirname,
    '../dist/src/services/scripts/GeminiSandbox.exe',
  );
  const sourcePath = path.resolve(
    __dirname,
    '../src/services/scripts/GeminiSandbox.cs',
  );

  if (!fs.existsSync(sourcePath)) {
    console.error(`Sandbox source not found at ${sourcePath}`);
    return;
  }

  // Ensure directories exist
  [srcHelperPath, distHelperPath].forEach((p) => {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Find csc.exe (C# Compiler) which is built into Windows .NET Framework
  const systemRoot = process.env['SystemRoot'] || 'C:\\Windows';
  const cscPaths = [
    'csc.exe', // Try in PATH first
    path.join(
      systemRoot,
      'Microsoft.NET',
      'Framework64',
      'v4.0.30319',
      'csc.exe',
    ),
    path.join(
      systemRoot,
      'Microsoft.NET',
      'Framework',
      'v4.0.30319',
      'csc.exe',
    ),
  ];

  let csc = undefined;
  for (const p of cscPaths) {
    if (p === 'csc.exe') {
      const result = spawnSync('where', ['csc.exe'], { stdio: 'ignore' });
      if (result.status === 0) {
        csc = 'csc.exe';
        break;
      }
    } else if (fs.existsSync(p)) {
      csc = p;
      break;
    }
  }

  if (!csc) {
    console.warn(
      'Windows C# compiler (csc.exe) not found. Native sandboxing will attempt to compile on first run.',
    );
    return;
  }

  console.log(`Compiling native Windows sandbox helper...`);
  // Compile to src
  let result = spawnSync(
    csc,
    [`/out:${srcHelperPath}`, '/optimize', sourcePath],
    {
      stdio: 'inherit',
    },
  );

  if (result.status === 0) {
    console.log('Successfully compiled GeminiSandbox.exe to src');
    // Copy to dist if dist exists
    const distDir = path.resolve(__dirname, '../dist');
    if (fs.existsSync(distDir)) {
      const distScriptsDir = path.dirname(distHelperPath);
      if (!fs.existsSync(distScriptsDir)) {
        fs.mkdirSync(distScriptsDir, { recursive: true });
      }
      fs.copyFileSync(srcHelperPath, distHelperPath);
      console.log('Successfully copied GeminiSandbox.exe to dist');
    }
  } else {
    console.error('Failed to compile Windows sandbox helper.');
  }
}

compileWindowsSandbox();
