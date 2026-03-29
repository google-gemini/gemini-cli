/* global console, process, Buffer, URL, setTimeout, clearTimeout */
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
 *   node cdp.mjs --port 9229 --output ./snapshot_cdp.heapsnapshot --timeout 300
 *
 * Target process must be launched with:
 *   node --inspect=127.0.0.1:9229 your-script.js
 */

import { createConnection } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { createWriteStream } from 'node:fs';
import { parseArgs } from 'node:util';

// ---------- Argument parsing ------------------------------------------------

const { values: args } = parseArgs({
  options: {
    port: { type: 'string', default: '9229' },
    host: { type: 'string', default: '127.0.0.1' },
    output: { type: 'string', default: './snapshot_cdp.heapsnapshot' },
    timeout: { type: 'string', default: '300' },
  },
  strict: true,
});

const PORT = parseInt(args.port, 10);
const HOST = args.host;
const OUTPUT = args.output;
const TIMEOUT_S = parseInt(args.timeout, 10);

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

// ---------- Step 3: Robust WebSocket frame parser ---------------------------
// Handles: text frames (opcode 1), continuation frames (opcode 0),
// close frames (opcode 8), ping frames (opcode 9).
// V8 inspector sends large payloads that may be fragmented across
// multiple WebSocket frames AND multiple TCP packets.

/**
 * Parse one or more complete WebSocket frames from a buffer.
 *
 * Returns an object with:
 * - frames: array of { opcode, fin, payload } for each complete frame
 * - remaining: leftover bytes not yet forming a complete frame
 *
 * This is the low-level parser. Message assembly (handling fragmentation)
 * is done by the caller.
 */
function parseFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset < buffer.length) {
    // Need at least 2 bytes for the frame header
    if (buffer.length - offset < 2) break;

    const byte0 = buffer[offset];
    const byte1 = buffer[offset + 1];
    const fin = (byte0 & 0x80) !== 0;
    const opcode = byte0 & 0x0f;
    const masked = (byte1 & 0x80) !== 0;
    let payloadLen = byte1 & 0x7f;
    let headerLen = 2;

    if (payloadLen === 126) {
      headerLen += 2;
      if (buffer.length - offset < headerLen) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
    } else if (payloadLen === 127) {
      headerLen += 8;
      if (buffer.length - offset < headerLen) break;
      // For safety, read as BigInt then convert
      const bigLen = buffer.readBigUInt64BE(offset + 2);
      if (bigLen > BigInt(Number.MAX_SAFE_INTEGER)) {
        // Frame too large to handle - skip it
        break;
      }
      payloadLen = Number(bigLen);
    }

    // If server sent a masked frame, account for the 4-byte mask key
    if (masked) {
      headerLen += 4;
    }

    const totalFrameLen = headerLen + payloadLen;
    if (buffer.length - offset < totalFrameLen) break;

    let payload;
    if (masked) {
      const maskKey = buffer.slice(offset + headerLen - 4, offset + headerLen);
      payload = Buffer.alloc(payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        payload[i] = buffer[offset + headerLen + i] ^ maskKey[i & 3];
      }
    } else {
      payload = buffer.slice(offset + headerLen, offset + headerLen + payloadLen);
    }

    frames.push({ opcode, fin, payload });
    offset += totalFrameLen;
  }

  return { frames, remaining: buffer.slice(offset) };
}

/**
 * Assembles complete WebSocket messages from a stream of frames.
 * Handles continuation frames (opcode 0) for fragmented messages.
 */
class MessageAssembler {
  constructor() {
    this._fragments = [];
    this._currentOpcode = -1;
  }

  /**
   * Feed a parsed frame. Returns an array of complete text messages (strings).
   */
  feed(frame) {
    const messages = [];

    if (frame.opcode >= 0x8) {
      // Control frame (close=8, ping=9, pong=10) — handle inline
      if (frame.opcode === 8) {
        messages.push({ _type: 'close' });
      } else if (frame.opcode === 9) {
        messages.push({ _type: 'ping', payload: frame.payload });
      }
      // Control frames don't affect fragmentation state
      return messages;
    }

    if (frame.opcode !== 0) {
      // New data frame (text=1, binary=2)
      this._currentOpcode = frame.opcode;
      this._fragments = [frame.payload];
    } else {
      // Continuation frame
      this._fragments.push(frame.payload);
    }

    if (frame.fin) {
      // Message complete — assemble
      if (this._currentOpcode === 1) {
        const fullPayload = Buffer.concat(this._fragments);
        messages.push({ _type: 'text', data: fullPayload.toString('utf8') });
      }
      this._fragments = [];
      this._currentOpcode = -1;
    }

    return messages;
  }
}

// ---------- Step 4: Send MASKED WS text frame (RFC 6455 Section 5.1) --------

function buildTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  const maskKey = randomBytes(4);
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + opcode=text
    header[1] = 0x80 | len; // MASK bit set + payload length
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
  const maskedPayload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    maskedPayload[i] = payload[i] ^ maskKey[i & 3];
  }
  return Buffer.concat([header, maskKey, maskedPayload]);
}

// ---------- Step 5: Build Pong frame for keep-alive -------------------------

function buildPongFrame(payload) {
  const len = payload ? payload.length : 0;
  const maskKey = randomBytes(4);
  const header = Buffer.alloc(2);
  header[0] = 0x8A; // FIN + opcode=pong
  header[1] = 0x80 | len;
  if (len === 0) return Buffer.concat([header, maskKey]);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    masked[i] = payload[i] ^ maskKey[i & 3];
  }
  return Buffer.concat([header, maskKey, masked]);
}

// ---------- Main capture flow -----------------------------------------------

async function captureCdpSnapshot() {
  console.log(`[cdp] Connecting to ${HOST}:${PORT}...`);
  console.log(`[cdp] Timeout: ${TIMEOUT_S}s`);

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
    const assembler = new MessageAssembler();
    let chunkCount = 0;
    let totalBytes = 0;

    function send(method, params = {}) {
      const msg = JSON.stringify({ id: msgId++, method, params });
      sock.write(buildTextFrame(msg));
    }

    function cleanup() {
      clearTimeout(timeoutHandle);
      sock.destroy();
    }

    const timeoutHandle = setTimeout(() => {
      console.error(`\n[cdp] Timed out after ${TIMEOUT_S}s (chunks received: ${chunkCount}, bytes: ${totalBytes})`);
      writer.end(() => {
        cleanup();
        reject(new Error(`Timed out after ${TIMEOUT_S}s`));
      });
    }, TIMEOUT_S * 1000);

    sock.on('connect', () => sock.write(handshake));

    sock.on('data', (chunk) => {
      if (!handshakeDone) {
        const text = chunk.toString();
        if (!text.includes('101')) { cleanup(); reject(new Error('WS upgrade failed')); return; }
        if (!text.includes(expectedAccept)) { cleanup(); reject(new Error('WS accept key mismatch')); return; }
        handshakeDone = true;
        console.log('[cdp] WebSocket connected. Enabling HeapProfiler...');
        send('HeapProfiler.enable');
        const headerEnd = chunk.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const rest = chunk.slice(headerEnd + 4);
          if (rest.length > 0) residual = Buffer.concat([residual, rest]);
        }
        return;
      }

      residual = Buffer.concat([residual, chunk]);
      const { frames, remaining } = parseFrames(residual);
      residual = remaining;

      for (const frame of frames) {
        const msgs = assembler.feed(frame);
        for (const m of msgs) {
          if (m._type === 'close') {
            console.log('[cdp] Server sent Close frame');
            continue;
          }
          if (m._type === 'ping') {
            sock.write(buildPongFrame(m.payload));
            continue;
          }
          if (m._type !== 'text') continue;

          let msg;
          try { msg = JSON.parse(m.data); } catch { continue; }

          // HeapProfiler.enable ack → take snapshot
          if (msg.id === 1 && !msg.error) {
            console.log('[cdp] HeapProfiler enabled. Taking snapshot (this may take a while)...');
            send('HeapProfiler.takeHeapSnapshot', { reportProgress: true });
          }

          // HeapProfiler.enable error
          if (msg.id === 1 && msg.error) {
            cleanup();
            reject(new Error('HeapProfiler.enable failed: ' + msg.error.message));
            return;
          }

          // Snapshot chunk events
          if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') {
            chunkCount++;
            const chunkData = msg.params.chunk;
            totalBytes += chunkData.length;
            writer.write(chunkData);
            if (chunkCount % 200 === 0) {
              process.stdout.write(`\r[cdp] ${chunkCount} chunks, ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
            }
          }

          // Progress events (informational)
          if (msg.method === 'HeapProfiler.reportHeapSnapshotProgress') {
            if (msg.params?.finished) {
              process.stdout.write(`\r[cdp] Snapshot generation complete.                    \n`);
            }
          }

          // takeHeapSnapshot response (id=2) — this is the authoritative completion signal
          if (msg.id === 2) {
            if (msg.error) {
              cleanup();
              reject(new Error('CDP error: ' + msg.error.message));
              return;
            }
            // The response with id=2 means V8 has finished sending all chunks.
            // No need to wait for a progress event.
            process.stdout.write(`\r[cdp] Total: ${chunkCount} chunks, ${(totalBytes / 1024 / 1024).toFixed(1)} MB\n`);
            writer.end(() => {
              console.log(`[cdp] Snapshot written to ${OUTPUT}`);
              cleanup();
              resolve();
            });
            return;
          }
        }
      }
    });

    sock.on('error', (e) => {
      cleanup();
      reject(new Error('[cdp] Socket error: ' + e.message));
    });

    sock.on('close', () => {
      // If we get here without resolving, the server closed unexpectedly
      clearTimeout(timeoutHandle);
    });
  });
}

captureCdpSnapshot().catch((e) => {
  console.error('[cdp] FATAL:', e.message);
  process.exit(1);
});
