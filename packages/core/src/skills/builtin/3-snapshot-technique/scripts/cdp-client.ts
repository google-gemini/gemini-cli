/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CDP (Chrome DevTools Protocol) Client for Node.js Debugging
 *
 * Provides scriptable access to Node.js --inspect for:
 * - Heap snapshot capture
 * - CPU profiling
 * - Runtime evaluation
 * - Console capture
 */

import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import type { HeapSnapshot } from '../../../shared/perfetto.js';

interface CDPResponse<T = unknown> {
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

interface CDPClientOptions {
  host?: string;
  port?: number;
  timeout?: number;
}

export class CDPClient {
  private host: string;
  private port: number;
  private timeout: number;
  private requestId = 0;

  constructor(options: CDPClientOptions = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 9229;
    this.timeout = options.timeout || 30000;
  }

  /**
   * Get WebSocket debugger URL from HTTP endpoint
   */
  async getDebuggerUrl(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.host}:${this.port}/json/list`,
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              function isTargetArray(
                v: unknown,
              ): v is Array<{ webSocketDebuggerUrl?: string }> {
                return Array.isArray(v);
              }
              const parsed: unknown = JSON.parse(data);
              if (!isTargetArray(parsed)) {
                reject(new Error('Unexpected response format'));
                return;
              }
              const targets = parsed;
              const target = targets.find((t) => t.webSocketDebuggerUrl);
              resolve(target?.webSocketDebuggerUrl || null);
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.on('error', reject);
      req.setTimeout(this.timeout, () => {
        req.destroy();
        reject(new Error('Timeout getting debugger URL'));
      });
    });
  }

  /**
   * Send CDP command via HTTP (for simple commands)
   */
  async sendCommand<T extends object>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ id, method, params });

      const req = http.request(
        {
          hostname: this.host,
          port: this.port,
          path: '/json',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              function isCDPResponse(v: unknown): v is CDPResponse<T> {
                return typeof v === 'object' && v !== null;
              }
              const parsed: unknown = JSON.parse(data);
              if (!isCDPResponse(parsed)) {
                reject(new Error('Unexpected CDP response'));
                return;
              }
              const response = parsed;
              if (response.error) {
                reject(
                  new Error(
                    `CDP Error ${response.error.code}: ${response.error.message}`,
                  ),
                );
              } else {
                // result is T | undefined; caller handles undefined via the T constraint
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                resolve((response.result ?? {}) as T);
              }
            } catch (e) {
              reject(e);
            }
          });
        },
      );

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Capture heap snapshot via v8 API (simpler than CDP for local processes)
   */
  async captureHeapSnapshot(gcFirst = false): Promise<HeapSnapshot> {
    const v8 = await import('node:v8');

    if (gcFirst) {
      global.gc?.();
    }

    // Generate snapshot file
    const snapshotPath = v8.writeHeapSnapshot();
    const data = await fs.readFile(snapshotPath, 'utf-8');
    await fs.unlink(snapshotPath);

    function isHeapSnapshot(v: unknown): v is HeapSnapshot {
      return (
        typeof v === 'object' &&
        v !== null &&
        'snapshot' in v &&
        'nodes' in v &&
        'strings' in v
      );
    }
    const parsed: unknown = JSON.parse(data);
    if (!isHeapSnapshot(parsed))
      throw new Error('Invalid heap snapshot format');
    return parsed;
  }

  /**
   * Start CPU profiling
   */
  async startCPUProfile(): Promise<void> {
    // Use programmatic API when available
    const inspector = await import('node:inspector');
    const session = new inspector.Session();
    session.connect();

    return new Promise((resolve, reject) => {
      session.post('Profiler.enable', (err) => {
        if (err) {
          reject(err);
          return;
        }
        session.post('Profiler.start', (err2) => {
          if (err2) {
            reject(err2);
          } else {
            resolve();
          }
        });
      });
    });
  }

  /**
   * Stop CPU profiling and return profile data
   */
  async stopCPUProfile(): Promise<unknown> {
    const inspector = await import('node:inspector');
    const session = new inspector.Session();
    session.connect();

    return new Promise((resolve, reject) => {
      session.post('Profiler.stop', (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Execute code in target runtime
   */
  async evaluate(expression: string): Promise<unknown> {
    const inspector = await import('node:inspector');
    const session = new inspector.Session();
    session.connect();

    return new Promise((resolve, reject) => {
      session.post(
        'Runtime.evaluate',
        { expression, returnByValue: true },
        (err, result) => {
          if (err) {
            reject(err);
          } else if (
            typeof result === 'object' &&
            result !== null &&
            'result' in result
          ) {
            const resultRecord: Record<string, unknown> = Object.fromEntries(
              Object.entries(result as object),
            );
            const inner: unknown = resultRecord['result'];
            if (
              typeof inner === 'object' &&
              inner !== null &&
              'value' in inner
            ) {
              resolve((inner as Record<string, unknown>)['value']);
            } else {
              resolve(result);
            }
          } else {
            resolve(result);
          }
        },
      );
    });
  }

  /**
   * Force garbage collection
   */
  async forceGC(): Promise<void> {
    const inspector = await import('node:inspector');
    const session = new inspector.Session();
    session.connect();

    return new Promise((resolve, reject) => {
      session.post('HeapProfiler.collectGarbage', (err) => {
        if (err) {
          // Fallback to global.gc if available
          if (global.gc) {
            global.gc();
            resolve();
          } else {
            reject(err);
          }
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * Capture 3 heap snapshots with delays for leak detection
 */
export async function captureThreeSnapshots(
  delayMs: number = 5000,
): Promise<[HeapSnapshot, HeapSnapshot, HeapSnapshot]> {
  const client = new CDPClient();

  // Snapshot 1: Baseline
  process.stdout.write('Capturing snapshot 1 (baseline)...\n');
  const snapshot1 = await client.captureHeapSnapshot();

  // Wait
  process.stdout.write(`Waiting ${delayMs}ms...\n`);
  await new Promise((r) => setTimeout(r, delayMs));

  // Snapshot 2: After operation
  process.stdout.write('Capturing snapshot 2 (after operation)...\n');
  const snapshot2 = await client.captureHeapSnapshot();

  // Wait again
  process.stdout.write(`Waiting ${delayMs}ms...\n`);
  await new Promise((r) => setTimeout(r, delayMs));

  // Force GC and capture snapshot 3
  process.stdout.write('Forcing GC and capturing snapshot 3...\n');
  await client.forceGC().catch(() => {
    process.stdout.write(
      'Note: GC could not be forced (run with --expose-gc)\n',
    );
  });
  const snapshot3 = await client.captureHeapSnapshot(true);

  return [snapshot1, snapshot2, snapshot3];
}

/**
 * CLI interface
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'heap-snapshot') {
    const gcFirst = args.includes('--gc-first');
    const outputIndex = args.indexOf('--output');
    const outputPath = outputIndex > -1 ? args[outputIndex + 1] : null;

    const client = new CDPClient();
    const snapshot = await client.captureHeapSnapshot(gcFirst);

    if (outputPath) {
      await fs.writeFile(outputPath, JSON.stringify(snapshot), 'utf-8');
      process.stdout.write(`Heap snapshot saved to ${outputPath}\n`);
    } else {
      process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
    }
  } else if (command === '3-snapshot') {
    const delayIndex = args.indexOf('--delay');
    const delay = delayIndex > -1 ? parseInt(args[delayIndex + 1], 10) : 5000;
    const outputIndex = args.indexOf('--output');
    const outputDir = outputIndex > -1 ? args[outputIndex + 1] : '.';

    const [s1, s2, s3] = await captureThreeSnapshots(delay);

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      `${outputDir}/snapshot-1.heapsnapshot`,
      JSON.stringify(s1),
      'utf-8',
    );
    await fs.writeFile(
      `${outputDir}/snapshot-2.heapsnapshot`,
      JSON.stringify(s2),
      'utf-8',
    );
    await fs.writeFile(
      `${outputDir}/snapshot-3.heapsnapshot`,
      JSON.stringify(s3),
      'utf-8',
    );

    process.stdout.write(`3 snapshots captured in ${outputDir}/\n`);
  } else {
    process.stdout.write(`
Usage:
  ts-node cdp-client.ts heap-snapshot [--gc-first] [--output <path>]
  ts-node cdp-client.ts 3-snapshot [--delay <ms>] [--output <dir>]
    \n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(String(err) + '\n');
  });
}
