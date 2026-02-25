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
  /** The domain pattern to match against. Supports wildcard prefix: *.example.com */
  pattern: string;
  /** Action to take when this rule matches. */
  action: DomainFilterAction;
}

/**
 * Result of checking a domain against the filtering rules.
 */
export interface DomainCheckResult {
  /** The domain that was checked. */
  domain: string;
  /** Resolved action after evaluating rules. */
  action: DomainFilterAction;
  /** The rule that matched, if any. */
  matchedRule?: DomainRule;
}

/**
 * Represents a single recorded connection through the proxy.
 */
export interface ProxyConnectionRecord {
  /** Timestamp of the connection in ISO format. */
  timestamp: string;
  /** Protocol used: 'http', 'https', or 'tcp'. */
  protocol: 'http' | 'https' | 'tcp';
  /** Target hostname or IP. */
  host: string;
  /** Target port. */
  port: number;
  /** Action that was taken (allow/deny). */
  action: DomainFilterAction;
  /** HTTP method if applicable. */
  method?: string;
  /** Full URL if applicable (HTTP only, HTTPS only shows CONNECT target). */
  url?: string;
}

/**
 * Configuration for the network proxy system.
 */
export interface NetworkProxyConfig {
  /** Whether the network proxy feature is enabled. */
  enabled: boolean;

  /** Port for the HTTP/HTTPS proxy to listen on. 0 = auto-assign. */
  httpPort: number;

  /** Port for the SOCKS5 proxy to listen on. 0 = auto-assign. */
  socksPort: number;

  /** Default action when no rule matches a domain. */
  defaultAction: DomainFilterAction;

  /** Ordered list of domain filtering rules. First match wins. */
  rules: DomainRule[];

  /** Whether to log traffic for auditing. Opt-in for privacy. */
  enableLogging: boolean;

  /** Maximum number of traffic log entries to keep in memory. */
  maxLogEntries: number;

  /** Whether to prompt the user for new/unknown domains. */
  promptForUnknownDomains: boolean;
}

/**
 * Addresses the proxy servers are actually listening on after startup.
 */
export interface ProxyServerAddresses {
  /** Bound HTTP proxy address in host:port format. */
  httpProxy?: string;
  /** Bound SOCKS5 proxy address in host:port format. */
  socksProxy?: string;
}

/**
 * Status of the proxy system.
 */
export interface ProxyStatus {
  /** Whether the proxy is currently running. */
  running: boolean;
  /** Addresses the proxy is listening on. */
  addresses: ProxyServerAddresses;
  /** Number of connections processed. */
  connectionCount: number;
  /** Number of connections denied. */
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
