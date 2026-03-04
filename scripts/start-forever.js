#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const A2A_PORT = process.env.A2A_PORT || '3100';
const BRIDGE_PORT = process.env.BRIDGE_PORT || '8081';

// Ensure .gemini/GEMINI.md exists to skip onboarding dialog
const geminiDir = join(process.cwd(), '.gemini');
const geminiMd = join(geminiDir, 'GEMINI.md');
if (!existsSync(geminiMd)) {
  mkdirSync(geminiDir, { recursive: true });
  writeFileSync(
    geminiMd,
    `---
sisyphus:
  enabled: true
  idleTimeout: 30
  prompt: "continue with the next task"
---

# Mission
You are a forever-running autonomous agent.
Process incoming tasks and answer questions.
`,
  );
  console.log(`Created ${geminiMd} (skip onboarding)`);
}

console.log('=== Gemini CLI Forever Agent ===');
console.log(`Agent listener: localhost:${A2A_PORT}`);
console.log(`Chat bridge:    0.0.0.0:${BRIDGE_PORT}`);
console.log('');

// Start the chat bridge
const bridgePath = join(
  repoRoot,
  'packages/a2a-server/dist/src/chat-bridge/bridge.js',
);
const bridge = spawn('node', [bridgePath], {
  env: {
    ...process.env,
    A2A_PORT,
    BRIDGE_PORT,
    A2A_URL: `http://127.0.0.1:${A2A_PORT}`,
  },
  stdio: 'inherit',
});

bridge.on('error', (err) => {
  console.error(`Bridge failed to start: ${err.message}`);
});

// Start the forever agent
const cliPath = join(repoRoot, 'packages/cli/dist/index.js');
const agent = spawn(
  'node',
  [cliPath, '--forever', '--a2a-port', A2A_PORT, '--yolo'],
  {
    env: { ...process.env, A2A_PORT },
    stdio: 'inherit',
  },
);

agent.on('error', (err) => {
  console.error(`Agent failed to start: ${err.message}`);
});

// Cleanup on exit
function cleanup() {
  console.log('\nShutting down...');
  bridge.kill();
  agent.kill();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

agent.on('exit', (code) => {
  console.log(`Agent exited with code ${code}`);
  bridge.kill();
  process.exit(code || 0);
});

bridge.on('exit', (code) => {
  console.log(`Bridge exited with code ${code}`);
});
