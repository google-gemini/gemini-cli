#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Launch a Node.js script with the V8 inspector enabled for CDP-based
 * memory and CPU investigation.
 *
 * Usage:
 *   node launch-with-inspector.cjs <script> [args...] [--port=9229] [--break]
 *
 * Output:
 *   Prints the CDP WebSocket URL on stdout so Gemini CLI can connect.
 */

'use strict';

const { spawn } = require('child_process');
const net = require('net');

// ─── Parse args ──────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);

let port = 9229;
let breakOnStart = false;
const scriptArgs = [];

for (const arg of rawArgs) {
  if (arg.startsWith('--port=')) {
    port = parseInt(arg.slice(7), 10);
  } else if (arg === '--break') {
    breakOnStart = true;
  } else {
    scriptArgs.push(arg);
  }
}

if (scriptArgs.length === 0) {
  console.error('ERROR: No script specified.');
  console.error('Usage: node launch-with-inspector.cjs <script> [args...] [--port=9229] [--break]');
  process.exit(1);
}

// ─── Check port availability ──────────────────────────────────────────────────

function isPortFree(p) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(p);
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  const free = await isPortFree(port);
  if (!free) {
    console.error(`ERROR: Port ${port} is already in use.`);
    console.error(`TIP: Another Node.js process may already be listening. Check with: lsof -i :${port}`);
    process.exit(1);
  }

  const inspectFlag = breakOnStart ? `--inspect-brk=${port}` : `--inspect=${port}`;
  const [script, ...args] = scriptArgs;

  const child = spawn(process.execPath, [inspectFlag, script, ...args], {
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let connected = false;

  // Watch stderr for the "Debugger listening on ws://" line
  child.stderr.on('data', (data) => {
    const text = data.toString();
    process.stderr.write(text);

    if (!connected && text.includes('Debugger listening on ws://')) {
      connected = true;
      // Extract and print the WebSocket URL cleanly
      const match = text.match(/ws:\/\/[^\s]+/);
      if (match) {
        console.log(`CDP_URL=${match[0]}`);
        console.log(`CDP_PORT=${port}`);
        console.log(`SUCCESS: Node.js inspector ready on port ${port}`);
        console.log(`Run: investigate(action="take_heap_snapshots", port=${port})`);
      }
    }
  });

  child.stdout.on('data', (data) => process.stdout.write(data));

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Process exited with code ${code}`);
    }
  });

  // Forward signals
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
})();
