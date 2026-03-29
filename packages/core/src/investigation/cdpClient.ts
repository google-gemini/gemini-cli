/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @module investigation/cdpClient
 */

import { EventEmitter } from 'node:events';
import * as http from 'node:http';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Type guard: check if a value is a CDPResponse */
function isCDPResponse(msg: unknown): msg is CDPResponse {
  return msg !== null && typeof msg === 'object' && 'id' in msg;
}

/** Type guard: check if a value is a CDPEvent */
function isCDPEvent(msg: unknown): msg is CDPEvent {
  return msg !== null && typeof msg === 'object' && 'method' in msg;
}

/** CDP JSON-RPC request message */
interface CDPRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/** CDP JSON-RPC response message */
interface CDPResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/** CDP event message (no id) */
interface CDPEvent {
  method: string;
  params?: Record<string, unknown>;
}

/** Pending request with timeout */
interface PendingRequest {
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
}

/** CDP connection target info */
export interface CDPTarget {
  description: string;
  devtoolsFrontendUrl: string;
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

/** Heap snapshot progress event */
export interface HeapSnapshotProgress {
  done: number;
  total: number;
  finished?: boolean;
}

/** CPU profile result */
export interface CPUProfileResult {
  profile: {
    nodes: Array<{
      id: number;
      callFrame: {
        functionName: string;
        scriptId: string;
        url: string;
        lineNumber: number;
        columnNumber: number;
      };
      hitCount: number;
      children?: number[];
    }>;
    startTime: number;
    endTime: number;
    samples: number[];
    timeDeltas: number[];
  };
}

/** Heap usage from Runtime.getHeapUsage */
export interface HeapUsage {
  usedSize: number;
  totalSize: number;
}

/** Sampling heap profile result */
export interface SamplingHeapProfile {
  profile: {
    head: SamplingHeapProfileNode;
  };
}

export interface SamplingHeapProfileNode {
  callFrame: {
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  selfSize: number;
  id: number;
  children: SamplingHeapProfileNode[];
}

/** Client state */
export type CDPClientState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

// ─── Client ──────────────────────────────────────────────────────────────────

export class CDPClient extends EventEmitter {
  private ws: import('ws').WebSocket | null = null;
  private seq = 1;
  private pending: Map<number, PendingRequest> = new Map();
  private state: CDPClientState = 'disconnected';
  private snapshotChunks: string[] = [];
  private requestTimeout: number;

  constructor(options: { timeout?: number } = {}) {
    super();
    this.requestTimeout = options.timeout ?? 30_000;
  }

  getState(): CDPClientState {
    return this.state;
  }

  // ─── Connection ─────────────────────────────────────────────────────────

  /**
   * Discover available debug targets on a Node.js --inspect port.
   * Uses the HTTP /json endpoint to list debuggable targets.
   */
  static async discoverTargets(
    port: number = 9229,
    host: string = '127.0.0.1',
  ): Promise<CDPTarget[]> {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://${host}:${port}/json`, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          if (Buffer.isBuffer(chunk)) {
            data += chunk.toString();
          }
        });
        res.on('end', () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const parsed = JSON.parse(data);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            resolve(parsed as CDPTarget[]);
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            reject(new Error(`Failed to parse CDP targets: ${errMsg}`));
          }
        });
      });

      req.on('error', (e) => {
        const errMsg = e instanceof Error ? e.message : String(e);
        reject(
          new Error(`Cannot reach debug target at ${host}:${port}: ${errMsg}`),
        );
      });

      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error(`Timeout discovering targets at ${host}:${port}`));
      });
    });
  }

  /**
   * Connect to a CDP WebSocket endpoint.
   * Either provide a full WebSocket URL or a port number (auto-discovers first target).
   */
  async connect(urlOrPort: string | number): Promise<void> {
    this.state = 'connecting';

    let wsUrl: string;
    if (typeof urlOrPort === 'number') {
      const targets = await CDPClient.discoverTargets(urlOrPort);
      if (targets.length === 0) {
        throw new Error(`No debug targets found on port ${urlOrPort}`);
      }
      wsUrl = targets[0].webSocketDebuggerUrl;
    } else {
      wsUrl = urlOrPort;
    }

    // Dynamic import of ws (Node.js WebSocket)
    const { default: WebSocket } = await import('ws');

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.state = 'connected';
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        this.state = 'disconnected';
        this.cleanup();
        this.emit('disconnected');
      });

      this.ws.on('error', (err: Error) => {
        const wasConnecting = this.state === 'connecting';
        this.state = 'error';
        if (wasConnecting) {
          reject(err);
        }
        // Only emit if there are listeners (Node.js throws on unhandled 'error' events)
        if (this.listenerCount('error') > 0) {
          this.emit('error', err);
        }
      });
    });
  }

  /** Disconnect from the CDP target */
  async disconnect(): Promise<void> {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = 'disconnected';
  }

  // ─── HeapProfiler Domain ────────────────────────────────────────────────

  /** Enable the HeapProfiler domain */
  async heapProfilerEnable(): Promise<void> {
    await this.send('HeapProfiler.enable');
  }

  /** Disable the HeapProfiler domain */
  async heapProfilerDisable(): Promise<void> {
    await this.send('HeapProfiler.disable');
  }

  /**
   * Take a full V8 heap snapshot.
   *
   * Returns the complete snapshot JSON string assembled from
   * HeapProfiler.addHeapSnapshotChunk events.
   */
  async takeHeapSnapshot(reportProgress: boolean = true): Promise<string> {
    this.snapshotChunks = [];

    // Listen for chunk events
    const chunkHandler = (params: Record<string, unknown>) => {
      const chunk = params['chunk'];
      this.snapshotChunks.push(String(chunk));
    };

    const progressHandler = (params: Record<string, unknown>) => {
      const doneVal = params['done'];
      const totalVal = params['total'];
      const finishedVal = params['finished'];
      const done = typeof doneVal === 'number' ? doneVal : 0;
      const total = typeof totalVal === 'number' ? totalVal : 0;
      const finished =
        typeof finishedVal === 'boolean' ? finishedVal : undefined;
      this.emit('heapSnapshotProgress', { done, total, finished });
    };

    this.on('HeapProfiler.addHeapSnapshotChunk', chunkHandler);
    if (reportProgress) {
      this.on('HeapProfiler.reportHeapSnapshotProgress', progressHandler);
    }

    try {
      await this.send('HeapProfiler.takeHeapSnapshot', {
        reportProgress,
        captureNumericValue: true,
        exposeInternals: false,
      });

      return this.snapshotChunks.join('');
    } finally {
      this.removeListener('HeapProfiler.addHeapSnapshotChunk', chunkHandler);
      this.removeListener(
        'HeapProfiler.reportHeapSnapshotProgress',
        progressHandler,
      );
      this.snapshotChunks = [];
    }
  }

  /** Start tracking heap object allocations */
  async startTrackingAllocations(samplingInterval?: number): Promise<void> {
    await this.send('HeapProfiler.startTrackingHeapObjects', {
      trackAllocations: true,
      ...(samplingInterval !== undefined && { samplingInterval }),
    });
  }

  /** Stop tracking heap object allocations */
  async stopTrackingAllocations(): Promise<void> {
    await this.send('HeapProfiler.stopTrackingHeapObjects', {
      reportProgress: false,
    });
  }

  /** Start sampling heap profiler (lower overhead than full tracking) */
  async startSampling(samplingInterval: number = 32768): Promise<void> {
    await this.send('HeapProfiler.startSampling', { samplingInterval });
  }

  /** Stop sampling and get allocation profile */
  async stopSampling(): Promise<SamplingHeapProfile> {
    const result = await this.send('HeapProfiler.stopSampling');
    // Runtime assertion: profile field exists
    if (!('profile' in result)) {
      throw new Error(
        'Invalid HeapProfiler.stopSampling response: missing profile',
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return result as unknown as SamplingHeapProfile;
  }

  /** Force garbage collection before taking a snapshot */
  async collectGarbage(): Promise<void> {
    await this.send('HeapProfiler.collectGarbage');
  }

  // ─── Profiler Domain ────────────────────────────────────────────────────

  /** Enable the Profiler domain */
  async profilerEnable(): Promise<void> {
    await this.send('Profiler.enable');
  }

  /** Start CPU profiling */
  async startCpuProfile(): Promise<void> {
    await this.send('Profiler.start');
  }

  /** Stop CPU profiling and get the profile */
  async stopCpuProfile(): Promise<CPUProfileResult> {
    const result = await this.send('Profiler.stop');
    // Runtime assertion: profile field exists
    if (!('profile' in result)) {
      throw new Error('Invalid Profiler.stop response: missing profile');
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return result as unknown as CPUProfileResult;
  }

  /** Set sampling interval for CPU profiler (microseconds) */
  async setSamplingInterval(interval: number): Promise<void> {
    await this.send('Profiler.setSamplingInterval', { interval });
  }

  // ─── Runtime Domain ─────────────────────────────────────────────────────

  /** Enable the Runtime domain */
  async runtimeEnable(): Promise<void> {
    await this.send('Runtime.enable');
  }

  /** Evaluate an expression in the global context */
  async evaluate(
    expression: string,
    returnByValue: boolean = true,
  ): Promise<unknown> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue,
      generatePreview: true,
    });
    const evalResult = result['result'];
    return evalResult;
  }

  /** Get current heap usage statistics */
  async getHeapUsage(): Promise<HeapUsage> {
    const result = await this.send('Runtime.getHeapUsage');
    const usedSizeVal = result['usedSize'];
    const totalSizeVal = result['totalSize'];
    const usedSize = typeof usedSizeVal === 'number' ? usedSizeVal : 0;
    const totalSize = typeof totalSizeVal === 'number' ? totalSizeVal : 0;
    return { usedSize, totalSize };
  }

  // ─── Composite Operations ───────────────────────────────────────────────
  // These combine multiple CDP calls into high-level investigation actions,
  // minimizing agent turns per the Issue #23365 design philosophy.

  /**
   * Automated 3-snapshot technique.
   *
   * Takes 3 heap snapshots with forced GC between each, returns
   * the raw JSON strings for analysis by HeapSnapshotAnalyzer.
   *
   * @param intervalMs - Milliseconds between snapshots (default: 0 = immediate)
   * @param triggerAction - Optional async function to run between snapshots
   *                        (e.g., simulating the suspected leaking operation)
   */
  async threeSnapshotCapture(
    intervalMs: number = 0,
    triggerAction?: () => Promise<void>,
  ): Promise<[string, string, string]> {
    await this.heapProfilerEnable();

    // Snapshot 1: Baseline (after GC)
    await this.collectGarbage();
    if (intervalMs > 0) await this.delay(intervalMs);
    const snapshot1 = await this.takeHeapSnapshot();

    // Run suspected leaking operation (if provided)
    if (triggerAction) await triggerAction();

    // Snapshot 2: After first run
    await this.collectGarbage();
    if (intervalMs > 0) await this.delay(intervalMs);
    const snapshot2 = await this.takeHeapSnapshot();

    // Run again
    if (triggerAction) await triggerAction();

    // Snapshot 3: After second run
    await this.collectGarbage();
    if (intervalMs > 0) await this.delay(intervalMs);
    const snapshot3 = await this.takeHeapSnapshot();

    return [snapshot1, snapshot2, snapshot3];
  }

  /**
   * Capture a CPU profile over a duration.
   * Single operation: start → wait → stop → return profile.
   */
  async captureCpuProfile(
    durationMs: number = 5000,
  ): Promise<CPUProfileResult> {
    await this.profilerEnable();
    await this.startCpuProfile();
    await this.delay(durationMs);
    return this.stopCpuProfile();
  }

  /**
   * Get a full memory report: heap usage + sampling profile.
   * Single operation that returns everything needed for investigation.
   */
  async captureMemoryReport(): Promise<{
    heapUsage: HeapUsage;
    samplingProfile: SamplingHeapProfile;
    snapshot: string;
  }> {
    await this.heapProfilerEnable();
    await this.runtimeEnable();

    const heapUsage = await this.getHeapUsage();

    await this.startSampling();
    await this.delay(3000);
    const samplingProfile = await this.stopSampling();

    await this.collectGarbage();
    const snapshot = await this.takeHeapSnapshot();

    return { heapUsage, samplingProfile, snapshot };
  }

  // ─── Internal Protocol Handling ─────────────────────────────────────────

  private async send(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.ws || this.state !== 'connected') {
      throw new Error(`Cannot send: client is ${this.state}`);
    }

    const id = this.seq++;
    const message: CDPRequest = { id, method };
    if (params) message.params = params;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `CDP request timeout: ${method} (${this.requestTimeout}ms)`,
          ),
        );
      }, this.requestTimeout);

      this.pending.set(id, { resolve, reject, timer, method });
      this.ws!.send(JSON.stringify(message));
    });
  }

  private handleMessage(data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (err) {
      // BUG FIX #13: Previously silently swallowed malformed JSON with no
      // diagnostics. Now emits a warning so callers can debug protocol issues.
      // The pending request will still timeout, but the developer can now see WHY.
      if (this.listenerCount('error') > 0) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.emit('error', new Error(`Malformed CDP JSON: ${errMsg}`));
      }
      return;
    }

    // Check if this is a response (type guard)
    if (isCDPResponse(parsed)) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const message = parsed as CDPResponse;
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.id);

        if (message.error) {
          pending.reject(
            new Error(
              `CDP error (${message.error.code}): ${message.error.message}`,
            ),
          );
        } else {
          pending.resolve(message.result ?? {});
        }
      }
      return;
    }

    // Event notification (type guard)
    if (isCDPEvent(parsed)) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const event = parsed as CDPEvent;
      this.emit(event.method, event.params ?? {});
    }
  }

  private cleanup(): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('CDP connection closed'));
    }
    this.pending.clear();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
