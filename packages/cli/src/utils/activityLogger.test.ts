/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActivityLogger, type NetworkLog } from './activityLogger.js';
import type { ConsoleLogPayload } from '@google/gemini-cli-core';

describe('ActivityLogger', () => {
  let logger: ActivityLogger;

  beforeEach(() => {
    logger = ActivityLogger.getInstance();
    logger.removeAllListeners();
  });

  it('emits network events with sanitized headers', () => {
    const events: unknown[] = [];
    logger.on('network', (payload) => events.push(payload));

    const log: NetworkLog = {
      id: 'req-1',
      timestamp: 1,
      method: 'GET',
      url: 'http://example.com',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer secret',
        'x-goog-api-key': 'my-api-key',
      },
      pending: true,
    };
    logger.emitNetworkEvent(log);

    expect(events.length).toBe(1);
    const emitted = events[0] as NetworkLog;
    expect(emitted.headers['content-type']).toBe('application/json');
    expect(emitted.headers['authorization']).toBe('[REDACTED]');
    expect(emitted.headers['x-goog-api-key']).toBe('[REDACTED]');
  });

  it('emits network events with sanitized response headers', () => {
    const events: unknown[] = [];
    logger.on('network', (payload) => events.push(payload));

    logger.emitNetworkEvent({
      id: 'req-2',
      pending: false,
      response: {
        status: 200,
        headers: {
          'content-type': 'text/html',
          'set-cookie': 'session=abc123',
        },
        body: 'ok',
        durationMs: 10,
      },
    });

    expect(events.length).toBe(1);
    const emitted = events[0] as NetworkLog;
    expect(emitted.response?.headers['content-type']).toBe('text/html');
    expect(emitted.response?.headers['set-cookie']).toBe('[REDACTED]');
  });

  it('emits console events with timestamp', () => {
    const events: unknown[] = [];
    logger.on('console', (payload) => events.push(payload));

    const now = Date.now();
    vi.setSystemTime(now);

    const log: ConsoleLogPayload = { content: 'hello', type: 'log' };
    logger.logConsole(log);

    expect(events.length).toBe(1);
    const emitted = events[0] as ConsoleLogPayload & { timestamp: number };
    expect(emitted.content).toBe('hello');
    expect(emitted.type).toBe('log');
    expect(emitted.timestamp).toBe(now);

    vi.useRealTimers();
  });

  it('emits multiple network events for the same request id', () => {
    const events: unknown[] = [];
    logger.on('network', (payload) => events.push(payload));

    logger.emitNetworkEvent({
      id: 'chunked',
      timestamp: 1,
      method: 'POST',
      url: 'http://example.com',
      headers: {},
      pending: true,
    });
    for (let i = 0; i < 3; i++) {
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

    // 1 initial + 3 chunks + 1 response = 5 events
    expect(events.length).toBe(5);
    expect(events.every((e) => (e as NetworkLog).id === 'chunked')).toBe(true);
  });

  it('emits console events without buffering', () => {
    const events: unknown[] = [];
    logger.on('console', (payload) => events.push(payload));

    for (let i = 0; i < 15; i++) {
      logger.logConsole({ content: `log-${i}`, type: 'log' });
    }

    // All 15 events should be emitted (no buffer eviction)
    expect(events.length).toBe(15);
  });
});
