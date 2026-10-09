#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * capture-snapshots.cjs
 *
 * Automates the 3-snapshot technique for Node.js memory leak detection.
 * Connects to a running Node.js process via Chrome DevTools Protocol (CDP)
 * and captures heap snapshots at configurable intervals.
 *
 * Usage:
 *   node capture-snapshots.cjs --port 9229 --interval 5000 --output ./snapshots
 *
 * The target Node.js process must be started with --inspect or --inspect-brk.
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

/** Parse CLI arguments into a key-value map. */
function parseArgs(argv) {
  const args = {
    port: 9229,
    interval: 5000,
    output: './snapshots',
    count: 3,
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--port':
        args.port = parseInt(argv[++i], 10);
        break;
      case '--interval':
        args.interval = parseInt(argv[++i], 10);
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--count':
        args.count = parseInt(argv[++i], 10);
        break;
      case '--help':
        console.log(
          'Usage: node capture-snapshots.cjs [options]\n\n' +
            'Options:\n' +
            '  --port <port>        DevTools debugging port (default: 9229)\n' +
            '  --interval <ms>      Milliseconds between snapshots (default: 5000)\n' +
            '  --output <dir>       Output directory for snapshots (default: ./snapshots)\n' +
            '  --count <n>          Number of snapshots to capture (default: 3)\n' +
            '  --help               Show this help message\n',
        );
        process.exit(0);
        break;
    }
  }
  return args;
}

/** Fetch the WebSocket debugger URL from the CDP /json endpoint. */
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
            if (target) {
              resolve(target.webSocketDebuggerUrl);
            } else {
              reject(new Error('No debuggable target found.'));
            }
          } catch (e) {
            reject(new Error(`Failed to parse CDP response: ${e.message}`));
          }
        });
      })
      .on('error', (e) => {
        reject(
          new Error(
            `Cannot connect to debugger on port ${port}. ` +
              `Ensure the target process is running with --inspect. Error: ${e.message}`,
          ),
        );
      });
  });
}

/**
 * Simple CDP client with a centralized message dispatcher.
 */
class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.callbacks = new Map();
    this.eventHandlers = new Map();

    this.ws.on('message', (raw) => {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }

      // Response to a command
      if (msg.id != null && this.callbacks.has(msg.id)) {
        const cb = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) {
          cb.reject(new Error(`CDP error: ${msg.error.message}`));
        } else {
          cb.resolve(msg.result);
        }
        return;
      }

      // Event
      if (msg.method && this.eventHandlers.has(msg.method)) {
        for (const handler of this.eventHandlers.get(msg.method)) {
          handler(msg.params);
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

  on(eventName, handler) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers.get(eventName).push(handler);
  }

  off(eventName) {
    this.eventHandlers.delete(eventName);
  }

  close() {
    this.ws.close();
  }
}

/** Capture a single heap snapshot via CDP, collecting chunks. */
function captureSnapshot(cdp) {
  return new Promise((resolve, reject) => {
    let snapshotData = '';
    const timeout = setTimeout(() => {
      cdp.off('HeapProfiler.addHeapSnapshotChunk');
      reject(new Error('Snapshot capture timed out after 120s'));
    }, 120000);

    cdp.on('HeapProfiler.addHeapSnapshotChunk', (params) => {
      snapshotData += params.chunk;
    });

    cdp
      .send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
      .then(() => {
        clearTimeout(timeout);
        cdp.off('HeapProfiler.addHeapSnapshotChunk');
        resolve(snapshotData);
      })
      .catch((err) => {
        clearTimeout(timeout);
        cdp.off('HeapProfiler.addHeapSnapshotChunk');
        reject(err);
      });
  });
}

/** Format bytes into a human-readable string. */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Sleep for a given number of milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv);

  console.log(`Memory Investigator — Snapshot Capture`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Port:     ${args.port}`);
  console.log(`Interval: ${args.interval}ms`);
  console.log(`Count:    ${args.count}`);
  console.log(`Output:   ${path.resolve(args.output)}`);
  console.log('');

  // Ensure output directory exists
  fs.mkdirSync(args.output, { recursive: true });

  // Connect to the debugger
  console.log(`Connecting to debugger on port ${args.port}...`);
  let wsUrl;
  try {
    wsUrl = await getDebuggerUrl(args.port);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  console.log(`Connected: ${wsUrl}\n`);

  const ws = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  const cdp = new CDPClient(ws);

  // Enable the HeapProfiler domain
  await cdp.send('HeapProfiler.enable');
  console.log('HeapProfiler enabled.\n');

  const snapshots = [];

  for (let i = 0; i < args.count; i++) {
    if (i > 0) {
      console.log(`Waiting ${args.interval}ms before next snapshot...`);
      await sleep(args.interval);
    }

    console.log(`Capturing snapshot ${i + 1}/${args.count}...`);
    const startTime = Date.now();
    const data = await captureSnapshot(cdp);
    const elapsed = Date.now() - startTime;

    const filename = `snapshot-${i + 1}-${Date.now()}.heapsnapshot`;
    const filepath = path.join(args.output, filename);
    fs.writeFileSync(filepath, data);

    const sizeBytes = Buffer.byteLength(data, 'utf8');
    snapshots.push({ index: i + 1, filename, sizeBytes, elapsed });

    console.log(
      `  ✓ Saved: ${filename} (${formatBytes(sizeBytes)}, ${elapsed}ms)\n`,
    );
  }

  // Close connection
  cdp.close();

  // Print summary
  console.log(`\nSummary`);
  console.log(`━━━━━━━`);
  for (const snap of snapshots) {
    console.log(
      `  Snapshot ${snap.index}: ${snap.filename} — ${formatBytes(snap.sizeBytes)} (captured in ${snap.elapsed}ms)`,
    );
  }

  if (snapshots.length >= 2) {
    const growth =
      snapshots[snapshots.length - 1].sizeBytes - snapshots[0].sizeBytes;
    const growthPercent = ((growth / snapshots[0].sizeBytes) * 100).toFixed(1);
    console.log(
      `\n  Heap growth: ${formatBytes(Math.abs(growth))} (${growth >= 0 ? '+' : ''}${growthPercent}%)`,
    );
  }

  console.log(
    `\nNext step: Run diff-snapshots.cjs to compare snapshots and identify leaks.`,
  );
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
