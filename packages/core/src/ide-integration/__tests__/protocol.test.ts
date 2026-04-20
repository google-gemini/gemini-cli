/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IDEProtocol,
  ProtocolError,
  ProtocolErrorCode,
  type ProtocolTransport,
} from '../protocol.js';

/**
 * Creates a mock transport that captures sent data and allows
 * simulating incoming data.
 */
function createMockTransport(): ProtocolTransport & {
  sentData: string[];
  dataHandler: ((data: string) => void) | undefined;
  closed: boolean;
} {
  const mock = {
    sentData: [] as string[],
    dataHandler: undefined as ((data: string) => void) | undefined,
    closed: false,
    send(data: string): void {
      mock.sentData.push(data);
    },
    onData(handler: (data: string) => void): void {
      mock.dataHandler = handler;
    },
    close(): void {
      mock.closed = true;
    },
  };
  return mock;
}

/**
 * Build a Content-Length framed message from a JSON object.
 */
function frameMessage(obj: Record<string, unknown>): string {
  const body = JSON.stringify(obj);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

describe('IDEProtocol', () => {
  let protocol: IDEProtocol;
  let transport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    vi.useFakeTimers();
    protocol = new IDEProtocol({ requestTimeoutMs: 5000 });
    transport = createMockTransport();
    protocol.setTransport(transport);
  });

  afterEach(() => {
    protocol.dispose();
    vi.useRealTimers();
  });

  describe('sendRequest', () => {
    it('should send a properly framed JSON-RPC request', () => {
      // Start the request but do not await it (no response yet)
      const promise = protocol.sendRequest('test/method', { key: 'value' });

      expect(transport.sentData).toHaveLength(1);
      const sent = transport.sentData[0];
      expect(sent).toContain('Content-Length:');
      expect(sent).toContain('"jsonrpc":"2.0"');
      expect(sent).toContain('"method":"test/method"');
      expect(sent).toContain('"key":"value"');

      // Extract the id from the sent message for the response
      const bodyMatch = sent.match(/\r\n\r\n(.+)$/s);
      expect(bodyMatch).not.toBeNull();
      const parsed = JSON.parse(bodyMatch![1]) as { id: string };
      expect(parsed.id).toBeDefined();

      // Respond to prevent timeout leak
      const response = frameMessage({
        jsonrpc: '2.0',
        id: parsed.id,
        result: { ok: true },
      });
      transport.dataHandler!(response);

      return expect(promise).resolves.toEqual({ ok: true });
    });

    it('should resolve with the result from a matching response', async () => {
      const promise = protocol.sendRequest('add', { a: 1, b: 2 });

      // Extract id from sent data
      const body = transport.sentData[0].split('\r\n\r\n')[1];
      const { id } = JSON.parse(body) as { id: string };

      transport.dataHandler!(frameMessage({ jsonrpc: '2.0', id, result: 3 }));

      await expect(promise).resolves.toBe(3);
    });

    it('should reject with ProtocolError when the response contains an error', async () => {
      const promise = protocol.sendRequest('fail/method');

      const body = transport.sentData[0].split('\r\n\r\n')[1];
      const { id } = JSON.parse(body) as { id: string };

      transport.dataHandler!(
        frameMessage({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: 'Method not found' },
        }),
      );

      await expect(promise).rejects.toThrow(ProtocolError);
      await expect(promise).rejects.toMatchObject({
        code: -32601,
        message: 'Method not found',
      });
    });

    it('should reject with a timeout error when no response arrives', async () => {
      const promise = protocol.sendRequest('slow/method');

      vi.advanceTimersByTime(5000);

      await expect(promise).rejects.toThrow(ProtocolError);
      await expect(promise).rejects.toMatchObject({
        code: ProtocolErrorCode.RequestTimeout,
      });
    });

    it('should reject when no transport is attached', async () => {
      const noTransportProtocol = new IDEProtocol();

      await expect(noTransportProtocol.sendRequest('nope')).rejects.toThrow(
        'No transport attached',
      );

      noTransportProtocol.dispose();
    });
  });

  describe('sendNotification', () => {
    it('should send a framed notification without an id', () => {
      protocol.sendNotification('update/status', { status: 'ready' });

      expect(transport.sentData).toHaveLength(1);
      const sent = transport.sentData[0];
      const body = sent.split('\r\n\r\n')[1];
      const parsed = JSON.parse(body) as Record<string, unknown>;

      expect(parsed['jsonrpc']).toBe('2.0');
      expect(parsed['method']).toBe('update/status');
      expect(parsed['id']).toBeUndefined();
      expect(parsed['params']).toEqual({ status: 'ready' });
    });

    it('should throw when no transport is attached', () => {
      const noTransportProtocol = new IDEProtocol();

      expect(() => noTransportProtocol.sendNotification('test')).toThrow(
        'No transport attached',
      );

      noTransportProtocol.dispose();
    });
  });

  describe('onNotification', () => {
    it('should invoke registered handlers when a matching notification arrives', () => {
      const handler = vi.fn();
      protocol.onNotification('ide/contextUpdate', handler);

      transport.dataHandler!(
        frameMessage({
          jsonrpc: '2.0',
          method: 'ide/contextUpdate',
          params: { files: ['a.ts'] },
        }),
      );

      expect(handler).toHaveBeenCalledExactlyOnceWith({ files: ['a.ts'] });
    });

    it('should support multiple handlers for the same method', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      protocol.onNotification('event', handler1);
      protocol.onNotification('event', handler2);

      transport.dataHandler!(
        frameMessage({
          jsonrpc: '2.0',
          method: 'event',
          params: { x: 1 },
        }),
      );

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
    });

    it('should not invoke handlers for non-matching methods', () => {
      const handler = vi.fn();
      protocol.onNotification('other/method', handler);

      transport.dataHandler!(
        frameMessage({
          jsonrpc: '2.0',
          method: 'different/method',
          params: {},
        }),
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('offNotification', () => {
    it('should remove a registered handler', () => {
      const handler = vi.fn();
      protocol.onNotification('event', handler);
      protocol.offNotification('event', handler);

      transport.dataHandler!(
        frameMessage({
          jsonrpc: '2.0',
          method: 'event',
          params: {},
        }),
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('message framing', () => {
    it('should handle messages arriving in multiple chunks', async () => {
      const promise = protocol.sendRequest('chunked/method');

      const body = transport.sentData[0].split('\r\n\r\n')[1];
      const { id } = JSON.parse(body) as { id: string };

      const responseBody = JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: 'chunked',
      });
      const fullFrame = `Content-Length: ${Buffer.byteLength(responseBody)}\r\n\r\n${responseBody}`;

      // Split the frame into two chunks
      const midpoint = Math.floor(fullFrame.length / 2);
      transport.dataHandler!(fullFrame.substring(0, midpoint));
      transport.dataHandler!(fullFrame.substring(midpoint));

      await expect(promise).resolves.toBe('chunked');
    });

    it('should handle multiple messages in a single data chunk', () => {
      const handler = vi.fn();
      protocol.onNotification('batch', handler);

      const msg1 = frameMessage({
        jsonrpc: '2.0',
        method: 'batch',
        params: { n: 1 },
      });
      const msg2 = frameMessage({
        jsonrpc: '2.0',
        method: 'batch',
        params: { n: 2 },
      });

      transport.dataHandler!(msg1 + msg2);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(1, { n: 1 });
      expect(handler).toHaveBeenNthCalledWith(2, { n: 2 });
    });

    it('should skip malformed headers and continue processing', () => {
      const handler = vi.fn();
      protocol.onNotification('test', handler);

      // Send garbage followed by a valid message
      const garbage = 'GARBAGE\r\n\r\n';
      const valid = frameMessage({
        jsonrpc: '2.0',
        method: 'test',
        params: { ok: true },
      });

      transport.dataHandler!(garbage + valid);

      expect(handler).toHaveBeenCalledExactlyOnceWith({ ok: true });
    });
  });

  describe('dispose', () => {
    it('should reject all pending requests', async () => {
      const promise = protocol.sendRequest('pending');

      protocol.dispose();

      await expect(promise).rejects.toThrow('Protocol disposed');
    });

    it('should close the transport', () => {
      protocol.dispose();
      expect(transport.closed).toBe(true);
    });

    it('should clear notification handlers', () => {
      const handler = vi.fn();
      protocol.onNotification('event', handler);

      protocol.dispose();

      // Re-attach a fresh transport and send a notification
      const newTransport = createMockTransport();
      protocol.setTransport(newTransport);
      newTransport.dataHandler!(
        frameMessage({
          jsonrpc: '2.0',
          method: 'event',
          params: {},
        }),
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('incoming requests', () => {
    it('should emit a request event for messages with both id and method', () => {
      const requestHandler = vi.fn();
      protocol.on('request', requestHandler);

      transport.dataHandler!(
        frameMessage({
          jsonrpc: '2.0',
          id: 'req-1',
          method: 'editor/getState',
          params: { detail: true },
        }),
      );

      expect(requestHandler).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
          type: 'request',
          method: 'editor/getState',
          id: 'req-1',
          params: { detail: true },
        }));
    });
  });
});
