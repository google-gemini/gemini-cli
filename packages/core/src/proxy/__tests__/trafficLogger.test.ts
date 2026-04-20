/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrafficLogger } from '../trafficLogger.js';
import type { TrafficLogEntry } from '../types.js';

function createEntry(
  overrides: Partial<TrafficLogEntry> = {},
): TrafficLogEntry {
  return {
    timestamp: Date.now(),
    source: 'proxy',
    destination: 'example.com',
    port: 443,
    method: 'GET',
    path: '/',
    statusCode: 200,
    bytesTransferred: 1024,
    durationMs: 50,
    blocked: false,
    ...overrides,
  };
}

describe('TrafficLogger', () => {
  let logger: TrafficLogger;

  beforeEach(() => {
    logger = new TrafficLogger(100);
  });

  it('should log entries', () => {
    logger.log(createEntry());
    expect(logger.getEntries()).toHaveLength(1);
  });

  it('should track stats', () => {
    logger.log(createEntry({ bytesTransferred: 500 }));
    logger.log(createEntry({ bytesTransferred: 300, blocked: true }));
    logger.log(createEntry({ bytesTransferred: 200 }));

    const stats = logger.getStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.blockedRequests).toBe(1);
    expect(stats.allowedRequests).toBe(2);
    expect(stats.totalBytes).toBe(1000);
  });

  it('should track by domain', () => {
    logger.log(createEntry({ destination: 'google.com' }));
    logger.log(createEntry({ destination: 'google.com' }));
    logger.log(createEntry({ destination: 'github.com' }));

    const stats = logger.getStats();
    expect(stats.byDomain['google.com']).toBe(2);
    expect(stats.byDomain['github.com']).toBe(1);
  });

  it('should track by method', () => {
    logger.log(createEntry({ method: 'GET' }));
    logger.log(createEntry({ method: 'POST' }));
    logger.log(createEntry({ method: 'GET' }));

    const stats = logger.getStats();
    expect(stats.byMethod['GET']).toBe(2);
    expect(stats.byMethod['POST']).toBe(1);
  });

  it('should filter entries by domain', () => {
    logger.log(createEntry({ destination: 'google.com' }));
    logger.log(createEntry({ destination: 'github.com' }));

    const filtered = logger.getEntries({ domain: 'google.com' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.destination).toBe('google.com');
  });

  it('should filter entries by blocked status', () => {
    logger.log(createEntry({ blocked: false }));
    logger.log(createEntry({ blocked: true }));

    expect(logger.getEntries({ blocked: true })).toHaveLength(1);
    expect(logger.getEntries({ blocked: false })).toHaveLength(1);
  });

  it('should evict old entries when over limit', () => {
    const smallLogger = new TrafficLogger(3);
    for (let i = 0; i < 5; i++) {
      smallLogger.log(createEntry({ destination: `domain${i}.com` }));
    }
    expect(smallLogger.getEntries()).toHaveLength(3);
    expect(smallLogger.getEntries()[0]?.destination).toBe('domain2.com');
  });

  it('should export JSON', () => {
    logger.log(createEntry());
    const json = logger.exportJSON();
    const parsed = JSON.parse(json);
    expect(parsed.stats).toBeDefined();
    expect(parsed.entries).toHaveLength(1);
  });

  it('should clear all data', () => {
    logger.log(createEntry());
    logger.clear();
    expect(logger.getEntries()).toHaveLength(0);
    expect(logger.getStats().totalRequests).toBe(0);
  });

  it('should report size correctly', () => {
    expect(logger.size).toBe(0);
    logger.log(createEntry());
    logger.log(createEntry());
    expect(logger.size).toBe(2);
    logger.clear();
    expect(logger.size).toBe(0);
  });

  it('should filter entries by method', () => {
    logger.log(createEntry({ method: 'GET' }));
    logger.log(createEntry({ method: 'POST' }));
    logger.log(createEntry({ method: 'GET' }));

    const filtered = logger.getEntries({ method: 'POST' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.method).toBe('POST');
  });

  it('should filter entries by timestamp', () => {
    const now = Date.now();
    logger.log(createEntry({ timestamp: now - 1000 }));
    logger.log(createEntry({ timestamp: now }));
    logger.log(createEntry({ timestamp: now + 1000 }));

    const filtered = logger.getEntries({ since: now });
    expect(filtered).toHaveLength(2);
  });

  it('should return all entries when no filter provided', () => {
    logger.log(createEntry());
    logger.log(createEntry());
    expect(logger.getEntries()).toHaveLength(2);
  });

  it('should track uptime', () => {
    const stats = logger.getStats();
    expect(stats.startTime).toBeGreaterThan(0);
    expect(stats.uptime).toBeGreaterThanOrEqual(0);
  });
});
