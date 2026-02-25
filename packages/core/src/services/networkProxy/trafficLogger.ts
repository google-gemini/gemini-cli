/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProxyConnectionRecord } from './types.js';

/**
 * In-memory traffic logger for proxy connections.
 *
 * Keeps a bounded list of connection records for auditing.
 * Logging is opt-in and controlled by user settings. No data is
 * persisted to disk or sent externally — records live only in memory
 * for the duration of the session.
 */
export class TrafficLogger {
  private records: ProxyConnectionRecord[] = [];
  private readonly maxEntries: number;
  private enabled: boolean;

  constructor(maxEntries: number = 1000, enabled: boolean = false) {
    this.maxEntries = maxEntries;
    this.enabled = enabled;
  }

  /**
   * Records a proxy connection event. No-ops if logging is disabled.
   */
  log(record: ProxyConnectionRecord): void {
    if (!this.enabled) {
      return;
    }

    this.records.push(record);

    // Trim if over capacity (drop oldest entries)
    if (this.records.length > this.maxEntries) {
      const overflow = this.records.length - this.maxEntries;
      this.records.splice(0, overflow);
    }
  }

  /**
   * Returns all recorded connection logs.
   */
  getRecords(): readonly ProxyConnectionRecord[] {
    return this.records;
  }

  /**
   * Returns the most recent N records.
   */
  getRecentRecords(count: number): readonly ProxyConnectionRecord[] {
    if (count >= this.records.length) {
      return this.records;
    }
    return this.records.slice(-count);
  }

  /**
   * Returns records filtered by hostname.
   */
  getRecordsByHost(hostname: string): readonly ProxyConnectionRecord[] {
    const normalized = hostname.toLowerCase();
    return this.records.filter((r) => r.host.toLowerCase() === normalized);
  }

  /**
   * Returns records filtered by action (allow/deny).
   */
  getRecordsByAction(
    action: ProxyConnectionRecord['action'],
  ): readonly ProxyConnectionRecord[] {
    return this.records.filter((r) => r.action === action);
  }

  /**
   * Returns summary statistics about the logged traffic.
   */
  getSummary(): TrafficSummary {
    const hostCounts = new Map<string, number>();
    let allowedCount = 0;
    let deniedCount = 0;

    for (const record of this.records) {
      const host = record.host.toLowerCase();
      hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);

      if (record.action === 'allow') {
        allowedCount++;
      } else if (record.action === 'deny') {
        deniedCount++;
      }
    }

    // Sort hosts by frequency, descending
    const topHosts = [...hostCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([host, count]) => ({ host, count }));

    return {
      totalConnections: this.records.length,
      allowedConnections: allowedCount,
      deniedConnections: deniedCount,
      uniqueHosts: hostCounts.size,
      topHosts,
    };
  }

  /**
   * Clears all logged records.
   */
  clear(): void {
    this.records = [];
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getEntryCount(): number {
    return this.records.length;
  }
}

export interface TrafficSummary {
  totalConnections: number;
  allowedConnections: number;
  deniedConnections: number;
  uniqueHosts: number;
  topHosts: Array<{ host: string; count: number }>;
}
