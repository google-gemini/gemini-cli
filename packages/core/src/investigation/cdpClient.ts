/**
 * CDPClient — Chrome DevTools Protocol client for Node.js --inspect.
 *
 * Wraps the CDP WebSocket protocol to enable programmatic debugging
 * with minimal agent turns (as specified by Issue #23365):
 *   - HeapProfiler: take/get heap snapshots, track allocations
 *   - Profiler: CPU profiling start/stop/get
 *   - Runtime: evaluate expressions, get heap usage
 *   - NodeTracing: V8 trace events
 *
 * Unlike DAP (which requires step-by-step interaction), CDP supports
 * batch operations: "take 3 snapshots, diff them, report leaks" in a
 * single skill invocation — dramatically reducing agent turns.
 *
 * Connection: ws://127.0.0.1:{port}/json → get debugger WebSocket URL →
 *   connect → send JSON-RPC → receive responses/events
 *
 * @module investigation/cdpClient
 */

import { EventEmitter } from 'events';
import * as http from 'http';

// ─── Types ───────────────────────────────────────────────────────────────────

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
export type CDPClientState = 'disconnected' | 'connecting' | 'connected' | 'error';

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
  static async discoverTargets(port: number = 9229, host: string = '127.0.0.1'): Promise<CDPTarget[]> {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://${host}:${port}/json`, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as CDPTarget[]);
          } catch (e) {
            reject(new Error(`Failed to parse CDP targets: ${e}`));
          }
        });
      });

      req.on('error', (e) => {
        reject(new Error(`Cannot reach debug target at ${host}:${port}: ${e.message}`));
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
      this.snapshotChunks.push(params.chunk as string);
    };

    const progressHandler = (params: Record<string, unknown>) => {
      this.emit('heapSnapshotProgress', {
        done: params.done,
        total: params.total,
        finished: params.finished,
      } as HeapSnapshotProgress);
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
      this.removeListener('HeapProfiler.reportHeapSnapshotProgress', progressHandler);
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
  async evaluate(expression: string, returnByValue: boolean = true): Promise<unknown> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue,
      generatePreview: true,
    });
    return result.result;
  }

  /** Get current heap usage statistics */
  async getHeapUsage(): Promise<HeapUsage> {
    const result = await this.send('Runtime.getHeapUsage');
    return {
      usedSize: result.usedSize as number,
      totalSize: result.totalSize as number,
    };
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
  async captureCpuProfile(durationMs: number = 5000): Promise<CPUProfileResult> {
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

  private async send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.ws || this.state !== 'connected') {
      throw new Error(`Cannot send: client is ${this.state}`);
    }

    const id = this.seq++;
    const message: CDPRequest = { id, method };
    if (params) message.params = params;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP request timeout: ${method} (${this.requestTimeout}ms)`));
      }, this.requestTimeout);

      this.pending.set(id, { resolve, reject, timer, method });
      this.ws!.send(JSON.stringify(message));
    });
  }

  private handleMessage(data: string): void {
    let message: CDPResponse | CDPEvent;
    try {
      message = JSON.parse(data);
    } catch (err) {
      // BUG FIX #13: Previously silently swallowed malformed JSON with no
      // diagnostics. Now emits a warning so callers can debug protocol issues.
      // The pending request will still timeout, but the developer can now see WHY.
      if (this.listenerCount('error') > 0) {
        this.emit('error', new Error(`Malformed CDP JSON: ${(err as Error).message}`));
      }
      return;
    }

    // Response to a request
    if ('id' in message && typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.id);

        const response = message as CDPResponse;
        if (response.error) {
          pending.reject(new Error(`CDP error (${response.error.code}): ${response.error.message}`));
        } else {
          pending.resolve(response.result ?? {});
        }
      }
      return;
    }

    // Event notification
    if ('method' in message) {
      const event = message as CDPEvent;
      this.emit(event.method, event.params ?? {});
    }
  }

  private cleanup(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('CDP connection closed'));
    }
    this.pending.clear();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
