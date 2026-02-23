/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Safely stringifies an object to JSON, handling circular references by replacing them with [Circular].
 *
 * @param obj - The object to stringify
 * @param space - Optional space parameter for formatting (defaults to no formatting)
 * @returns JSON string with circular references replaced by [Circular]
 */
import type { Config } from '../config/config.js';

export function safeJsonStringify(
  obj: unknown,
  space?: string | number,
): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return value;
    },
    space,
  );
}

/**
 * Redacts API keys and credentials from proxy URLs.
 * Removes user:password@ from URLs like http://api-key@proxy.example.com:8080
 * @param proxyUrl - The proxy URL that may contain credentials
 * @returns The proxy URL with credentials redacted, or undefined if input is undefined
 */
export function redactProxyUrl(
  proxyUrl: string | undefined,
): string | undefined {
  if (!proxyUrl) {
    return undefined;
  }

  try {
    // parse the url to get the parts we need
    const url = new URL(proxyUrl);
    // strip out any username/password that might be in there
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    // if url parsing fails for some reason, fall back to regex
    // handles weird edge cases or malformed urls, including urls without protocols
    // make protocol optional to handle cases like "user:pass@host.com"
    return proxyUrl.replace(
      /^([^:]+:\/\/)?([^@]+@)?(.+)$/,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      (_, protocol, __, rest) => (protocol || '') + rest,
    );
  }
}

/**
 * Safely stringifies an object to JSON, retaining only non-null, Boolean-valued members.
 *
 * @param obj - The object to stringify
 * @returns JSON string with circular references skipped and only non-null, Boolean member values retained.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeJsonStringifyBooleanValuesOnly(obj: any): string {
  let configSeen = false;
  // check if this is a config object - if so we need to redact the proxy url
  // before we serialize it, otherwise api keys could leak into telemetry
  if (obj && typeof obj === 'object' && 'getProxy' in obj && !configSeen) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const config = obj as Config;
    const proxy = config.getProxy();
    if (proxy) {
      // create a copy of the config but with the proxy url redacted
      // need to keep the prototype chain intact so it still works like a config
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const sanitized: any = Object.create(Object.getPrototypeOf(obj));
      // copy over all the properties from the original
      Object.assign(sanitized, obj);
      // swap out the proxy with the redacted version
      sanitized.proxy = redactProxyUrl(proxy);
      // also override getProxy() to return the safe version
      sanitized.getProxy = () => redactProxyUrl(proxy);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      obj = sanitized;
    }
  }

  return JSON.stringify(obj, (key, value) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    if ((value as Config) !== null && !configSeen) {
      configSeen = true;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return value;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    return '';
  });
}
