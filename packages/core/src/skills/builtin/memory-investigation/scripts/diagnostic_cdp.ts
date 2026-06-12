/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * diagnostic_cdp.ts — Diagnostic tool to trace exactly what happens
 * during a CDP heap snapshot capture against an external process.
 *
 * Usage: node diagnostic_cdp.js --port 9229
 *
 * Zero external dependencies.
 */

import { createConnection } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { request } from 'node:http';

const port = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') || '9229', 10);
const host = '127.0.0.1';

console.log(`[diag] Diagnosing CDP snapshot capture against ${host}:${port}`);
console.log(`[diag] Time: ${new Date().toISOString()}`);

// Step 1: resolve WS URL
function resolveWsUrl(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(`http://${host}:${port}/json/list`, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c));
      res.on('end', () => {
        try {
          const targets = JSON.parse(data) as Array<{
            type?: string;
            title?: string;
            url?: string;
            webSocketDebuggerUrl?: string;
          }>;
          console.log(`[diag] /json/list returned ${targets.length} target(s):`);
          for (const t of targets) {
            console.log(`  type=${t.type} title=${t.title} url=${t.url}`);
          }
          const target = targets.find((t) => t.type === 'node') ?? targets[0];
          if (!target?.webSocketDebuggerUrl) {
            reject(new Error('No debuggable target'));
            return;
          }
          resolve(target.webSocketDebuggerUrl);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Minimal WS handshake
function buildHandshake(
  h: string,
  p: string,
  wsPath: string,
): { hs: string; expectedAccept: string } {
  const key = randomBytes(16).toString('base64');
  const hs = [
    `GET ${wsPath} HTTP/1.1`,
    `Host: ${h}:${p}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    '\r\n',
  ].join('\r\n');
  const expectedAccept = createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  return { hs, expectedAccept };
}

function buildTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  const maskKey = randomBytes(4);
  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ maskKey[i & 3];
  return Buffer.concat([header, maskKey, masked]);
}

interface DiagParseResult {
  messages: Array<string | { _close?: boolean; _ping?: boolean }>;
  remaining: Buffer;
}

function parseFrames(buffer: Buffer): DiagParseResult {
  const messages: Array<string | { _close?: boolean; _ping?: boolean }> = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;
    const fin = (buffer[offset] & 0x80) !== 0;
    const opcode = buffer[offset] & 0x0f;
    offset++;
    let payloadLen = buffer[offset] & 0x7f;
    offset++;
    if (payloadLen === 126) {
      if (buffer.length - offset < 2) break;
      payloadLen = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLen === 127) {
      if (buffer.length - offset < 8) break;
      payloadLen = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }
    if (buffer.length - offset < payloadLen) break;
    const payload = buffer.slice(offset, offset + payloadLen);
    offset += payloadLen;

    if (opcode === 8) {
      console.log(`[diag] RECEIVED CLOSE FRAME (opcode 8)`);
      messages.push({ _close: true });
    } else if (opcode === 9) {
      console.log(`[diag] RECEIVED PING FRAME (opcode 9)`);
      messages.push({ _ping: true });
    } else if (opcode === 10) {
      console.log(`[diag] RECEIVED PONG FRAME (opcode 10)`);
    } else if (fin && opcode === 1) {
      messages.push(payload.toString('utf8'));
    } else {
      console.log(`[diag] FRAME opcode=${opcode} fin=${fin} len=${payloadLen}`);
    }
  }
  return { messages, remaining: buffer.slice(offset) };
}

async function diagnose(): Promise<void> {
  const wsUrl = await resolveWsUrl();
  console.log(`[diag] WebSocket URL: ${wsUrl}`);

  const urlObj = new URL(wsUrl);

  await new Promise<void>((resolve, reject) => {
    const sock = createConnection({ host: urlObj.hostname, port: parseInt(urlObj.port, 10) });
    const { hs, expectedAccept } = buildHandshake(urlObj.hostname, urlObj.port, urlObj.pathname);

    let msgId = 1;
    let handshakeDone = false;
    let residual = Buffer.alloc(0);
    let chunkCount = 0;
    let totalChunkBytes = 0;
    let enableAckReceived = false;
    let snapshotResponseReceived = false;
    let progressEvents = 0;
    let snapshotFinished = false;
    const startTime = Date.now();

    function send(method: string, params: Record<string, unknown> = {}): number {
      const id = msgId++;
      const msg = JSON.stringify({ id, method, params });
      console.log(`[diag] SEND id=${id} method=${method}`);
      sock.write(buildTextFrame(msg));
      return id;
    }

    function elapsed(): string {
      return ((Date.now() - startTime) / 1000).toFixed(1) + 's';
    }

    // Status ticker
    const ticker = setInterval(() => {
      console.log(`[diag] ${elapsed()} | chunks=${chunkCount} bytes=${totalChunkBytes} progress=${progressEvents} enableAck=${enableAckReceived} snapshotResp=${snapshotResponseReceived} finished=${snapshotFinished}`);
    }, 5000);

    // 5-minute hard timeout
    const hardTimeout = setTimeout(() => {
      console.log(`[diag] HARD TIMEOUT at ${elapsed()}`);
      clearInterval(ticker);
      sock.destroy();
      resolve();
    }, 300000);

    sock.on('connect', () => {
      console.log(`[diag] ${elapsed()} TCP connected`);
      sock.write(hs);
    });

    sock.on('data', (chunk: Buffer) => {
      if (!handshakeDone) {
        const text = chunk.toString();
        if (!text.includes('101')) {
          console.log(`[diag] WS upgrade failed. Response: ${text.substring(0, 200)}`);
          reject(new Error('WS upgrade failed'));
          return;
        }
        if (!text.includes(expectedAccept)) {
          console.log(`[diag] WS accept key mismatch`);
          reject(new Error('WS accept key mismatch'));
          return;
        }
        handshakeDone = true;
        console.log(`[diag] ${elapsed()} WebSocket handshake OK`);

        send('HeapProfiler.enable');

        const rest = chunk.slice(chunk.indexOf('\r\n\r\n') + 4);
        if (rest.length > 0) residual = Buffer.concat([residual, rest]);
        return;
      }

      residual = Buffer.concat([residual, chunk]);
      const { messages, remaining } = parseFrames(residual);
      residual = remaining;

      for (const raw of messages) {
        if (typeof raw !== 'string') continue;
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }

        if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') {
          chunkCount++;
          totalChunkBytes += ((msg.params as { chunk?: string })?.chunk?.length || 0);
          if (chunkCount % 100 === 0) {
            console.log(`[diag] ${elapsed()} ... ${chunkCount} chunks, ${(totalChunkBytes / 1024 / 1024).toFixed(1)} MB`);
          }
        } else if (msg.method === 'HeapProfiler.reportHeapSnapshotProgress') {
          progressEvents++;
          const params = msg.params as { finished?: boolean; done?: number; total?: number } | undefined;
          if (params?.finished) {
            snapshotFinished = true;
            console.log(`[diag] ${elapsed()} PROGRESS finished=true (done=${params.done} total=${params.total})`);
          }
        } else if (msg.id === 1) {
          enableAckReceived = true;
          console.log(`[diag] ${elapsed()} HeapProfiler.enable ACK: ${JSON.stringify(msg)}`);
          send('HeapProfiler.takeHeapSnapshot', { reportProgress: true });
        } else if (msg.id === 2) {
          snapshotResponseReceived = true;
          const errorMsg = msg.error ? (msg.error as { message: string }).message : 'none';
          console.log(`[diag] ${elapsed()} takeHeapSnapshot RESPONSE: error=${errorMsg}`);
          console.log(`[diag] FINAL: chunks=${chunkCount} bytes=${totalChunkBytes} progressEvents=${progressEvents} finished=${snapshotFinished}`);
          clearInterval(ticker);
          clearTimeout(hardTimeout);
          sock.destroy();
          resolve();
        } else {
          console.log(`[diag] ${elapsed()} MSG: ${JSON.stringify(msg).substring(0, 200)}`);
        }
      }
    });

    sock.on('error', (e: Error) => {
      console.log(`[diag] SOCKET ERROR: ${e.message}`);
      clearInterval(ticker);
      clearTimeout(hardTimeout);
      reject(e);
    });

    sock.on('close', () => {
      console.log(`[diag] ${elapsed()} SOCKET CLOSED`);
      clearInterval(ticker);
      clearTimeout(hardTimeout);
      resolve();
    });

    sock.on('end', () => {
      console.log(`[diag] ${elapsed()} SOCKET END`);
    });
  });
}

diagnose().catch((e: Error) => {
  console.error(`[diag] FATAL: ${e.message}`);
  process.exit(1);
});
