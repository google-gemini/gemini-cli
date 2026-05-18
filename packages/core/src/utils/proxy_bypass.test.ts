/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EnvHttpProxyAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
} from 'undici';
import {
  setGlobalProxy,
  fetchWithTimeout,
  createSafeProxyAgent,
} from './fetch.js';

describe('Proxy Bypass Integration', () => {
  const originalDispatcher = getGlobalDispatcher();

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
    vi.unstubAllEnvs();
  });

  it('should bypass proxy for localhost when NO_PROXY is set', async () => {
    // We use a dummy proxy that will fail if any request is sent to it.
    const dummyProxy = 'http://1.2.3.4:5678';

    // Set a dummy proxy and NO_PROXY for localhost
    vi.stubEnv('NO_PROXY', 'localhost');

    // This will set the global dispatcher to a new EnvHttpProxyAgent
    setGlobalProxy(dummyProxy);

    // We expect fetch to localhost to bypass the proxy.
    // Since we don't have a real localhost server running in this unit test,
    // we can't easily do a REAL fetch, but we can verify the dispatcher's behavior.

    const dispatcher = getGlobalDispatcher();
    expect(dispatcher).toBeInstanceOf(EnvHttpProxyAgent);

    // To do a real integration test, we would need a local server.
    // Let's start a small http server.

    const http = await import('node:http');
    const server = http.createServer((req, res) => {
      res.end('ok');
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Server address not found');
    }
    const port = address.port;
    const url = `http://127.0.0.1:${port}`;

    try {
      // We need NO_PROXY to include 127.0.0.1 (or use localhost and fetch localhost)
      vi.stubEnv('NO_PROXY', `127.0.0.1,localhost`);
      setGlobalProxy(dummyProxy);

      // If bypass works, this succeeds. If it tries to use the dummy proxy, it fails/times out.
      const response = await fetchWithTimeout(url, 1000);
      expect(await response.text()).toBe('ok');
    } finally {
      server.close();
    }
  });

  it('should USE proxy for other domains when NO_PROXY is set to localhost', async () => {
    const dummyProxy = 'http://1.2.3.4:5678';
    vi.stubEnv('NO_PROXY', 'localhost');
    setGlobalProxy(dummyProxy);

    // Fetching a public domain should try to use the proxy and fail (since the proxy is dummy).
    // We expect it to time out or fail with a connection error.
    await expect(fetchWithTimeout('http://example.com', 500)).rejects.toThrow();
  });

  it('createSafeProxyAgent should return a proxy agent that respects NO_PROXY', () => {
    const proxyUrl = 'http://proxy.example.com';
    const noProxyValue = 'localhost,127.0.0.1';
    vi.stubEnv('NO_PROXY', noProxyValue);

    const agent = createSafeProxyAgent(proxyUrl);
    expect(agent).toBeInstanceOf(EnvHttpProxyAgent);
    // Since we can't easily inspect internal state, this is mostly a type and presence check.
  });
});
