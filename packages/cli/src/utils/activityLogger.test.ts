/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActivityLogger, type NetworkLog } from './activityLogger.js';
import type { ConsoleLogPayload } from '@google/gemini-cli-core';

describe('ActivityLogger', () => {
  let logger: ActivityLogger;

  beforeEach(() => {
    logger = ActivityLogger.getInstance();
    logger.clearBufferedLogs();
  });

  it('buffers the last 10 requests with all their events grouped', () => {
    // Emit 15 requests, each with an initial + response event
    for (let i = 0; i < 15; i++) {
      const initial: NetworkLog = {
        id: `req-${i}`,
        timestamp: i * 2,
        method: 'GET',
        url: 'http://example.com',
        headers: {},
        pending: true,
      };
      logger.emitNetworkEvent(initial);
      logger.emitNetworkEvent({
        id: `req-${i}`,
        pending: false,
        response: {
          status: 200,
          headers: {},
          body: 'ok',
          durationMs: 10,
        },
      });
    }

    const logs = logger.getBufferedLogs();
    // 10 requests * 2 events each = 20 events
    expect(logs.network.length).toBe(20);
    // Oldest kept should be req-5 (first 5 evicted)
    expect(logs.network[0].id).toBe('req-5');
    // Last should be req-14
    expect(logs.network[19].id).toBe('req-14');
  });

  it('keeps all chunk events for a buffered request', () => {
    // One request with many chunks
    logger.emitNetworkEvent({
      id: 'chunked',
      timestamp: 1,
      method: 'POST',
      url: 'http://example.com',
      headers: {},
      pending: true,
    });
    for (let i = 0; i < 5; i++) {
      logger.emitNetworkEvent({
        id: 'chunked',
        pending: true,
        chunk: { index: i, data: `chunk-${i}`, timestamp: 2 + i },
      });
    }
    logger.emitNetworkEvent({
      id: 'chunked',
      pending: false,
      response: { status: 200, headers: {}, body: 'done', durationMs: 50 },
    });

    const logs = logger.getBufferedLogs();
    // 1 initial + 5 chunks + 1 response = 7 events, all for 'chunked'
    expect(logs.network.length).toBe(7);
    expect(logs.network.every((l) => l.id === 'chunked')).toBe(true);
  });

  it('buffers only the last 10 console logs', () => {
    for (let i = 0; i < 15; i++) {
      const log: ConsoleLogPayload = { content: `log-${i}`, type: 'log' };
      logger.logConsole(log);
    }

    const logs = logger.getBufferedLogs();
    expect(logs.console.length).toBe(10);
    expect(logs.console[0].content).toBe('log-5');
    expect(logs.console[9].content).toBe('log-14');
  });

  it('getBufferedLogs is non-destructive', () => {
    logger.logConsole({ content: 'test', type: 'log' });
    const first = logger.getBufferedLogs();
    const second = logger.getBufferedLogs();
    expect(first.console.length).toBe(1);
    expect(second.console.length).toBe(1);
  });

  it('clearBufferedLogs empties both buffers', () => {
    logger.logConsole({ content: 'test', type: 'log' });
    logger.emitNetworkEvent({
      id: 'r1',
      timestamp: 1,
      method: 'GET',
      url: 'http://example.com',
      headers: {},
    });
    logger.clearBufferedLogs();
    const logs = logger.getBufferedLogs();
    expect(logs.console.length).toBe(0);
    expect(logs.network.length).toBe(0);
  });

  it('drainBufferedLogs returns and clears atomically', () => {
    logger.logConsole({ content: 'drain-test', type: 'log' });
    logger.emitNetworkEvent({
      id: 'r1',
      timestamp: 1,
      method: 'GET',
      url: 'http://example.com',
      headers: {},
    });

    const drained = logger.drainBufferedLogs();
    expect(drained.console.length).toBe(1);
    expect(drained.network.length).toBe(1);

    // Buffer should now be empty
    const after = logger.getBufferedLogs();
    expect(after.console.length).toBe(0);
    expect(after.network.length).toBe(0);
  });

  it('preserves headers and method from Request object when intercepting fetch', async () => {
    const originalFetch = global.fetch;

    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        status: 200,
        headers: new Headers(),
        body: null,
        clone: () => ({
          body: null,
          status: 200,
          headers: new Headers(),
          text: async () => 'ok',
          json: async () => ({}),
        }),
      } as unknown as Response),
    );

    global.fetch = mockFetch;

    try {
      // @ts-expect-error - accessing private property for testing
      logger.isInterceptionEnabled = false;
      logger.enable();

      const request = new Request('https://api.example.com/data', {
        headers: { Authorization: 'Bearer test-token' },
        method: 'POST',
      });

      await global.fetch(request);

      expect(mockFetch).toHaveBeenCalled();
      const [, calledInit] = mockFetch.mock.calls[0];

      expect(calledInit?.headers).toBeDefined();
      const headers = new Headers(calledInit?.headers as HeadersInit);
      expect(headers.get('Authorization')).toBe('Bearer test-token');
      expect(headers.has('x-activity-request-id')).toBe(true);
      expect(calledInit?.method).toBe('POST');
    } finally {
      global.fetch = originalFetch;
      // @ts-expect-error - reset private property
      logger.isInterceptionEnabled = false;
    }
  });

  it('replaces Request headers with init headers (Fetch spec compliance)', async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        status: 200,
        headers: new Headers(),
        body: null,
        clone: () => ({
          body: null,
          status: 200,
          headers: new Headers(),
          text: async () => 'ok',
        }),
      } as unknown as Response),
    );
    global.fetch = mockFetch;

    try {
      // @ts-expect-error - accessing private property for testing
      logger.isInterceptionEnabled = false;
      logger.enable();

      const request = new Request('https://api.example.com/data', {
        headers: { 'X-Old': 'old-value', 'X-Shared': 'old-shared' },
      });

      await global.fetch(request, {
        headers: { 'X-New': 'new-value', 'X-Shared': 'new-shared' },
      });

      const [, calledInit] = mockFetch.mock.calls[0];
      const headers = new Headers(calledInit?.headers as HeadersInit);

      expect(headers.get('X-New')).toBe('new-value');
      expect(headers.get('X-Shared')).toBe('new-shared');
      expect(headers.has('X-Old')).toBe(false);
      expect(headers.has('x-activity-request-id')).toBe(true);
    } finally {
      global.fetch = originalFetch;
      // @ts-expect-error - reset private property
      logger.isInterceptionEnabled = false;
    }
  });

  it('preserves multibyte UTF-8 characters split across Node HTTP data chunks', () => {
    const originalHttpRequest = http.request;
    const originalHttpsRequest = https.request;

    const fakeReq = Object.assign(new EventEmitter(), {
      method: 'GET',
      getHeaders: () => ({}),
      write: vi.fn(),
      end: vi.fn(),
    }) as unknown as http.ClientRequest;

    const mockHttpRequest = vi.fn(() => fakeReq);
    Object.defineProperty(http, 'request', {
      value: mockHttpRequest,
      writable: true,
      configurable: true,
    });

    try {
      // @ts-expect-error - accessing private property for testing
      logger.isInterceptionEnabled = false;
      logger.enable();

      const req = http.request('http://api.example.com/stream');
      req.end();

      const response = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: {},
      }) as unknown as http.IncomingMessage;

      req.emit('response', response);

      const euro = Buffer.from('€');
      response.emit('data', euro.subarray(0, 1));
      response.emit('data', euro.subarray(1));
      response.emit('end');

      const events = logger.getBufferedLogs().network;
      const chunkEvents = events.flatMap((event) =>
        event.chunk ? [event.chunk] : [],
      );
      const streamed = chunkEvents.map((chunk) => chunk.data).join('');
      const completed = events.find((event) => event.response)?.response?.body;

      expect(streamed).toBe('€');
      expect(completed).toBe('€');
      expect(chunkEvents).toEqual([
        expect.objectContaining({ index: 0, data: '€' }),
      ]);
    } finally {
      Object.defineProperty(http, 'request', {
        value: originalHttpRequest,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(https, 'request', {
        value: originalHttpsRequest,
        writable: true,
        configurable: true,
      });
      // @ts-expect-error - reset private property
      logger.isInterceptionEnabled = false;
    }
  });

  it('preserves 4-byte UTF-8 characters split across multiple Node HTTPS data chunks', () => {
    const originalHttpRequest = http.request;
    const originalHttpsRequest = https.request;

    const fakeReq = Object.assign(new EventEmitter(), {
      method: 'POST',
      getHeaders: () => ({}),
      write: vi.fn(),
      end: vi.fn(),
    }) as unknown as http.ClientRequest;

    const mockHttpsRequest = vi.fn(() => fakeReq);
    Object.defineProperty(https, 'request', {
      value: mockHttpsRequest,
      writable: true,
      configurable: true,
    });

    try {
      // @ts-expect-error - accessing private property for testing
      logger.isInterceptionEnabled = false;
      logger.enable();

      const req = https.request('https://api.example.com/stream');
      req.end();

      const response = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: {},
      }) as unknown as http.IncomingMessage;

      req.emit('response', response);

      const rocket = Buffer.from('🚀');
      response.emit(
        'data',
        Buffer.concat([Buffer.from('Hi '), rocket.subarray(0, 1)]),
      );
      response.emit('data', rocket.subarray(1, 3));
      response.emit(
        'data',
        Buffer.concat([rocket.subarray(3), Buffer.from('!')]),
      );
      response.emit('end');

      const events = logger.getBufferedLogs().network;
      const chunkEvents = events.flatMap((event) =>
        event.chunk ? [event.chunk] : [],
      );
      const streamed = chunkEvents.map((chunk) => chunk.data).join('');
      const completed = events.find((event) => event.response)?.response?.body;

      expect(streamed).toBe('Hi 🚀!');
      expect(completed).toBe('Hi 🚀!');
      expect(chunkEvents).toEqual([
        expect.objectContaining({ index: 0, data: 'Hi ' }),
        expect.objectContaining({ index: 1, data: '🚀!' }),
      ]);
    } finally {
      Object.defineProperty(http, 'request', {
        value: originalHttpRequest,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(https, 'request', {
        value: originalHttpsRequest,
        writable: true,
        configurable: true,
      });
      // @ts-expect-error - reset private property
      logger.isInterceptionEnabled = false;
    }
  });

  it('flushes trailing incomplete UTF-8 bytes at the end of a Node HTTP response', () => {
    const originalHttpRequest = http.request;
    const originalHttpsRequest = https.request;

    const fakeReq = Object.assign(new EventEmitter(), {
      method: 'GET',
      getHeaders: () => ({}),
      write: vi.fn(),
      end: vi.fn(),
    }) as unknown as http.ClientRequest;

    const mockHttpRequest = vi.fn(() => fakeReq);
    Object.defineProperty(http, 'request', {
      value: mockHttpRequest,
      writable: true,
      configurable: true,
    });

    try {
      // @ts-expect-error - accessing private property for testing
      logger.isInterceptionEnabled = false;
      logger.enable();

      const req = http.request('http://api.example.com/truncated');
      req.end();

      const response = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: {},
      }) as unknown as http.IncomingMessage;

      req.emit('response', response);

      const euro = Buffer.from('€');
      response.emit(
        'data',
        Buffer.concat([Buffer.from('abc'), euro.subarray(0, 1)]),
      );
      response.emit('data', euro.subarray(1, 2));
      response.emit('end');

      const events = logger.getBufferedLogs().network;
      const chunkEvents = events.flatMap((event) =>
        event.chunk ? [event.chunk] : [],
      );
      const streamed = chunkEvents.map((chunk) => chunk.data).join('');
      const completed = events.find((event) => event.response)?.response?.body;

      expect(streamed).toBe('abc\uFFFD');
      expect(completed).toBe('abc\uFFFD');
      expect(chunkEvents).toEqual([
        expect.objectContaining({ index: 0, data: 'abc' }),
        expect.objectContaining({ index: 1, data: '\uFFFD' }),
      ]);
    } finally {
      Object.defineProperty(http, 'request', {
        value: originalHttpRequest,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(https, 'request', {
        value: originalHttpsRequest,
        writable: true,
        configurable: true,
      });
      // @ts-expect-error - reset private property
      logger.isInterceptionEnabled = false;
    }
  });

  it('decompresses gzip-encoded Node HTTP response chunks before decoding UTF-8', async () => {
    const originalHttpRequest = http.request;
    const originalHttpsRequest = https.request;

    const fakeReq = Object.assign(new EventEmitter(), {
      method: 'GET',
      getHeaders: () => ({}),
      write: vi.fn(),
      end: vi.fn(),
    }) as unknown as http.ClientRequest;

    const mockHttpRequest = vi.fn(() => fakeReq);
    Object.defineProperty(http, 'request', {
      value: mockHttpRequest,
      writable: true,
      configurable: true,
    });

    try {
      // @ts-expect-error - accessing private property for testing
      logger.isInterceptionEnabled = false;
      logger.enable();

      const req = http.request('http://api.example.com/gzip-stream');
      req.end();

      const response = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: { 'content-encoding': 'gzip' },
      }) as unknown as http.IncomingMessage;

      req.emit('response', response);

      const expectedText = 'Hello € world 🚀!';
      const compressed = zlib.gzipSync(Buffer.from(expectedText, 'utf8'));

      const completedPromise = new Promise<void>((resolve) => {
        const onNetwork = (log: NetworkLog) => {
          if (log.pending === false && log.response) {
            logger.off('network', onNetwork);
            resolve();
          }
        };
        logger.on('network', onNetwork);
      });

      response.emit('data', compressed.subarray(0, 12));
      response.emit('data', compressed.subarray(12, 22));
      response.emit('data', compressed.subarray(22));
      response.emit('end');

      await completedPromise;

      const events = logger.getBufferedLogs().network;
      const chunkEvents = events.flatMap((event) =>
        event.chunk ? [event.chunk] : [],
      );
      const streamed = chunkEvents.map((chunk) => chunk.data).join('');
      const responseIndex = events.findIndex(
        (event) => event.pending === false && event.response !== undefined,
      );
      const lastChunkEventIndex = events.reduce(
        (lastIdx, event, idx) => (event.chunk ? idx : lastIdx),
        -1,
      );

      expect(streamed).toBe(expectedText);
      expect(events[responseIndex]?.response?.body).toBe(expectedText);
      expect(lastChunkEventIndex).toBeGreaterThan(0);
      expect(lastChunkEventIndex).toBeLessThan(responseIndex);
    } finally {
      Object.defineProperty(http, 'request', {
        value: originalHttpRequest,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(https, 'request', {
        value: originalHttpsRequest,
        writable: true,
        configurable: true,
      });
      // @ts-expect-error - reset private property
      logger.isInterceptionEnabled = false;
    }
  });

  it('decompresses deflate-encoded Node HTTP response chunks before decoding UTF-8', async () => {
    const originalHttpRequest = http.request;
    const originalHttpsRequest = https.request;

    const fakeReq = Object.assign(new EventEmitter(), {
      method: 'GET',
      getHeaders: () => ({}),
      write: vi.fn(),
      end: vi.fn(),
    }) as unknown as http.ClientRequest;

    const mockHttpRequest = vi.fn(() => fakeReq);
    Object.defineProperty(http, 'request', {
      value: mockHttpRequest,
      writable: true,
      configurable: true,
    });

    try {
      // @ts-expect-error - accessing private property for testing
      logger.isInterceptionEnabled = false;
      logger.enable();

      const req = http.request('http://api.example.com/deflate-stream');
      req.end();

      const response = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: { 'content-encoding': 'deflate' },
      }) as unknown as http.IncomingMessage;

      req.emit('response', response);

      const expectedText = 'Deflate € payload 🚀';
      const compressed = zlib.deflateSync(Buffer.from(expectedText, 'utf8'));

      const completedPromise = new Promise<void>((resolve) => {
        const onNetwork = (log: NetworkLog) => {
          if (log.pending === false && log.response) {
            logger.off('network', onNetwork);
            resolve();
          }
        };
        logger.on('network', onNetwork);
      });

      response.emit('data', compressed.subarray(0, 8));
      response.emit('data', compressed.subarray(8));
      response.emit('end');

      await completedPromise;

      const events = logger.getBufferedLogs().network;
      const streamed = events
        .flatMap((event) => (event.chunk ? [event.chunk.data] : []))
        .join('');
      const completed = events.find((event) => event.response)?.response?.body;

      expect(streamed).toBe(expectedText);
      expect(completed).toBe(expectedText);
    } finally {
      Object.defineProperty(http, 'request', {
        value: originalHttpRequest,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(https, 'request', {
        value: originalHttpsRequest,
        writable: true,
        configurable: true,
      });
      // @ts-expect-error - reset private property
      logger.isInterceptionEnabled = false;
    }
  });

  it('falls back to raw buffer when compressed Node HTTP response fails decompression', async () => {
    const originalHttpRequest = http.request;
    const originalHttpsRequest = https.request;

    const fakeReq = Object.assign(new EventEmitter(), {
      method: 'GET',
      getHeaders: () => ({}),
      write: vi.fn(),
      end: vi.fn(),
    }) as unknown as http.ClientRequest;

    const mockHttpRequest = vi.fn(() => fakeReq);
    Object.defineProperty(http, 'request', {
      value: mockHttpRequest,
      writable: true,
      configurable: true,
    });

    try {
      // @ts-expect-error - accessing private property for testing
      logger.isInterceptionEnabled = false;
      logger.enable();

      const req = http.request('http://api.example.com/corrupt-gzip');
      req.end();

      const response = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: { 'content-encoding': 'gzip' },
      }) as unknown as http.IncomingMessage;

      req.emit('response', response);

      const completedPromise = new Promise<void>((resolve) => {
        const onNetwork = (log: NetworkLog) => {
          if (log.pending === false && log.response) {
            logger.off('network', onNetwork);
            resolve();
          }
        };
        logger.on('network', onNetwork);
      });

      response.emit('data', Buffer.from('not-valid-gzip-data'));
      response.emit('end');

      await completedPromise;

      const events = logger.getBufferedLogs().network;
      const completed = events.find((event) => event.response)?.response?.body;
      expect(completed).toBe('not-valid-gzip-data');
    } finally {
      Object.defineProperty(http, 'request', {
        value: originalHttpRequest,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(https, 'request', {
        value: originalHttpsRequest,
        writable: true,
        configurable: true,
      });
      // @ts-expect-error - reset private property
      logger.isInterceptionEnabled = false;
    }
  });

  it('handles synchronous errors from decompressor.write and decompressor.end gracefully', async () => {
    const originalHttpRequest = http.request;
    const originalHttpsRequest = https.request;

    const fakeReq = Object.assign(new EventEmitter(), {
      method: 'GET',
      getHeaders: () => ({}),
      write: vi.fn(),
      end: vi.fn(),
    }) as unknown as http.ClientRequest;

    const mockHttpRequest = vi.fn(() => fakeReq);
    Object.defineProperty(http, 'request', {
      value: mockHttpRequest,
      writable: true,
      configurable: true,
    });

    const createGunzipSpy = vi.spyOn(zlib, 'createGunzip');

    try {
      // @ts-expect-error - accessing private property for testing
      logger.isInterceptionEnabled = false;
      logger.enable();

      // Case 1: decompressor.write throws synchronously
      const writeThrowingStream = Object.assign(new EventEmitter(), {
        destroyed: false,
        writableEnded: false,
        write: vi.fn(() => {
          throw new Error('write after end');
        }),
        end: vi.fn(),
      }) as unknown as zlib.Gunzip;
      createGunzipSpy.mockReturnValueOnce(writeThrowingStream);

      const req1 = http.request('http://api.example.com/sync-write-throw');
      req1.end();

      const res1 = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: { 'content-encoding': 'gzip' },
      }) as unknown as http.IncomingMessage;
      req1.emit('response', res1);
      res1.emit('data', Buffer.from('raw-fallback-from-write'));
      res1.emit('end');

      // Case 2: decompressor.end throws synchronously
      const endThrowingStream = Object.assign(new EventEmitter(), {
        destroyed: false,
        writableEnded: false,
        write: vi.fn(() => true),
        end: vi.fn(() => {
          throw new Error('stream already closed');
        }),
      }) as unknown as zlib.Gunzip;
      createGunzipSpy.mockReturnValueOnce(endThrowingStream);

      const req2 = http.request('http://api.example.com/sync-end-throw');
      req2.end();

      const res2 = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: { 'content-encoding': 'gzip' },
      }) as unknown as http.IncomingMessage;
      req2.emit('response', res2);
      res2.emit('data', Buffer.from('raw-fallback-from-end'));
      res2.emit('end');

      const events = logger.getBufferedLogs().network;
      const bodies = events
        .filter((event) => event.pending === false && event.response)
        .map((event) => event.response?.body);

      expect(bodies).toContain('raw-fallback-from-write');
      expect(bodies).toContain('raw-fallback-from-end');
    } finally {
      createGunzipSpy.mockRestore();
      Object.defineProperty(http, 'request', {
        value: originalHttpRequest,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(https, 'request', {
        value: originalHttpsRequest,
        writable: true,
        configurable: true,
      });
      // @ts-expect-error - reset private property
      logger.isInterceptionEnabled = false;
    }
  });
});
