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
    // Reset singleton instance if necessary or just get it
    logger = ActivityLogger.getInstance();
    // Manually reset buffers for testing
    // @ts-expect-error - accessing private member for test
    logger.networkBuffer = [];
    // @ts-expect-error - accessing private member for test
    logger.consoleBuffer = [];
  });

  it('buffers only the last 10 network requests', () => {
    for (let i = 0; i < 15; i++) {
      const log: NetworkLog = {
        id: `req-${i}`,
        timestamp: i,
        method: 'GET',
        url: 'http://example.com',
        headers: {},
      };
      // @ts-expect-error - accessing private member for test
      logger.safeEmitNetwork(log);
    }

    const logs = logger.getBufferedLogs();
    expect(logs.network.length).toBe(10);
    expect(logs.network[0].id).toBe('req-5');
    expect(logs.network[9].id).toBe('req-14');
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

  it('clears buffers after retrieval', () => {
    logger.logConsole({ content: 'test', type: 'log' });
    logger.getBufferedLogs();
    const logs = logger.getBufferedLogs();
    expect(logs.console.length).toBe(0);
  });
});
