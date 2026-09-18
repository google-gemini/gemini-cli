#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * cpu-profile.cjs
 *
 * Captures a CPU profile from a running Node.js process via Chrome DevTools Protocol.
 * The target process must be started with --inspect or --inspect-brk.
 *
 * Usage:
 *   node cpu-profile.cjs --port 9229 --duration 10000 --output profile.cpuprofile
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

function parseArgs(argv) {
  const args = { port: 9229, duration: 10000, output: './profile.cpuprofile' };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--port':
        args.port = parseInt(argv[++i], 10);
        break;
      case '--duration':
        args.duration = parseInt(argv[++i], 10);
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--help':
        console.log(
          'Usage: node cpu-profile.cjs [options]\n\n' +
            'Options:\n' +
            '  --port <port>        DevTools debugging port (default: 9229)\n' +
            '  --duration <ms>      Profiling duration in ms (default: 10000)\n' +
            '  --output <file>      Output .cpuprofile path (default: ./profile.cpuprofile)\n' +
            '  --help               Show this help message\n',
        );
        process.exit(0);
        break;
    }
  }
  return args;
}

function getDebuggerUrl(port) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}/json`, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const targets = JSON.parse(data);
            const target = targets.find((t) => t.webSocketDebuggerUrl);
            if (target) resolve(target.webSocketDebuggerUrl);
            else reject(new Error('No debuggable target found.'));
          } catch (e) {
            reject(new Error(`Failed to parse CDP response: ${e.message}`));
          }
        });
      })
      .on('error', (e) => {
        reject(
          new Error(
            `Cannot connect to debugger on port ${port}. ` +
              `Ensure the process is running with --inspect. Error: ${e.message}`,
          ),
        );
      });
  });
}

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.callbacks = new Map();

    this.ws.on('message', (raw) => {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }

      if (msg.id != null && this.callbacks.has(msg.id)) {
        const cb = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) {
          cb.reject(new Error(`CDP error: ${msg.error.message}`));
        } else {
          cb.resolve(msg.result);
        }
      }
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timeout = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error(`CDP command ${method} timed out after 60s`));
      }, 60000);

      this.callbacks.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv);

  console.log(`Performance Profiler — CPU Profile Capture`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Port:     ${args.port}`);
  console.log(`Duration: ${args.duration}ms`);
  console.log(`Output:   ${path.resolve(args.output)}`);
  console.log('');

  // Connect
  console.log(`Connecting to debugger on port ${args.port}...`);
  const wsUrl = await getDebuggerUrl(args.port);
  console.log(`Connected: ${wsUrl}\n`);

  const ws = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  const cdp = new CDPClient(ws);

  // Enable and start profiling
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });

  console.log(`Starting CPU profiling for ${args.duration}ms...`);
  await cdp.send('Profiler.start');

  await sleep(args.duration);

  console.log(`Stopping profiler...`);
  const result = await cdp.send('Profiler.stop');

  // Ensure output directory exists
  const outputDir = path.dirname(path.resolve(args.output));
  fs.mkdirSync(outputDir, { recursive: true });

  // Save the profile
  const profileData = JSON.stringify(result.profile, null, 2);
  fs.writeFileSync(args.output, profileData);

  const sizeKB = (Buffer.byteLength(profileData) / 1024).toFixed(1);
  console.log(`\n✓ Profile saved: ${args.output} (${sizeKB} KB)`);

  // Quick summary
  const nodeCount = result.profile.nodes ? result.profile.nodes.length : 0;
  const sampleCount = result.profile.samples
    ? result.profile.samples.length
    : 0;
  console.log(`  Nodes: ${nodeCount}, Samples: ${sampleCount}`);
  console.log(
    `\nNext step: Run analyze-profile.cjs to identify hot functions.`,
  );

  cdp.close();
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
