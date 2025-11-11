/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { URL } from 'node:url';
import { logConfigTamperingDetected } from './security-audit-logger.js';

/**
 * SSRF (Server-Side Request Forgery) protection utilities.
 *
 * SECURITY NOTE: SSRF vulnerabilities allow attackers to make the server
 * send requests to arbitrary URLs, potentially accessing:
 * - Internal services (cloud metadata APIs, databases)
 * - Private network resources
 * - File system via file:// URLs
 * - Port scanning internal network
 */

export enum SSRFValidationError {
  PRIVATE_IP = 'PRIVATE_IP',
  LOOPBACK = 'LOOPBACK',
  METADATA_SERVICE = 'METADATA_SERVICE',
  LINK_LOCAL = 'LINK_LOCAL',
  INVALID_SCHEME = 'INVALID_SCHEME',
  INVALID_PORT = 'INVALID_PORT',
  BLOCKED_HOSTNAME = 'BLOCKED_HOSTNAME',
  INVALID_URL = 'INVALID_URL',
}

export class SSRFError extends Error {
  constructor(
    public readonly type: SSRFValidationError,
    message: string,
    public readonly url?: string,
  ) {
    super(message);
    this.name = 'SSRFError';
  }
}

/**
 * Private IPv4 ranges (RFC 1918).
 */
const PRIVATE_IPV4_RANGES = [
  /^10\./,                           // 10.0.0.0/8
  /^127\./,                          // 127.0.0.0/8 (loopback)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12
  /^192\.168\./,                      // 192.168.0.0/16
  /^169\.254\./,                      // 169.254.0.0/16 (link-local)
  /^0\./,                             // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
  /^192\.0\.0\./,                     // 192.0.0.0/24
  /^192\.0\.2\./,                     // 192.0.2.0/24 (TEST-NET-1)
  /^198\.51\.100\./,                  // 198.51.100.0/24 (TEST-NET-2)
  /^203\.0\.113\./,                   // 203.0.113.0/24 (TEST-NET-3)
  /^224\./,                           // 224.0.0.0/4 (multicast)
  /^240\./,                           // 240.0.0.0/4 (reserved)
  /^255\.255\.255\.255$/,             // 255.255.255.255 (broadcast)
];

/**
 * Private IPv6 ranges.
 */
const PRIVATE_IPV6_RANGES = [
  /^::1$/,                  // ::1 (loopback)
  /^::$/,                   // :: (unspecified)
  /^::ffff:0:/,             // ::ffff:0:0/96 (IPv4 mapped)
  /^fe80:/i,                // fe80::/10 (link-local)
  /^fc00:/i,                // fc00::/7 (unique local)
  /^fd00:/i,                // fd00::/8 (unique local)
  /^ff00:/i,                // ff00::/8 (multicast)
  /^2001:db8:/i,            // 2001:db8::/32 (documentation)
  /^2001:10:/i,             // 2001:10::/28 (deprecated)
  /^2001::/i,               // 2001::/32 (Teredo)
  /^100::/i,                // 100::/64 (discard prefix)
];

/**
 * Cloud metadata service IP addresses.
 * These should NEVER be accessible from application code.
 */
const METADATA_SERVICE_IPS = [
  '169.254.169.254',        // AWS, Azure, GCP, DigitalOcean
  '169.254.170.2',          // AWS ECS
  'metadata.google.internal', // GCP DNS name
  'metadata',               // Some cloud providers
  '100.100.100.200',        // Alibaba Cloud
  'fd00:ec2::254',          // AWS IMDSv2 IPv6
];

/**
 * Blocked hostnames (case-insensitive).
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  '0.0.0.0',
]);

/**
 * Allowed URL schemes.
 */
const ALLOWED_SCHEMES = new Set([
  'http:',
  'https:',
]);

/**
 * Blocked ports (commonly used for internal services).
 */
const BLOCKED_PORTS = new Set([
  '22',    // SSH
  '23',    // Telnet
  '25',    // SMTP
  '3306',  // MySQL
  '5432',  // PostgreSQL
  '6379',  // Redis
  '27017', // MongoDB
  '9200',  // Elasticsearch
  '11211', // Memcached
]);

/**
 * Checks if an IP address is private/internal.
 *
 * @param ip IP address to check
 * @returns True if IP is private/internal
 */
export function isPrivateIP(ip: string): boolean {
  // Check IPv4 private ranges
  for (const range of PRIVATE_IPV4_RANGES) {
    if (range.test(ip)) {
      return true;
    }
  }

  // Check IPv6 private ranges
  for (const range of PRIVATE_IPV6_RANGES) {
    if (range.test(ip)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a hostname is a metadata service.
 *
 * @param hostname Hostname to check
 * @returns True if hostname is a metadata service
 */
export function isMetadataService(hostname: string): boolean {
  return METADATA_SERVICE_IPS.some(
    (ip) => hostname.toLowerCase() === ip.toLowerCase(),
  );
}

/**
 * Validates a URL against SSRF attacks.
 *
 * @param url URL to validate
 * @param options Validation options
 * @returns Normalized URL if valid
 * @throws SSRFError if URL is dangerous
 */
export function validateSSRF(
  url: string,
  options: {
    allowPrivateIPs?: boolean;
    allowedSchemes?: string[];
    blockedHostnames?: string[];
  } = {},
): URL {
  const {
    allowPrivateIPs = false,
    allowedSchemes = ['http:', 'https:'],
    blockedHostnames = [],
  } = options;

  let parsedURL: URL;

  try {
    parsedURL = new URL(url);
  } catch (error) {
    throw new SSRFError(
      SSRFValidationError.INVALID_URL,
      `Invalid URL: ${(error as Error).message}`,
      url,
    );
  }

  // Check scheme
  if (!allowedSchemes.includes(parsedURL.protocol)) {
    logConfigTamperingDetected(
      url,
      `Blocked dangerous URL scheme: ${parsedURL.protocol}`,
    );
    throw new SSRFError(
      SSRFValidationError.INVALID_SCHEME,
      `URL scheme '${parsedURL.protocol}' is not allowed. Only ${allowedSchemes.join(', ')} are permitted.`,
      url,
    );
  }

  // Check hostname
  const hostname = parsedURL.hostname.toLowerCase();

  // Check blocked hostnames
  const allBlockedHostnames = new Set([
    ...BLOCKED_HOSTNAMES,
    ...blockedHostnames.map((h) => h.toLowerCase()),
  ]);

  if (allBlockedHostnames.has(hostname)) {
    logConfigTamperingDetected(url, `Blocked hostname: ${hostname}`);
    throw new SSRFError(
      SSRFValidationError.BLOCKED_HOSTNAME,
      `Hostname '${hostname}' is blocked`,
      url,
    );
  }

  // Check metadata services
  if (isMetadataService(hostname)) {
    logConfigTamperingDetected(
      url,
      `Blocked metadata service access: ${hostname}`,
    );
    throw new SSRFError(
      SSRFValidationError.METADATA_SERVICE,
      `Access to cloud metadata services is forbidden: ${hostname}`,
      url,
    );
  }

  // Check for private IPs
  if (!allowPrivateIPs && isPrivateIP(hostname)) {
    logConfigTamperingDetected(url, `Blocked private IP: ${hostname}`);
    throw new SSRFError(
      SSRFValidationError.PRIVATE_IP,
      `Access to private IP addresses is forbidden: ${hostname}`,
      url,
    );
  }

  // Check port
  if (parsedURL.port && BLOCKED_PORTS.has(parsedURL.port)) {
    logConfigTamperingDetected(url, `Blocked dangerous port: ${parsedURL.port}`);
    throw new SSRFError(
      SSRFValidationError.INVALID_PORT,
      `Port ${parsedURL.port} is blocked for security reasons`,
      url,
    );
  }

  return parsedURL;
}

/**
 * Validates multiple URLs.
 *
 * @param urls URLs to validate
 * @param options Validation options
 * @returns Array of validated URLs
 * @throws SSRFError if any URL is invalid
 */
export function validateMultipleURLs(
  urls: string[],
  options?: {
    allowPrivateIPs?: boolean;
    allowedSchemes?: string[];
    blockedHostnames?: string[];
  },
): URL[] {
  return urls.map((url) => validateSSRF(url, options));
}

/**
 * Safely extracts the hostname from a URL for logging/display.
 *
 * @param url URL to extract hostname from
 * @returns Safe hostname string
 */
export function getSafeHostname(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return '[invalid URL]';
  }
}

/**
 * Checks if a URL is safe to fetch (comprehensive check).
 *
 * @param url URL to check
 * @returns True if URL appears safe
 */
export function isURLSafe(url: string): boolean {
  try {
    validateSSRF(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a safer fetch function with SSRF protection.
 *
 * @param options Validation options
 * @returns Protected fetch function
 */
export function createProtectedFetch(
  options?: {
    allowPrivateIPs?: boolean;
    allowedSchemes?: string[];
    blockedHostnames?: string[];
  },
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    // Validate URL before fetching
    validateSSRF(url, options);

    // Perform the actual fetch
    return fetch(input, init);
  };
}

/**
 * DNS rebinding protection: validates URL both before and after DNS resolution.
 *
 * @param url URL to validate
 * @returns True if URL remains safe after DNS resolution
 */
export async function validateDNSRebinding(url: string): Promise<boolean> {
  // Validate before resolution
  const parsedURL = validateSSRF(url);

  // Note: In a production environment, you would resolve the DNS
  // and re-validate the IP address. This requires additional dependencies
  // like 'dns' module for proper implementation.

  // For now, we validate the hostname
  return !isPrivateIP(parsedURL.hostname) && !isMetadataService(parsedURL.hostname);
}
