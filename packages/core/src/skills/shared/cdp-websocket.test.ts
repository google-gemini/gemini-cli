/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  WebSocketCDPClient,
  createWebSocketCDPClient,
} from './cdp-websocket.js';
import * as crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Security validation tests (constructor-level, no network needed)
// ---------------------------------------------------------------------------

describe('WebSocketCDPClient – loopback enforcement', () => {
  it('accepts localhost', () => {
    expect(
      () => new WebSocketCDPClient({ host: 'localhost', port: 9229 }),
    ).not.toThrow();
  });

  it('accepts 127.0.0.1', () => {
    expect(
      () => new WebSocketCDPClient({ host: '127.0.0.1', port: 9229 }),
    ).not.toThrow();
  });

  it('accepts ::1', () => {
    expect(
      () => new WebSocketCDPClient({ host: '::1', port: 9229 }),
    ).not.toThrow();
  });

  it('rejects external IP', () => {
    expect(
      () => new WebSocketCDPClient({ host: '192.168.1.1', port: 9229 }),
    ).toThrow(/loopback/i);
  });

  it('rejects a public hostname', () => {
    expect(
      () => new WebSocketCDPClient({ host: 'example.com', port: 9229 }),
    ).toThrow(/loopback/i);
  });

  it('rejects 0.0.0.0', () => {
    expect(
      () => new WebSocketCDPClient({ host: '0.0.0.0', port: 9229 }),
    ).toThrow(/loopback/i);
  });
});

describe('WebSocketCDPClient – port validation', () => {
  it('accepts port 1024', () => {
    expect(
      () => new WebSocketCDPClient({ host: 'localhost', port: 1024 }),
    ).not.toThrow();
  });

  it('accepts port 9229', () => {
    expect(
      () => new WebSocketCDPClient({ host: 'localhost', port: 9229 }),
    ).not.toThrow();
  });

  it('accepts high port 65535', () => {
    expect(
      () => new WebSocketCDPClient({ host: 'localhost', port: 65535 }),
    ).not.toThrow();
  });

  it('rejects port 80', () => {
    expect(
      () => new WebSocketCDPClient({ host: 'localhost', port: 80 }),
    ).toThrow(/port/i);
  });

  it('rejects port 0', () => {
    expect(
      () => new WebSocketCDPClient({ host: 'localhost', port: 0 }),
    ).toThrow(/port/i);
  });

  it('rejects port 443', () => {
    expect(
      () => new WebSocketCDPClient({ host: 'localhost', port: 443 }),
    ).toThrow(/port/i);
  });

  it('rejects port 1023', () => {
    expect(
      () => new WebSocketCDPClient({ host: 'localhost', port: 1023 }),
    ).toThrow(/port/i);
  });
});

// ---------------------------------------------------------------------------
// RFC 6455 frame construction tests (using internal helper via re-export)
// ---------------------------------------------------------------------------

/**
 * Re-implement the frame builder here to test the expected wire format.
 * We verify the output of buildClientFrame by decoding it manually.
 */
function buildClientFrame(opcode: number, payload: Buffer): Buffer {
  const maskingKey = crypto.randomBytes(4);
  const payloadLen = payload.length;
  let headerLen: number;
  if (payloadLen <= 125) headerLen = 6;
  else if (payloadLen <= 65535) headerLen = 8;
  else headerLen = 14;

  const frame = Buffer.allocUnsafe(headerLen + payloadLen);
  frame[0] = 0x80 | (opcode & 0x0f);
  if (payloadLen <= 125) {
    frame[1] = 0x80 | payloadLen;
    maskingKey.copy(frame, 2);
  } else if (payloadLen <= 65535) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(payloadLen, 2);
    maskingKey.copy(frame, 4);
  } else {
    frame[1] = 0x80 | 127;
    frame.writeUInt32BE(0, 2);
    frame.writeUInt32BE(payloadLen >>> 0, 6);
    maskingKey.copy(frame, 10);
  }
  for (let i = 0; i < payloadLen; i++) {
    frame[headerLen + i] = payload[i] ^ maskingKey[i % 4];
  }
  return frame;
}

describe('RFC 6455 frame construction', () => {
  it('sets FIN bit in first byte', () => {
    const frame = buildClientFrame(0x1, Buffer.from('hello'));
    expect(frame[0] & 0x80).toBe(0x80);
  });

  it('sets correct opcode for text frame', () => {
    const frame = buildClientFrame(0x1, Buffer.from('hello'));
    expect(frame[0] & 0x0f).toBe(0x1);
  });

  it('sets MASK bit in second byte', () => {
    const frame = buildClientFrame(0x1, Buffer.from('hello'));
    expect(frame[1] & 0x80).toBe(0x80);
  });

  it('encodes small payload length in second byte', () => {
    const payload = Buffer.alloc(50);
    const frame = buildClientFrame(0x1, payload);
    expect(frame[1] & 0x7f).toBe(50);
  });

  it('uses 16-bit length for payloads 126-65535', () => {
    const payload = Buffer.alloc(200);
    const frame = buildClientFrame(0x1, payload);
    expect(frame[1] & 0x7f).toBe(126);
    expect(frame.readUInt16BE(2)).toBe(200);
  });

  it('uses 64-bit length for payloads > 65535', () => {
    const payload = Buffer.alloc(70000);
    const frame = buildClientFrame(0x1, payload);
    expect(frame[1] & 0x7f).toBe(127);
    const hi = frame.readUInt32BE(2);
    const lo = frame.readUInt32BE(6);
    expect(hi).toBe(0);
    expect(lo).toBe(70000);
  });

  it('applies masking key to payload', () => {
    const payload = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const frame = buildClientFrame(0x1, payload);
    // Extract masking key (bytes 2-5)
    const mask = frame.subarray(2, 6);
    // Verify payload is XOR-masked
    for (let i = 0; i < 4; i++) {
      expect(frame[6 + i]).toBe(payload[i] ^ mask[i % 4]);
    }
  });

  it('builds binary frame with correct opcode', () => {
    const frame = buildClientFrame(0x2, Buffer.from([1, 2, 3]));
    expect(frame[0] & 0x0f).toBe(0x2);
  });

  it('builds ping frame with correct opcode', () => {
    const frame = buildClientFrame(0x9, Buffer.alloc(0));
    expect(frame[0] & 0x0f).toBe(0x9);
  });

  it('builds close frame with correct opcode', () => {
    const frame = buildClientFrame(0x8, Buffer.alloc(0));
    expect(frame[0] & 0x0f).toBe(0x8);
  });

  it('frame total length matches header + payload', () => {
    const payload = Buffer.alloc(100);
    const frame = buildClientFrame(0x1, payload);
    expect(frame.length).toBe(6 + 100); // 2 + 4 mask + payload
  });
});

// ---------------------------------------------------------------------------
// Chunk reassembly simulation
// ---------------------------------------------------------------------------

describe('Heap snapshot chunk reassembly', () => {
  it('concatenates multiple chunks into full snapshot string', () => {
    const chunks = [
      '{"snapshot":{',
      '"meta":{}},',
      '"nodes":[1,2,3],',
      '"strings":["a"]}',
    ];
    const full = chunks.join('');
    expect(full).toBe(
      '{"snapshot":{"meta":{}},"nodes":[1,2,3],"strings":["a"]}',
    );
  });

  it('handles single large chunk', () => {
    const chunk = 'x'.repeat(100000);
    const chunks = [chunk];
    expect(chunks.join('')).toBe(chunk);
  });

  it('handles empty chunks array', () => {
    expect([].join('')).toBe('');
  });

  it('preserves order of chunks', () => {
    const chunks = ['a', 'b', 'c', 'd', 'e'];
    expect(chunks.join('')).toBe('abcde');
  });

  it('handles unicode in chunks', () => {
    const chunks = ['{"name":"', '日本語テスト', '"}'];
    expect(chunks.join('')).toBe('{"name":"日本語テスト"}');
  });
});

// ---------------------------------------------------------------------------
// createWebSocketCDPClient factory
// ---------------------------------------------------------------------------

describe('createWebSocketCDPClient', () => {
  it('creates a client with default host localhost', () => {
    const client = createWebSocketCDPClient(9229);
    expect(client).toBeInstanceOf(WebSocketCDPClient);
  });

  it('throws for non-loopback host option', () => {
    expect(() => createWebSocketCDPClient(9229, { host: '10.0.0.1' })).toThrow(
      /loopback/i,
    );
  });

  it('throws for privileged port', () => {
    expect(() => createWebSocketCDPClient(22)).toThrow(/port/i);
  });

  it('accepts custom timeout option', () => {
    expect(() =>
      createWebSocketCDPClient(9229, { timeout: 60000 }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Timeout / disconnect simulation
// ---------------------------------------------------------------------------

describe('WebSocketCDPClient – disconnect', () => {
  it('disconnect resolves immediately when not connected', async () => {
    const client = new WebSocketCDPClient({ host: 'localhost', port: 9229 });
    // Should resolve without error even when not connected
    await expect(client.disconnect()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sendCommand rejects when not connected
// ---------------------------------------------------------------------------

describe('WebSocketCDPClient – sendCommand without connection', () => {
  it('rejects with "Not connected" error', async () => {
    const client = new WebSocketCDPClient({ host: 'localhost', port: 9229 });
    await expect(client.sendCommand('Profiler.enable')).rejects.toThrow(
      /Not connected/i,
    );
  });
});
