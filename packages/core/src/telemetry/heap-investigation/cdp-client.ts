/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Zero-dependency CDP WebSocket client for profiling **external** Node.js
 * processes launched with `--inspect`.
 *
 * Security model (raised in issue thread by KumarADITHYA123, Rithvickkr):
 *  - Loopback-only: only 127.0.0.1 / localhost are accepted.
 *  - Privileged port guard: rejects ports < 1024.
 *  - Method allowlist: blocks Runtime.evaluate and other code-exec domains.
 *  - Connection timeout: hard 10 s limit with socket teardown on failure.
 *
 * Uses only `node:http`, `node:net`, `node:crypto` (RFC 6455 handshake).
 * No npm dependencies — compatible with Gemini CLI's zero-build skill model.
 *
 * Addresses the core architectural question from the thread:
 * `node:inspector`'s Session only connects to the **current** process.
 * To profile external targets (user's app, Gemini CLI itself, any node --inspect
 * process) we need CDP over WebSocket — hence this client.
 */

import * as http from 'node:http';
import * as net from 'node:net';
import * as crypto from 'node:crypto';

/** CDP domains + methods we allow. Blocks code-execution paths. */
const CDP_ALLOWLIST = new Set([
  'HeapProfiler.enable',
  'HeapProfiler.disable',
  'HeapProfiler.takeHeapSnapshot',
  'HeapProfiler.startTrackingHeapObjects',
  'HeapProfiler.stopTrackingHeapObjects',
  'HeapProfiler.collectGarbage',
  'HeapProfiler.getHeapObjectId',
  'Profiler.enable',
  'Profiler.disable',
  'Profiler.start',
  'Profiler.stop',
  'Profiler.getSamplingProfile',
  'Runtime.getHeapUsage', // read-only heap stats — allowed
  'Target.getTargets',
  'Target.attachToTarget',
  'Target.detachFromTarget',
]);

/** Blocked high-risk domains (code execution) */
const BLOCKED_DOMAIN_PREFIXES = [
  'Runtime.evaluate',
  'Runtime.runScript',
  'Debugger.',
];

export interface CdpTarget {
  id: string;
  title: string;
  type: string;
  webSocketDebuggerUrl: string;
}

export interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

export class CdpSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CdpSecurityError';
  }
}

export class CdpConnectionError extends Error {
  constructor(
    message: string,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = 'CdpConnectionError';
  }
}

/**
 * Lists inspection targets from a node --inspect process.
 * Only connects to loopback addresses (security invariant).
 */
export async function listCdpTargets(
  host: string,
  port: number,
): Promise<CdpTarget[]> {
  validateCdpTarget(host, port);

  return new Promise((resolve, reject) => {
    const req = http.get(
      { host, port, path: '/json', timeout: 5000 },
      (res: http.IncomingMessage) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString('utf8')));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as CdpTarget[]);
          } catch (e) {
            reject(
              new CdpConnectionError(
                'Invalid JSON from CDP /json endpoint',
                e instanceof Error ? e : new Error(String(e)),
              ),
            );
          }
        });
      },
    );
    req.on('error', (e: Error) =>
      reject(new CdpConnectionError(`Cannot reach CDP at ${host}:${port}`, e)),
    );
    req.on('timeout', () => {
      req.destroy();
      reject(
        new CdpConnectionError(`CDP connection timed out at ${host}:${port}`),
      );
    });
  });
}

/**
 * Enforces the loopback-only and privileged-port security invariants.
 * Throws CdpSecurityError if the target violates policy.
 */
export function validateCdpTarget(host: string, port: number): void {
  const loopback = ['127.0.0.1', 'localhost', '::1'];
  if (!loopback.includes(host)) {
    throw new CdpSecurityError(
      `CDP connections are restricted to loopback (got "${host}"). ` +
        'Remote CDP attachment is not supported for security reasons.',
    );
  }
  if (port < 1024) {
    throw new CdpSecurityError(
      `CDP port ${port} is in the privileged range (<1024). ` +
        'Use a port >= 1024 (default: 9229).',
    );
  }
}

/**
 * Validates a CDP method name against the allowlist.
 * Blocks code-execution domains (Runtime.evaluate, Debugger.*, etc.)
 */
export function validateCdpMethod(method: string): void {
  for (const blocked of BLOCKED_DOMAIN_PREFIXES) {
    if (method.startsWith(blocked)) {
      throw new CdpSecurityError(
        `CDP method "${method}" is blocked by security policy. ` +
          'Code execution via CDP is not permitted.',
      );
    }
  }
  if (!CDP_ALLOWLIST.has(method)) {
    throw new CdpSecurityError(
      `CDP method "${method}" is not in the allowed method list. ` +
        `Allowed: ${[...CDP_ALLOWLIST].join(', ')}`,
    );
  }
}

type CdpEventListener = (msg: CdpMessage) => void;
type CdpCloseListener = () => void;

/**
 * A minimal RFC 6455 WebSocket client built on node:http + node:net.
 * Designed for single-session CDP use: connect → send commands → disconnect.
 *
 * Internal event system (avoids EventEmitter import complexity):
 *  - 'event': CDP server-push events (method calls without id)
 *  - 'close': connection closed
 *  - 'error': socket errors
 */
export class CdpWebSocketClient {
  private socket: net.Socket | null = null;
  private msgId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (r: unknown) => void;
      reject: (e: Error) => void;
    }
  >();
  private frameBuffer = Buffer.alloc(0);
  private closed = false;
  private readonly eventListeners: CdpEventListener[] = [];
  private readonly closeListeners: CdpCloseListener[] = [];

  on(event: 'event', listener: CdpEventListener): this;
  on(event: 'close', listener: CdpCloseListener): this;
  on(event: string, listener: CdpEventListener | CdpCloseListener): this {
    if (event === 'event')
      this.eventListeners.push(listener as CdpEventListener);
    if (event === 'close')
      this.closeListeners.push(listener as CdpCloseListener);
    return this;
  }

  off(event: 'event', listener: CdpEventListener): this;
  off(event: 'close', listener: CdpCloseListener): this;
  off(event: string, listener: CdpEventListener | CdpCloseListener): this {
    if (event === 'event') {
      const idx = this.eventListeners.indexOf(listener as CdpEventListener);
      if (idx !== -1) this.eventListeners.splice(idx, 1);
    }
    if (event === 'close') {
      const idx = this.closeListeners.indexOf(listener as CdpCloseListener);
      if (idx !== -1) this.closeListeners.splice(idx, 1);
    }
    return this;
  }

  /** Connects to a CDP WebSocket URL, returns when handshake is complete */
  async connect(wsUrl: string): Promise<void> {
    const url = new URL(wsUrl);
    validateCdpTarget(url.hostname, Number(url.port) || 9229);

    return new Promise((resolve, reject) => {
      const wsKey = crypto.randomBytes(16).toString('base64');

      const upgradeReq = http.request({
        host: url.hostname,
        port: url.port || '9229',
        path: url.pathname,
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': wsKey,
          'Sec-WebSocket-Version': '13',
        },
      });

      const timeout = setTimeout(() => {
        upgradeReq.destroy();
        reject(new CdpConnectionError('WebSocket upgrade timed out (10s)'));
      }, 10_000);

      upgradeReq.on(
        'upgrade',
        (res: http.IncomingMessage, socket: net.Socket) => {
          clearTimeout(timeout);

          // Validate server accept key (RFC 6455 §4.1)
          const expectedAccept = crypto
            .createHash('sha1')
            .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
            .digest('base64');

          if (res.headers['sec-websocket-accept'] !== expectedAccept) {
            socket.destroy();
            reject(
              new CdpConnectionError(
                'WebSocket handshake failed: invalid accept key',
              ),
            );
            return;
          }

          this.socket = socket;
          socket.on('data', (data: Buffer) => this.onData(data));
          socket.on('close', () => this.onClose());
          socket.on('error', (err: Error) => {
            // Propagate socket errors to any pending commands
            for (const [, p] of this.pending) {
              p.reject(new CdpConnectionError('Socket error', err));
            }
          });
          resolve();
        },
      );

      upgradeReq.on('error', (e: Error) => {
        clearTimeout(timeout);
        reject(new CdpConnectionError('WebSocket upgrade failed', e));
      });

      upgradeReq.end();
    });
  }

  /**
   * Sends a CDP command and returns the response result.
   * Validates the method against the security allowlist first.
   */
  async send(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    validateCdpMethod(method);

    if (!this.socket || this.closed) {
      throw new CdpConnectionError('CDP WebSocket is not connected');
    }

    const id = this.msgId++;
    const message = JSON.stringify({ id, method, params });
    this.sendFrame(Buffer.from(message, 'utf8'));

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // Per-command 30 s timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(
            new CdpConnectionError(
              `CDP command "${method}" timed out after 30s`,
            ),
          );
        }
      }, 30_000);
    });
  }

  /** Gracefully closes the WebSocket connection with a close frame */
  disconnect(): void {
    if (!this.closed && this.socket) {
      this.closed = true;
      try {
        // RFC 6455 close frame: FIN + opcode 0x8, masked
        const frame = Buffer.alloc(6);
        frame[0] = 0x88; // FIN + close opcode
        frame[1] = 0x80; // MASK bit set, payload length = 0
        crypto.randomBytes(4).copy(frame, 2);
        this.socket.write(frame);
      } catch {
        /* ignore write errors during close */
      }
      this.socket.destroy();
    }
  }

  // ── RFC 6455 frame encoder (client → server, masking required) ────────────

  private sendFrame(payload: Buffer): void {
    const payloadLen = payload.length;
    let headerLen = 2 + 4; // base header + 4-byte mask
    if (payloadLen > 65535) headerLen += 8;
    else if (payloadLen > 125) headerLen += 2;

    const frame = Buffer.alloc(headerLen + payloadLen);
    let offset = 0;

    frame[offset++] = 0x81; // FIN=1, RSV=0, opcode=1 (text)

    const mask = crypto.randomBytes(4);
    if (payloadLen > 65535) {
      frame[offset++] = 0x80 | 127;
      const hi = Math.floor(payloadLen / 0x100000000);
      frame.writeUInt32BE(hi, offset);
      offset += 4;
      frame.writeUInt32BE(payloadLen >>> 0, offset);
      offset += 4;
    } else if (payloadLen > 125) {
      frame[offset++] = 0x80 | 126;
      frame.writeUInt16BE(payloadLen, offset);
      offset += 2;
    } else {
      frame[offset++] = 0x80 | payloadLen;
    }

    mask.copy(frame, offset);
    offset += 4;

    for (let i = 0; i < payloadLen; i++) {
      frame[offset + i] = (payload[i] ?? 0) ^ (mask[i % 4] ?? 0);
    }

    this.socket!.write(frame);
  }

  // ── RFC 6455 frame decoder (server → client, no masking) ─────────────────

  private onData(data: Buffer): void {
    this.frameBuffer = Buffer.concat([this.frameBuffer, data]);

    while (this.frameBuffer.length >= 2) {
      const firstByte = this.frameBuffer[0] ?? 0;
      const secondByte = this.frameBuffer[1] ?? 0;
      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let headerEnd = 2;

      if (payloadLen === 126) {
        if (this.frameBuffer.length < 4) break;
        payloadLen = this.frameBuffer.readUInt16BE(2);
        headerEnd = 4;
      } else if (payloadLen === 127) {
        if (this.frameBuffer.length < 10) break;
        // Only use low 32 bits (payloads > 4GB are not expected from CDP)
        payloadLen = this.frameBuffer.readUInt32BE(6);
        headerEnd = 10;
      }

      if (masked) headerEnd += 4;
      if (this.frameBuffer.length < headerEnd + payloadLen) break;

      const payload = this.frameBuffer.subarray(
        headerEnd,
        headerEnd + payloadLen,
      );
      this.frameBuffer = this.frameBuffer.subarray(headerEnd + payloadLen);

      switch (opcode) {
        case 0x8: // close
          this.onClose();
          return;
        case 0x9: // ping → send pong
          this.sendPong(payload);
          break;
        case 0x1: // text
        case 0x2: // binary
          try {
            const msg = JSON.parse(payload.toString('utf8')) as CdpMessage;
            this.onMessage(msg);
          } catch {
            /* malformed JSON — ignore */
          }
          break;
        default:
          break;
      }
    }
  }

  private sendPong(payload: Buffer): void {
    if (!this.socket || this.closed) return;
    const header = Buffer.alloc(2);
    header[0] = 0x8a; // FIN + pong opcode
    header[1] = payload.length & 0x7f;
    this.socket.write(Buffer.concat([header, payload]));
  }

  private onMessage(msg: CdpMessage): void {
    if (msg.id !== undefined) {
      // Command response
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(
            new CdpConnectionError(`CDP error: ${msg.error.message}`),
          );
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (msg.method) {
      // Server-push event
      for (const listener of this.eventListeners) {
        listener(msg);
      }
    }
  }

  private onClose(): void {
    if (this.closed) return;
    this.closed = true;
    // Reject all pending commands
    for (const [, p] of this.pending) {
      p.reject(new CdpConnectionError('CDP WebSocket closed unexpectedly'));
    }
    this.pending.clear();
    for (const listener of this.closeListeners) {
      listener();
    }
  }

  // ── High-level Operations ─────────────────────────────────────────────────

  /**
   * Captures a full heap snapshot from the connected external process.
   * Accumulates HeapProfiler.addHeapSnapshotChunk events → returns full JSON string.
   *
   * Note: The returned JSON may be very large (hundreds of MB for production apps).
   * Callers should pipe it through the streaming parser in `heap-parser.ts`.
   */
  async captureHeapSnapshot(): Promise<string> {
    const chunks: string[] = [];

    const listener = (msg: CdpMessage) => {
      if (msg.method === 'HeapProfiler.addHeapSnapshotChunk' && msg.params) {
        chunks.push(msg.params['chunk'] as string);
      }
    };

    this.on('event', listener);
    try {
      await this.send('HeapProfiler.enable');
      await this.send('HeapProfiler.takeHeapSnapshot', {
        reportProgress: false,
        treatGlobalObjectsAsRoots: true,
        captureNumericValue: false,
      });
    } finally {
      this.off('event', listener);
    }

    return chunks.join('');
  }

  /** Forces GC on the remote process via CDP HeapProfiler.collectGarbage */
  async forceGc(): Promise<void> {
    await this.send('HeapProfiler.collectGarbage');
  }

  /**
   * High-level: runs the full 3-snapshot technique on an external process.
   *
   * Protocol:
   *  1. Capture S1 (baseline)
   *  2. Wait intervalMs
   *  3. Capture S2 (workload)
   *  4. Wait intervalMs
   *  5. Force GC
   *  6. Capture S3 (post-GC stabilization)
   *
   * Note: The caller is responsible for triggering workload between S1 and S2.
   */
  async captureThreeSnapshots(
    intervalMs: number = 30_000,
    onProgress?: (phase: 'baseline' | 'workload' | 'stabilizing') => void,
  ): Promise<{ s1: string; s2: string; s3: string }> {
    onProgress?.('baseline');
    const s1 = await this.captureHeapSnapshot();

    await new Promise<void>((r) => setTimeout(r, intervalMs));

    onProgress?.('workload');
    const s2 = await this.captureHeapSnapshot();

    await new Promise<void>((r) => setTimeout(r, intervalMs));

    onProgress?.('stabilizing');
    await this.forceGc();
    await new Promise<void>((r) => setTimeout(r, 500)); // brief GC flush
    const s3 = await this.captureHeapSnapshot();

    return { s1, s2, s3 };
  }
}
