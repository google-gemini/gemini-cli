#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { manageTelemetrySettings, registerCleanup } from './telemetry_utils.js';

const GENKIT_START_COMMAND = 'npx';
const GENKIT_START_ARGS = ['-y', 'genkit-cli', 'start', '--non-interactive'];

async function main() {
  let genkitProcess;

  const originalSandboxSetting = manageTelemetrySettings(
    true,
    '', // Endpoint will be set dynamically
    'local',
    undefined,
    'http',
  );

  registerCleanup(
    () => [genkitProcess],
    () => [],
    originalSandboxSetting,
  );

  console.log('🚀 Starting Genkit telemetry server...');
  genkitProcess = spawn(GENKIT_START_COMMAND, GENKIT_START_ARGS, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const rl = createInterface({ input: genkitProcess.stdout });

  rl.on('line', (line) => {
    console.log(`[Genkit] ${line}`);
    const match = line.match(/Telemetry API running on (http:\/\/[^\s]+)/);
    if (match) {
      const telemetryApiUrl = match[1];
      const otlpEndpoint = `${telemetryApiUrl}/api/otlp`;
      console.log(`✅ Genkit telemetry running on: ${otlpEndpoint}`);
      manageTelemetrySettings(true, otlpEndpoint, 'local', undefined, 'http');
    }
  });

  genkitProcess.stderr.on('data', (data) => {
    console.error(`[Genkit Error] ${data.toString()}`);
  });

  genkitProcess.on('close', (code) => {
    console.log(`Genkit process exited with code ${code}`);
  });

  genkitProcess.on('error', (err) => {
    console.error('Failed to start Genkit process:', err);
    process.exit(1);
  });

  console.log(`
✨ Genkit telemetry environment is running.
`);
  console.log(`Press Ctrl+C to exit.`);
}

main();
