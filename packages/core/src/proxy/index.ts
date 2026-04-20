/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Network Traffic Proxy and Domain Filtering.
 * GSoC 2026 Idea #1
 */

export { DomainFilter } from './domainFilter.js';
export { TrafficLogger } from './trafficLogger.js';
export type { TrafficLogFilter } from './trafficLogger.js';
export { ProxyServer } from './proxyServer.js';
export { SocksProxy } from './socksProxy.js';
export {
  ProxyMode,
  DomainAction,
  DefaultPolicy,
  DEFAULT_PROXY_CONFIG,
} from './types.js';
export type {
  DomainRule,
  ProxyConfig,
  TrafficLogEntry,
  ProxyStats,
} from './types.js';
