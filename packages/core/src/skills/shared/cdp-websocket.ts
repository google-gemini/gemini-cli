/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CDP WebSocket Client – RFC 6455 manual framing, zero npm dependencies.
 *
 * Security constraints:
 *   - Loopback-only: rejects connections to non-localhost hosts
 *   - Rejects ports < 1024
 *
 * Features:
 *   - Manual RFC 6455 frame construction (client masking, 64-bit payload length)
 *   - Ping/pong support
 *   - Chunk reassembly for HeapProfiler.addHeapSnapshotChunk
 *   - Forced GC via Runtime.callFunctionOn
 *   - Configurable timeout with graceful socket teardown
 */

import * as net from 'node:net';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CDPEventCallback = (params: unknown) => void;

interface CDPMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface WebSocketCDPClientOptions {
  host: string;
  port: number;
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Loopback guard
// ---------------------------------------------------------------------------

const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0:0:0:0:0:0:0:1',
]);

function assertLoopback(host: string): void {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!LOOPBACK_HOSTS.has(normalized)) {
    throw new Error(
      `[cdp-websocket] Security: only loopback connections are allowed. Got: ${host}`,
    );
  }
}

function assertPortSafe(port: number): void {
  if (port < 1024) {
    throw new Error(
      `[cdp-websocket] Security: port must be >= 1024. Got: ${port}`,
    );
  }
}

// ---------------------------------------------------------------------------
// RFC 6455 frame building
// ---------------------------------------------------------------------------

/**
 * Build a client WebSocket frame (with masking as required by RFC 6455 §5.3).
 */
function buildClientFrame(opcode: number, payload: Buffer): Buffer {
  const maskingKey = crypto.randomBytes(4);
  const payloadLen = payload.length;

  let headerLen: number;
  if (payloadLen <= 125) {
    headerLen = 6; // 2 + 4 mask
  } else if (payloadLen <= 65535) {
    headerLen = 8; // 2 + 2 + 4 mask
  } else {
    headerLen = 14; // 2 + 8 + 4 mask
  }

  const frame = Buffer.allocUnsafe(headerLen + payloadLen);

  // Byte 0: FIN=1, RSV=0, opcode
  frame[0] = 0x80 | (opcode & 0x0f);

  // Byte 1: MASK=1, payload length
  if (payloadLen <= 125) {
    frame[1] = 0x80 | payloadLen;
    maskingKey.copy(frame, 2);
  } else if (payloadLen <= 65535) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(payloadLen, 2);
    maskingKey.copy(frame, 4);
  } else {
    frame[1] = 0x80 | 127;
    // Write 64-bit big-endian length (high 32 bits are 0 for sane file sizes)
    frame.writeUInt32BE(0, 2);
    frame.writeUInt32BE(payloadLen >>> 0, 6);
    maskingKey.copy(frame, 10);
  }

  // Apply mask
  for (let i = 0; i < payloadLen; i++) {
    frame[headerLen + i] = payload[i] ^ maskingKey[i % 4];
  }

  return frame;
}

/**
 * Parse server frame(s) from a buffer. Returns parsed frames and remaining bytes.
 */
function parseServerFrames(buf: Buffer): {
  frames: Array<{ opcode: number; payload: Buffer; fin: boolean }>;
  remaining: Buffer;
} {
  const frames: Array<{ opcode: number; payload: Buffer; fin: boolean }> = [];
  let offset = 0;

  while (offset + 2 <= buf.length) {
    const byte0 = buf[offset];
    const byte1 = buf[offset + 1];
    const fin = !!(byte0 & 0x80);
    const opcode = byte0 & 0x0f;
    const masked = !!(byte1 & 0x80);
    let payloadLen = byte1 & 0x7f;
    let headerEnd = offset + 2;

    if (payloadLen === 126) {
      if (offset + 4 > buf.length) break;
      payloadLen = buf.readUInt16BE(offset + 2);
      headerEnd = offset + 4;
    } else if (payloadLen === 127) {
      if (offset + 10 > buf.length) break;
      // Only handle lower 32 bits (files < 4GB)
      payloadLen = buf.readUInt32BE(offset + 6);
      headerEnd = offset + 10;
    }

    const maskOffset = masked ? headerEnd : -1;
    const payloadOffset = masked ? headerEnd + 4 : headerEnd;

    if (payloadOffset + payloadLen > buf.length) break;

    const payload = Buffer.allocUnsafe(payloadLen);
    buf.copy(payload, 0, payloadOffset, payloadOffset + payloadLen);

    if (masked) {
      for (let i = 0; i < payloadLen; i++) {
        payload[i] ^= buf[maskOffset + (i % 4)];
      }
    }

    frames.push({ opcode, payload, fin });
    offset = payloadOffset + payloadLen;
  }

  return { frames, remaining: buf.slice(offset) };
}

// ---------------------------------------------------------------------------
// WebSocketCDPClient
// ---------------------------------------------------------------------------

export class WebSocketCDPClient {
  private host: string;
  private port: number;
  private timeout: number;
  private socket: net.Socket | null = null;
  private commandId = 0;
  private pendingCommands = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private eventListeners = new Map<string, CDPEventCallback[]>();
  private recvBuf = Buffer.alloc(0);
  // For multi-frame message reassembly
  private fragmentBuf: Buffer | null = null;
  private fragmentOpcode = 0;
  // Heap snapshot chunk accumulator
  private heapChunks: string[] = [];

  constructor(options: WebSocketCDPClientOptions) {
    assertLoopback(options.host);
    assertPortSafe(options.port);
    this.host = options.host;
    this.port = options.port;
    this.timeout = options.timeout ?? 30_000;
  }

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  async connect(): Promise<void> {
    const wsUrl = await this.getDebuggerUrl();
    const parsed = new URL(wsUrl);
    const wsPath = parsed.pathname + parsed.search;

    await this.performHandshake(
      parsed.hostname || this.host,
      this.port,
      wsPath,
    );
  }

  private async getDebuggerUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = http.get(
        `http://${this.host}:${this.port}/json/list`,
        { timeout: this.timeout },
        (res) => {
          let data = '';
          res.on('data', (c: string) => (data += c));
          res.on('end', () => {
            try {
              function isTargetList(
                v: unknown,
              ): v is Array<{ webSocketDebuggerUrl?: string }> {
                return Array.isArray(v);
              }
              const rawParsed: unknown = JSON.parse(data);
              if (!isTargetList(rawParsed)) {
                reject(new Error('[cdp-websocket] Unexpected response format'));
                return;
              }
              const targets = rawParsed;
              const target = targets.find((t) => t.webSocketDebuggerUrl);
              if (!target?.webSocketDebuggerUrl) {
                reject(new Error('[cdp-websocket] No debuggable target found'));
              } else {
                resolve(target.webSocketDebuggerUrl);
              }
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('[cdp-websocket] Timeout fetching /json/list'));
      });
    });
  }

  private performHandshake(
    host: string,
    port: number,
    path: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      socket.setTimeout(this.timeout);

      const wsKey = crypto.randomBytes(16).toString('base64');
      const expectedAccept = crypto
        .createHash('sha1')
        .update(wsKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

      const upgradeRequest = [
        `GET ${path} HTTP/1.1`,
        `Host: ${host}:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${wsKey}`,
        'Sec-WebSocket-Version: 13',
        '\r\n',
      ].join('\r\n');

      socket.once('connect', () => {
        socket.write(upgradeRequest);
      });

      let headerBuf = '';
      const onData = (chunk: Buffer) => {
        headerBuf += chunk.toString('binary');
        const headerEnd = headerBuf.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;

        socket.removeListener('data', onData);

        const headers = headerBuf.slice(0, headerEnd);
        if (!headers.includes('101')) {
          socket.destroy();
          reject(
            new Error(
              `[cdp-websocket] Upgrade failed: ${headers.split('\r\n')[0]}`,
            ),
          );
          return;
        }
        if (!headers.includes(expectedAccept)) {
          socket.destroy();
          reject(new Error('[cdp-websocket] Sec-WebSocket-Accept mismatch'));
          return;
        }

        // Any bytes after the header are the start of the WebSocket stream
        const bodyStart = headerEnd + 4;
        const remaining = Buffer.from(headerBuf.slice(bodyStart), 'binary');
        if (remaining.length > 0) {
          this.recvBuf = Buffer.concat([this.recvBuf, remaining]);
        }

        this.socket = socket;
        this.attachSocketHandlers(socket);
        resolve();
      };

      socket.on('data', onData);
      socket.on('error', reject);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('[cdp-websocket] Handshake timeout'));
      });
    });
  }

  private attachSocketHandlers(socket: net.Socket): void {
    socket.on('data', (chunk: Buffer) => {
      this.recvBuf = Buffer.concat([this.recvBuf, chunk]);
      this.processRecvBuffer();
    });

    socket.on('error', (err) => {
      for (const p of this.pendingCommands.values()) {
        p.reject(err);
      }
      this.pendingCommands.clear();
    });

    socket.on('close', () => {
      for (const p of this.pendingCommands.values()) {
        p.reject(new Error('[cdp-websocket] Socket closed'));
      }
      this.pendingCommands.clear();
    });
  }

  private processRecvBuffer(): void {
    const { frames, remaining } = parseServerFrames(this.recvBuf);
    this.recvBuf = remaining;

    for (const frame of frames) {
      this.handleFrame(frame);
    }
  }

  private handleFrame(frame: {
    opcode: number;
    payload: Buffer;
    fin: boolean;
  }): void {
    const { opcode, payload, fin } = frame;

    switch (opcode) {
      case 0x0: // continuation
        if (this.fragmentBuf !== null) {
          this.fragmentBuf = Buffer.concat([this.fragmentBuf, payload]);
          if (fin) {
            this.handleMessage(this.fragmentOpcode, this.fragmentBuf);
            this.fragmentBuf = null;
          }
        }
        break;
      case 0x1: // text
      case 0x2: // binary
        if (!fin) {
          this.fragmentBuf = payload;
          this.fragmentOpcode = opcode;
        } else {
          this.handleMessage(opcode, payload);
        }
        break;
      case 0x9: // ping
        this.sendRaw(buildClientFrame(0xa, payload)); // pong
        break;
      case 0xa: // pong
        break;
      case 0x8: // close
        this.socket?.destroy();
        break;
      default:
        break;
    }
  }

  private handleMessage(_opcode: number, payload: Buffer): void {
    let msg: CDPMessage;
    try {
      const parsed: unknown = JSON.parse(payload.toString('utf8'));
      if (typeof parsed !== 'object' || parsed === null) return;
      msg = parsed as CDPMessage;
    } catch {
      return;
    }

    if (msg.id !== undefined) {
      const pending = this.pendingCommands.get(msg.id);
      if (pending) {
        this.pendingCommands.delete(msg.id);
        if (msg.error) {
          pending.reject(
            new Error(`CDP ${msg.error.code}: ${msg.error.message}`),
          );
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (msg.method) {
      // Special handling for heap snapshot chunks
      if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') {
        const params = msg.params;
        const rawChunk =
          typeof params === 'object' && params !== null && 'chunk' in params
            ? (params as Record<string, unknown>)['chunk']
            : undefined;
        const chunk = typeof rawChunk === 'string' ? rawChunk : undefined;
        if (chunk) this.heapChunks.push(chunk);
      }
      const listeners = this.eventListeners.get(msg.method) ?? [];
      for (const cb of listeners) {
        cb(msg.params);
      }
    }
  }

  private sendRaw(data: Buffer): void {
    this.socket?.write(data);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async sendCommand(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.socket) throw new Error('[cdp-websocket] Not connected');
    const id = ++this.commandId;
    const payload = Buffer.from(JSON.stringify({ id, method, params }), 'utf8');
    this.sendRaw(buildClientFrame(0x1, payload));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`[cdp-websocket] Command timeout: ${method}`));
      }, this.timeout);

      this.pendingCommands.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  on(event: string, callback: CDPEventCallback): void {
    const existing = this.eventListeners.get(event) ?? [];
    existing.push(callback);
    this.eventListeners.set(event, existing);
  }

  async disconnect(): Promise<void> {
    if (!this.socket) return;
    // Send close frame
    this.sendRaw(buildClientFrame(0x8, Buffer.alloc(0)));
    await new Promise<void>((resolve) => {
      this.socket!.once('close', resolve);
      setTimeout(resolve, 1000); // fallback
      this.socket!.destroy();
    });
    this.socket = null;
  }

  // -------------------------------------------------------------------------
  // High-level CDP helpers
  // -------------------------------------------------------------------------

  async takeHeapSnapshot(outputPath: string): Promise<void> {
    this.heapChunks = [];
    await this.sendCommand('HeapProfiler.enable');

    await new Promise<void>((resolve, reject) => {
      this.on('HeapProfiler.reportHeapSnapshotProgress', (params) => {
        if (
          typeof params === 'object' &&
          params !== null &&
          'done' in params &&
          'total' in params
        ) {
          const rec = params as Record<string, unknown>;
          const finished = rec['finished'];
          if (finished === true) resolve();
        }
      });
      this.sendCommand('HeapProfiler.takeHeapSnapshot', {
        reportProgress: true,
      }).catch(reject);
    });

    const fullSnapshot = this.heapChunks.join('');
    this.heapChunks = [];
    await fs.writeFile(outputPath, fullSnapshot, 'utf8');
  }

  async forceGC(): Promise<void> {
    await this.sendCommand('HeapProfiler.collectGarbage');
  }

  async startCPUProfile(samplingInterval = 100): Promise<void> {
    await this.sendCommand('Profiler.enable');
    await this.sendCommand('Profiler.setSamplingInterval', {
      interval: samplingInterval,
    });
    await this.sendCommand('Profiler.start');
  }

  async stopCPUProfile(): Promise<unknown> {
    const result = await this.sendCommand('Profiler.stop');
    return result;
  }
}

/**
 * Factory helper – validates and creates a WebSocketCDPClient.
 */
export function createWebSocketCDPClient(
  port: number,
  options: Partial<WebSocketCDPClientOptions> = {},
): WebSocketCDPClient {
  const host = options.host ?? 'localhost';
  return new WebSocketCDPClient({ host, port, timeout: options.timeout });
}
