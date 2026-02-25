/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export { NetworkProxyManager } from './networkProxyManager.js';
export { HttpProxy } from './httpProxy.js';
export { SocksProxy } from './socksProxy.js';
export { TrafficLogger } from './trafficLogger.js';
export {
  DomainPromptHandler,
  createConsoleDomainPrompt,
  sanitizeHostname,
} from './domainPromptHandler.js';
export type { DomainPromptCallback } from './domainPromptHandler.js';
export {
  matchesDomainPattern,
  checkDomain,
  checkDomainWithConfig,
  extractHostname,
  extractPort,
} from './domainMatcher.js';
export {
  DomainFilterAction,
  DEFAULT_NETWORK_PROXY_CONFIG,
} from './types.js';
export type {
  DomainRule,
  DomainCheckResult,
  ProxyConnectionRecord,
  NetworkProxyConfig,
  ProxyServerAddresses,
  ProxyStatus,
} from './types.js';
export type { TrafficSummary } from './trafficLogger.js';
