/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Filtering action to apply when a domain is matched against a rule.
 */
export enum DomainFilterAction {
  ALLOW = 'allow',
  DENY = 'deny',
  PROMPT = 'prompt',
}

/**
 * A single domain filtering rule, supporting exact and wildcard patterns.
 *
 * Examples:
 *   - "example.com" -> matches exactly example.com
 *   - "*.example.com" -> matches any subdomain of example.com
 *   - "*" -> matches everything
 */
export interface DomainRule {
  /** Supports wildcard prefix: *.example.com */
  pattern: string;
  action: DomainFilterAction;
}

/**
 * Result of checking a domain against the filtering rules.
 */
export interface DomainCheckResult {
  domain: string;
  action: DomainFilterAction;
  matchedRule?: DomainRule;
}

/**
 * Represents a single recorded connection through the proxy.
 */
export interface ProxyConnectionRecord {
  /** ISO timestamp. */
  timestamp: string;
  protocol: 'http' | 'https' | 'tcp';
  host: string;
  port: number;
  action: DomainFilterAction;
  method?: string;
  /** Full URL (HTTP only; HTTPS shows CONNECT target). */
  url?: string;
}

/**
 * Configuration for the network proxy system.
 */
export interface NetworkProxyConfig {
  enabled: boolean;

  /** 0 = auto-assign. */
  httpPort: number;

  /** 0 = auto-assign. */
  socksPort: number;

  /** Default action when no rule matches a domain. */
  defaultAction: DomainFilterAction;

  /** Ordered list of domain filtering rules. First match wins. */
  rules: DomainRule[];

  enableLogging: boolean;
  maxLogEntries: number;
  promptForUnknownDomains: boolean;
}

/**
 * Addresses the proxy servers are actually listening on after startup.
 */
export interface ProxyServerAddresses {
  httpProxy?: string;
  socksProxy?: string;
}

/**
 * Status of the proxy system.
 */
export interface ProxyStatus {
  running: boolean;
  addresses: ProxyServerAddresses;
  connectionCount: number;
  deniedCount: number;
}

/**
 * Default configuration values for the network proxy.
 */
export const DEFAULT_NETWORK_PROXY_CONFIG: NetworkProxyConfig = {
  enabled: false,
  httpPort: 0,
  socksPort: 0,
  defaultAction: DomainFilterAction.PROMPT,
  rules: [],
  enableLogging: false,
  maxLogEntries: 1000,
  promptForUnknownDomains: true,
};
