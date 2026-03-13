/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire, Module } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

export async function run(): Promise<void> {
  // eslint-disable-next-line no-restricted-syntax
  const vscode = require('vscode');

  // Hack: Intercept require('vscode') globally in this process
  // This ensures that tests can just 'import * as vscode from "vscode"'
  const originalLoad = (Module as any)._load;
  (Module as any)._load = function (
    this: any,
    request: string,
    ...args: any[]
  ) {
    if (request === 'vscode') {
      return vscode;
    }
    return originalLoad.apply(this, [request, ...args]);
  };

  // Also inject into global for good measure
  (globalThis as any).vscode = vscode;

  console.log('Starting Generic E2E Runner...');

  const tests = [{ name: 'Focus Management', file: './focus.test.cjs' }];

  for (const test of tests) {
    console.log(`\nRunning Test Suite: ${test.name}`);
    try {
      const testModulePath = path.resolve(__dirname, test.file);
      console.log(`Loading test module from: ${testModulePath}`);
      // eslint-disable-next-line no-restricted-syntax
      const testModule = require(testModulePath);

      const runFn =
        testModule.default ||
        testModule.runTest ||
        (typeof testModule === 'function' ? testModule : null);

      if (typeof runFn === 'function') {
        console.log(`Executing run function for ${test.name}...`);
        await runFn();
      } else {
        console.error(
          `Could not find a valid run function in ${test.file}. Module keys: ${Object.keys(testModule)}`,
        );
        throw new Error(`Invalid test module: ${test.file}`);
      }

      console.log(`Test Suite ${test.name} completed successfully.`);
    } catch (err) {
      console.error(`Test Suite ${test.name} FAILED:`, err);
      throw err;
    }
  }

  console.log('\nAll E2E tests passed!');
}
