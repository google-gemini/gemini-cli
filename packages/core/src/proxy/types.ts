/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Network Traffic Proxy types and interfaces.
 * GSoC 2026 Idea #1: Network Traffic Proxy and Domain Filtering
 */

export enum ProxyMode {
  HTTP = 'http',
  SOCKS5 = 'socks5',
  TRANSPARENT = 'transparent',
}

export enum DomainAction {
  ALLOW = 'allow',
  DENY = 'deny',
}

export enum DefaultPolicy {
  ALLOW_ALL = 'allow-all',
  DENY_ALL = 'deny-all',
}

export interface DomainRule {
  /** Pattern to match. Supports wildcards: *.google.com, localhost:3000 */
  pattern: string;
  action: DomainAction;
  /** Optional port restriction */
  port?: number;
  /** Optional protocol restriction */
  protocol?: 'http' | 'https' | 'tcp';
}

export interface ProxyConfig {
  /** Port to listen on (default: 8877) */
  port: number;
  /** Host to bind to (default: '127.0.0.1') */
  host: string;
  /** Domain allowlist rules */
  allowlist: DomainRule[];
  /** Domain denylist rules */
  denylist: DomainRule[];
  /** Default policy when no rules match */
  defaultPolicy: DefaultPolicy;
  /** Enable traffic logging */
  enableLogging: boolean;
  /** Maximum log entries to keep in memory */
  maxLogEntries: number;
}

export interface TrafficLogEntry {
  timestamp: number;
  source: string;
  destination: string;
  port: number;
  method?: string;
  path?: string;
  statusCode?: number;
  bytesTransferred: number;
  durationMs: number;
  blocked: boolean;
  rule?: string;
}

export interface ProxyStats {
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  totalBytes: number;
  byDomain: Record<string, number>;
  byMethod: Record<string, number>;
  startTime: number;
  uptime: number;
}

export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  port: 8877,
  host: '127.0.0.1',
  allowlist: [],
  denylist: [],
  defaultPolicy: DefaultPolicy.ALLOW_ALL,
  enableLogging: false,
  maxLogEntries: 10000,
};
