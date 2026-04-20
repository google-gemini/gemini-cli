/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Traffic logging for security auditing.
 */

import type { TrafficLogEntry, ProxyStats } from './types.js';

export interface TrafficLogFilter {
  domain?: string;
  blocked?: boolean;
  since?: number;
  method?: string;
}

export class TrafficLogger {
  private entries: TrafficLogEntry[] = [];
  private maxEntries: number;
  private _totalRequests = 0;
  private _blockedRequests = 0;
  private _totalBytes = 0;
  private readonly _startTime = Date.now();
  private readonly byDomain: Map<string, number> = new Map();
  private readonly byMethod: Map<string, number> = new Map();

  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
  }

  log(entry: TrafficLogEntry): void {
    this._totalRequests++;
    if (entry.blocked) {
      this._blockedRequests++;
    }
    this._totalBytes += entry.bytesTransferred;

    // Track by domain
    const domainCount = this.byDomain.get(entry.destination) ?? 0;
    this.byDomain.set(entry.destination, domainCount + 1);

    // Track by method
    if (entry.method) {
      const methodCount = this.byMethod.get(entry.method) ?? 0;
      this.byMethod.set(entry.method, methodCount + 1);
    }

    this.entries.push(entry);

    // Evict oldest entries if over limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  getEntries(filter?: TrafficLogFilter): TrafficLogEntry[] {
    if (!filter) {
      return [...this.entries];
    }

    return this.entries.filter((entry) => {
      if (filter.domain && entry.destination !== filter.domain) return false;
      if (filter.blocked !== undefined && entry.blocked !== filter.blocked)
        return false;
      if (filter.since && entry.timestamp < filter.since) return false;
      if (filter.method && entry.method !== filter.method) return false;
      return true;
    });
  }

  getStats(): ProxyStats {
    return {
      totalRequests: this._totalRequests,
      blockedRequests: this._blockedRequests,
      allowedRequests: this._totalRequests - this._blockedRequests,
      totalBytes: this._totalBytes,
      byDomain: Object.fromEntries(this.byDomain),
      byMethod: Object.fromEntries(this.byMethod),
      startTime: this._startTime,
      uptime: Date.now() - this._startTime,
    };
  }

  exportJSON(): string {
    return JSON.stringify(
      {
        stats: this.getStats(),
        entries: this.entries,
      },
      null,
      2,
    );
  }

  clear(): void {
    this.entries = [];
    this._totalRequests = 0;
    this._blockedRequests = 0;
    this._totalBytes = 0;
    this.byDomain.clear();
    this.byMethod.clear();
  }

  get size(): number {
    return this.entries.length;
  }
}
