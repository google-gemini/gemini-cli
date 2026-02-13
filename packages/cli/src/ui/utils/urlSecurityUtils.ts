/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Result of a homograph detection check.
 */
export interface HomographResult {
  /** The original URL string as provided. */
  original: string;
  /** The URL with the hostname converted to Punycode. */
  punycode: string;
  /** The extracted hostname in Punycode. */
  punycodeHost: string;
}

/**
 * Detects if a URL hostname contains non-ASCII characters or is already in Punycode.
 * Returns information about the detected homograph, or null if the URL is ASCII-safe.
 *
 * @param urlString The URL string to check.
 * @returns A HomographResult if a potential homograph is detected, otherwise null.
 */
export function detectHomograph(urlString: string): HomographResult | null {
  try {
    // Basic heuristic: if it doesn't look like a URL with a scheme, skip.
    if (!urlString.includes('://')) {
      return null;
    }

    const url = new URL(urlString);

    // Node.js WHATWG URL implementation automatically converts non-ASCII hostnames to Punycode.
    // We check if the hostname property starts with 'xn--' or contains non-ASCII characters.
    const hostname = url.hostname;
    const isPunycode = hostname.toLowerCase().includes('xn--');

    // Also check if any characters in the hostname are non-ASCII (just in case the environment
    // doesn't punycode them immediately, though Node.js does).
    // eslint-disable-next-line no-control-regex
    const hasNonAscii = /[^\x00-\x7F]/.test(hostname);

    if (isPunycode || hasNonAscii) {
      return {
        original: urlString,
        punycode: url.href,
        punycodeHost: hostname,
      };
    }

    return null;
  } catch {
    // If URL parsing fails, it's not a valid URL we can safely analyze for homographs.
    return null;
  }
}
