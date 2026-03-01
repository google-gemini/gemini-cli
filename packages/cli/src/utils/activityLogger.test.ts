/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
});
