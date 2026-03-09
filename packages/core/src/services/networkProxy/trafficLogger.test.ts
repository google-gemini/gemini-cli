/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TrafficLogger } from './trafficLogger.js';
import type { ProxyConnectionRecord } from './types.js';
import { DomainFilterAction } from './types.js';

function makeRecord(
  host: string,
  action: DomainFilterAction = DomainFilterAction.ALLOW,
  protocol: ProxyConnectionRecord['protocol'] = 'https',
): ProxyConnectionRecord {
  return {
    timestamp: new Date().toISOString(),
    protocol,
    host,
    port: 443,
    action,
  };
}

describe('TrafficLogger', () => {
  let logger: TrafficLogger;

  beforeEach(() => {
    logger = new TrafficLogger(100, true);
  });

  it('logs and retrieves records', () => {
    logger.log(makeRecord('example.com'));
    logger.log(makeRecord('google.com'));

    expect(logger.getEntryCount()).toBe(2);
    expect(logger.getRecords()).toHaveLength(2);
  });

  it('does not log when disabled', () => {
    logger.setEnabled(false);
    logger.log(makeRecord('example.com'));
    expect(logger.getEntryCount()).toBe(0);
  });

  it('trims oldest entries when over capacity', () => {
    const small = new TrafficLogger(3, true);
    small.log(makeRecord('a.com'));
    small.log(makeRecord('b.com'));
    small.log(makeRecord('c.com'));
    small.log(makeRecord('d.com'));

    expect(small.getEntryCount()).toBe(3);
    expect(small.getRecords()[0].host).toBe('b.com');
  });

  it('getRecentRecords returns last N records', () => {
    logger.log(makeRecord('a.com'));
    logger.log(makeRecord('b.com'));
    logger.log(makeRecord('c.com'));

    const recent = logger.getRecentRecords(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].host).toBe('b.com');
    expect(recent[1].host).toBe('c.com');
  });

  it('getRecordsByHost filters by hostname', () => {
    logger.log(makeRecord('example.com'));
    logger.log(makeRecord('google.com'));
    logger.log(makeRecord('example.com'));

    const filtered = logger.getRecordsByHost('example.com');
    expect(filtered).toHaveLength(2);
  });

  it('getRecordsByAction filters by action', () => {
    logger.log(makeRecord('a.com', DomainFilterAction.ALLOW));
    logger.log(makeRecord('b.com', DomainFilterAction.DENY));
    logger.log(makeRecord('c.com', DomainFilterAction.ALLOW));

    expect(logger.getRecordsByAction(DomainFilterAction.ALLOW)).toHaveLength(2);
    expect(logger.getRecordsByAction(DomainFilterAction.DENY)).toHaveLength(1);
  });

  it('getSummary returns correct statistics', () => {
    logger.log(makeRecord('example.com', DomainFilterAction.ALLOW));
    logger.log(makeRecord('example.com', DomainFilterAction.ALLOW));
    logger.log(makeRecord('google.com', DomainFilterAction.DENY));
    logger.log(makeRecord('evil.com', DomainFilterAction.DENY));

    const summary = logger.getSummary();
    expect(summary.totalConnections).toBe(4);
    expect(summary.allowedConnections).toBe(2);
    expect(summary.deniedConnections).toBe(2);
    expect(summary.uniqueHosts).toBe(3);
    expect(summary.topHosts[0].host).toBe('example.com');
    expect(summary.topHosts[0].count).toBe(2);
  });

  it('clear removes all records', () => {
    logger.log(makeRecord('a.com'));
    logger.log(makeRecord('b.com'));
    logger.clear();
    expect(logger.getEntryCount()).toBe(0);
  });
});
