/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HttpsProxyAgent } from 'https-proxy-agent';
import { debugLogger } from './debugLogger.js';
import { URL } from 'node:url';

let memoizedAgent: HttpsProxyAgent<string> | undefined;
let agentChecked = false;

/**
 * Checks if a given URL should be proxied based on NO_PROXY/no_proxy environment variables.
 * Also strictly ignores localhost and 127.0.0.1 by default.
 */
export function shouldProxy(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();

    // Strictly ignore loopback addresses
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '0.0.0.0'
    ) {
      return false;
    }

    const noProxy = process.env.NO_PROXY || process.env.no_proxy;
    if (!noProxy) {
      return true;
    }

    if (noProxy === '*') {
      return false;
    }

    const noProxyList = noProxy.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    
    for (const rule of noProxyList) {
      if (rule.startsWith('.')) {
        if (hostname.endsWith(rule)) {
          return false;
        }
      } else if (hostname === rule || hostname.endsWith('.' + rule)) {
        return false;
      }
    }

    return true;
  } catch (error) {
    debugLogger.error(`Error parsing URL in shouldProxy: ${urlStr}`, error);
    return true; // Default to proxying if URL is weird, but usually it shouldn't be.
  }
}

/**
 * Gets an HttpsProxyAgent if a proxy is configured in the environment.
 */
export function getProxyAgent(): HttpsProxyAgent<string> | undefined {
  if (agentChecked) {
    return memoizedAgent;
  }

  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || 
                process.env.HTTP_PROXY || process.env.http_proxy;

  if (proxy) {
    try {
      debugLogger.debug(`Proxy detected: ${proxy}. Creating HttpsProxyAgent.`);
      memoizedAgent = new HttpsProxyAgent(proxy);
    } catch (error) {
      debugLogger.error(`Failed to create HttpsProxyAgent for proxy ${proxy}:`, error);
    }
  }

  agentChecked = true;
  return memoizedAgent;
}

/**
 * Configures a gaxios-compatible options object with the proxy agent if available
 * and if the URL should be proxied.
 */
export function withProxy<T extends { agent?: any; url?: string }>(options: T): T {
  if (options.url && !shouldProxy(options.url)) {
    // Force no agent (default) for loopback/no_proxy URLs
    const { agent, ...rest } = options;
    return rest as T;
  }

  const agent = getProxyAgent();
  if (agent) {
    return {
      ...options,
      agent,
    };
  }
  return options;
}
