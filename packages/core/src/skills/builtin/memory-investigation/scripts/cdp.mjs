/* global console, process, Buffer, URL, setInterval, clearInterval */
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * cdp.mjs — Minimal CDP WebSocket client for heap snapshot capture.
 *
 * Zero external dependencies. Uses node:net + node:http + node:crypto.
 * Connects to a running Node.js process via --inspect, sends HeapProfiler
 * commands, streams snapshot chunks to a file.
 *
 * Usage:
 *   node cdp.mjs --port 9229 --output ./snapshot_cdp.heapsnapshot
 *
 * Target process must be launched with:
 *   node --inspect=127.0.0.1:9229 your-script.js
 */

import { createConnection } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { createWriteStream } from 'node:fs';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- Argument parsing ------------------------------------------------

const { values: args } = parseArgs({
  options: {
    port: { type: 'string', default: '9229' },
    host: { type: 'string', default: '127.0.0.1' },
    output: { type: 'string', default: './snapshot_cdp.heapsnapshot' },
    'timeout-ms': { type: 'string', default: '30000' },
  },
  strict: true,
});

const PORT = parseInt(args.port, 10);
const HOST = args.host;
const OUTPUT = args.output;
const TIMEOUT_MS = parseInt(args['timeout-ms'], 10);

// ---------- Security: Loopback-only enforcement ----------------------------

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
if (!ALLOWED_HOSTS.has(HOST)) {
  console.error(
    `[cdp] SECURITY: Refused connection to non-loopback host "${HOST}".\n` +
    `     Inspector ports must bind to 127.0.0.1 or localhost only.\n` +
    `     Connecting to remote/0.0.0.0 hosts exposes the debugger to the network.`
  );
  process.exit(1);
}
if (PORT < 1024) {
  console.error(
    `[cdp] SECURITY: Refused connection to privileged port ${PORT}.\n` +
    `     Use a port >= 1024 (default: 9229).`
  );
  process.exit(1);
}
if (!Number.isFinite(TIMEOUT_MS) || TIMEOUT_MS <= 0) {
  console.error('[cdp] Invalid --timeout-ms value. Use a positive integer.');
  process.exit(1);
}

// ---------- Step 1: Resolve WebSocket URL from /json/list -------------------

function resolveWsUrl(host, port) {
  return new Promise((resolve, reject) => {
    const req = request(`http://${host}:${port}/json/list`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          const target = targets.find((t) => t.type === 'node') ?? targets[0];
          if (!target?.webSocketDebuggerUrl) {
            reject(new Error('No debuggable Node.js target found on port ' + port));
            return;
          }
          resolve(target.webSocketDebuggerUrl);
        } catch (e) {
          reject(new Error('Failed to parse /json/list: ' + e.message));
        }
      });
    });
    req.on('error', (e) => reject(new Error(`Inspector not reachable at ${host}:${port} — ${e.message}`)));
    req.end();
  });
}

// ---------- Step 2: Minimal WebSocket handshake (RFC 6455) ------------------

function buildHandshake(host, port, path) {
  const key = randomBytes(16).toString('base64');
  const handshake = [
    `GET ${path} HTTP/1.1`,
    `Host: ${host}:${port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    '\r\n',
  ].join('\r\n');
  const expectedAccept = createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  return { handshake, expectedAccept };
}

// ---------- Step 3: WebSocket frame parser (text + control frames) ----------

function parseFrames(buffer) {
  const messages = [];
  const controlFrames = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;
    const fin = (buffer[offset] & 0x80) !== 0;
    const opcode = buffer[offset] & 0x0f;
    offset++;
    const masked = (buffer[offset] & 0x80) !== 0;
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
    let maskKey = null;
    if (masked) {
      if (buffer.length - offset < 4) break;
      maskKey = buffer.slice(offset, offset + 4);
      offset += 4;
    }
    if (buffer.length - offset < payloadLen) break;
    let payload = buffer.slice(offset, offset + payloadLen);
    offset += payloadLen;
    if (masked && maskKey) {
      const unmasked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) {
        unmasked[i] = payload[i] ^ maskKey[i & 3];
      }
      payload = unmasked;
    }
    if (fin && opcode === 1) {
      messages.push(payload.toString('utf8'));
    } else if (fin && (opcode === 0x8 || opcode === 0x9 || opcode === 0xA)) {
      controlFrames.push({ opcode, payload });
    }
  }
  return { messages, controlFrames, remaining: buffer.slice(offset) };
}

// ---------- Step 4: Send MASKED WS frames (RFC 6455 Section 5.1) ------------
// Per RFC 6455: "A client MUST mask all frames that it sends to the server."

function buildFrame(opcode, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const len = body.length;
  const maskKey = randomBytes(4);
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | len; // MASK bit set + payload length
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  // XOR payload with 4-byte mask key (RFC 6455 Section 5.3)
  const maskedPayload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    maskedPayload[i] = body[i] ^ maskKey[i & 3];
  }
  return Buffer.concat([header, maskKey, maskedPayload]);
}

function buildTextFrame(text) {
  return buildFrame(0x1, text);
}

function buildPongFrame(payload) {
  return buildFrame(0xA, payload);
}

function buildCloseFrame(payload = Buffer.alloc(0)) {
  return buildFrame(0x8, payload);
}

function decodeCloseReason(payload) {
  if (!payload || payload.length < 2) return 'no close reason provided';
  const code = payload.readUInt16BE(0);
  const reason = payload.length > 2 ? payload.slice(2).toString('utf8') : 'no reason';
  return `code ${code}${reason ? ` (${reason})` : ''}`;
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(entry);
}

// ---------- Main capture flow -----------------------------------------------

async function captureCdpSnapshot() {
  console.log(`[cdp] Connecting to ${HOST}:${PORT}...`);

  const wsUrl = await resolveWsUrl(HOST, PORT);
  const urlObj = new URL(wsUrl);

  console.log(`[cdp] Target: ${urlObj.pathname}`);

  await new Promise((resolve, reject) => {
    const sock = createConnection({ host: urlObj.hostname, port: parseInt(urlObj.port, 10) });
    const { handshake, expectedAccept } = buildHandshake(urlObj.hostname, urlObj.port, urlObj.pathname);

    const writer = createWriteStream(OUTPUT);
    let msgId = 1;
    let handshakeDone = false;
    let residual = Buffer.alloc(0);
    let snapshotDone = false;
    let settled = false;
    let closeSent = false;
    let completionPoll = null;

    function send(method, params = {}) {
      const msg = JSON.stringify({ id: msgId++, method, params });
      sock.write(buildTextFrame(msg));
    }

    function sendClose(payload = Buffer.alloc(0)) {
      if (closeSent || sock.destroyed) return;
      closeSent = true;
      sock.write(buildCloseFrame(payload));
    }

    function cleanup() {
      if (completionPoll) {
        clearInterval(completionPoll);
        completionPoll = null;
      }
      sock.setTimeout(0);
    }

    function finishSuccess() {
      if (settled) return;
      settled = true;
      cleanup();
      process.stdout.write('\n');
      writer.end(() => {
        console.log(`[cdp] Snapshot written to ${OUTPUT}`);
        sock.destroy();
        resolve();
      });
    }

    function fail(error, options = {}) {
      if (settled) return;
      settled = true;
      cleanup();
      if (options.sendClose) {
        sendClose(options.closePayload);
      }
      writer.destroy();
      sock.destroy();
      reject(error);
    }

    sock.on('connect', () => sock.write(handshake));

    sock.on('data', (chunk) => {
      if (!handshakeDone) {
        const text = chunk.toString();
        if (!text.includes('101')) { fail(new Error('WS upgrade failed')); return; }
        if (!text.includes(expectedAccept)) { fail(new Error('WS accept key mismatch')); return; }
        handshakeDone = true;
        console.log('[cdp] WebSocket connected. Enabling HeapProfiler...');
        send('HeapProfiler.enable');
        const rest = chunk.slice(chunk.indexOf('\r\n\r\n') + 4);
        if (rest.length > 0) residual = Buffer.concat([residual, rest]);
        return;
      }

      residual = Buffer.concat([residual, chunk]);
      const { messages, controlFrames, remaining } = parseFrames(residual);
      residual = remaining;

      for (const frame of controlFrames) {
        if (frame.opcode === 0x9) {
          sock.write(buildPongFrame(frame.payload));
          continue;
        }
        if (frame.opcode === 0xA) {
          continue;
        }
        if (frame.opcode === 0x8) {
          fail(
            new Error(`[cdp] Inspector closed the WebSocket connection: ${decodeCloseReason(frame.payload)}`),
            { sendClose: !closeSent, closePayload: frame.payload }
          );
          return;
        }
      }

      for (const raw of messages) {
        let msg;
        try { msg = JSON.parse(raw); } catch { continue; }

        // HeapProfiler.enable ack → take snapshot
        if (msg.id === 1 && !msg.error) {
          console.log('[cdp] HeapProfiler enabled. Taking snapshot...');
          send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
        }

        // Snapshot chunk events
        if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') {
          process.stdout.write('.');
          writer.write(msg.params.chunk);
        }

        // Snapshot complete
        if (msg.method === 'HeapProfiler.reportHeapSnapshotProgress' &&
            msg.params.finished === true) {
          snapshotDone = true;
        }

        // takeHeapSnapshot response (id=2)
        if (msg.id === 2) {
          if (msg.error) { fail(new Error('CDP error: ' + msg.error.message)); return; }
          if (snapshotDone) {
            finishSuccess();
          } else {
            // Wait for progress finished event
            completionPoll = setInterval(() => {
              if (snapshotDone) {
                finishSuccess();
              }
            }, 100);
          }
        }
      }
    });

    sock.on('error', (e) => fail(new Error('[cdp] Socket error: ' + e.message)));
    sock.setTimeout(TIMEOUT_MS, () => fail(new Error(`[cdp] Connection timed out after ${TIMEOUT_MS}ms`)));
    sock.on('close', () => {
      if (!settled) {
        fail(new Error('[cdp] Inspector closed the socket before snapshot capture completed.'));
      }
    });
  });
}

if (isMainModule()) {
  captureCdpSnapshot().catch((e) => {
    console.error('[cdp] FATAL:', e.message);
    process.exit(1);
  });
}
