/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createServer, type Server } from 'node:http';
import { connect, type Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUrlTransport } from './mcp-client.js';

describe('MCP HTTP fetch', () => {
  const servers: Server[] = [];
  const sockets = new Set<Socket>();

  async function listen(server: Server): Promise<string> {
    servers.push(server);
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP listener');
    }
    return `http://127.0.0.1:${address.port}`;
  }

  function proxyEnvironment(noProxy = '127.0.0.1') {
    vi.stubEnv('NO_PROXY', noProxy);
    vi.stubEnv('no_proxy', noProxy);
    vi.stubEnv('HTTP_PROXY', 'http://127.0.0.1:1');
    vi.stubEnv('http_proxy', 'http://127.0.0.1:1');
    vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:1');
    vi.stubEnv('https_proxy', 'http://127.0.0.1:1');
  }

  function wrappedFetch(url: string) {
    const transport = createUrlTransport('test', { url, type: 'http' }, {});
    return (
      transport as unknown as {
        _fetch: (url: string, init?: RequestInit) => Promise<Response>;
      }
    )._fetch;
  }

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    for (const socket of sockets) socket.destroy();
    await Promise.all(
      servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve())),
        ),
    );
  });

  it.each(['application/json', 'text/event-stream'])(
    'preserves %s response headers and sends a POST exactly once',
    async (contentType) => {
      proxyEnvironment();
      const requests: Array<{
        method?: string;
        authorization?: string;
        body: string;
      }> = [];
      const url = await listen(
        createServer((req, res) => {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            requests.push({
              method: req.method,
              authorization: req.headers.authorization,
              body,
            });
            res.writeHead(200, {
              'Content-Type': contentType,
              'Mcp-Session-Id': 'test-session',
              Connection: 'close',
            });
            res.write('first chunk');
            res.end(' last chunk');
          });
        }),
      );
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      });
      const response = await wrappedFetch(url)(url, {
        method: 'POST',
        headers: new Headers({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
        body,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(contentType);
      expect(response.headers.get('mcp-session-id')).toBe('test-session');
      expect(await response.text()).toBe('first chunk last chunk');
      expect(requests).toEqual([
        { method: 'POST', authorization: 'Bearer test-token', body },
      ]);
    },
  );

  it.each(['application/json', 'text/event-stream'])(
    'allows the MCP SDK to read a %s JSON-RPC response through NO_PROXY',
    async (contentType) => {
      proxyEnvironment();
      let requests = 0;
      const message = { jsonrpc: '2.0' as const, id: 1, result: {} };
      const url = await listen(
        createServer((req, res) => {
          requests++;
          req.resume();
          req.on('end', () => {
            res.writeHead(200, {
              'Content-Type': contentType,
              Connection: 'close',
            });
            res.end(
              contentType === 'application/json'
                ? JSON.stringify(message)
                : `event: message\ndata: ${JSON.stringify(message)}\n\n`,
            );
          });
        }),
      );
      const transport = createUrlTransport('test', { url, type: 'http' }, {});
      const onmessage = vi.fn();
      transport.onmessage = onmessage;
      await transport.start();
      try {
        await transport.send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        await vi.waitFor(() => expect(onmessage).toHaveBeenCalledWith(message));
        expect(requests).toBe(1);
      } finally {
        await transport.close();
      }
    },
  );

  it('streams the response before the server finishes and propagates abort', async () => {
    proxyEnvironment();
    let requests = 0;
    const url = await listen(
      createServer((req, res) => {
        requests++;
        req.resume();
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.write('data: first\n\n');
        });
      }),
    );
    const controller = new AbortController();
    const response = await wrappedFetch(url)(url, {
      method: 'POST',
      body: '{}',
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe('data: first\n\n');
    expect(first.done).toBe(false);
    const pending = reader.read();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(requests).toBe(1);
  });

  it('cancels the underlying stream when the response reader is cancelled', async () => {
    proxyEnvironment();
    let closed = false;
    const url = await listen(
      createServer((req, res) => {
        req.resume();
        req.on('end', () => {
          res.once('close', () => {
            closed = true;
          });
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.write('data: first\n\n');
        });
      }),
    );
    const response = await wrappedFetch(url)(url, {
      method: 'POST',
      body: '{}',
    });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(closed).toBe(true));
  });

  it('continues to use the proxy for destinations not listed in NO_PROXY', async () => {
    proxyEnvironment('other.invalid');
    let requests = 0;
    const url = await listen(
      createServer((req, res) => {
        requests++;
        req.resume();
        req.on('end', () => {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            Connection: 'close',
          });
          res.end('{}');
        });
      }),
    );
    let tunnels = 0;
    const proxy = createServer();
    proxy.on('connect', (req, socket, head) => {
      tunnels++;
      const target = new URL(`http://${req.url}`);
      const upstream = connect(Number(target.port), target.hostname, () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
      sockets.add(upstream);
      upstream.once('close', () => sockets.delete(upstream));
      upstream.on('error', () => socket.destroy());
    });
    const proxyUrl = await listen(proxy);
    vi.stubEnv('HTTP_PROXY', proxyUrl);
    vi.stubEnv('http_proxy', proxyUrl);
    const response = await wrappedFetch(url)(url, {
      method: 'POST',
      body: '{}',
    });
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({});
    expect(tunnels).toBe(1);
    expect(requests).toBe(1);
  });

  it('does not replay a response that has no content-type', async () => {
    proxyEnvironment();
    let requests = 0;
    const url = await listen(
      createServer((req, res) => {
        requests++;
        req.resume();
        req.on('end', () => {
          res.writeHead(200, { Connection: 'close' });
          res.end('no content type');
        });
      }),
    );
    const response = await wrappedFetch(url)(url, {
      method: 'POST',
      body: '{}',
    });
    expect(response.headers.get('content-type')).toBeNull();
    expect(await response.text()).toBe('no content type');
    expect(requests).toBe(1);
  });

  it('uses a supplied fetch implementation even when NO_PROXY is configured', async () => {
    proxyEnvironment();
    const expected = new Response('{}', {
      headers: { 'Content-Type': 'application/json' },
    });
    const customFetch = vi.fn().mockResolvedValue(expected);
    const transport = createUrlTransport(
      'test',
      { url: 'http://test.invalid', type: 'http' },
      { fetch: customFetch },
    );
    const fetcher = (transport as unknown as { _fetch: typeof customFetch })
      ._fetch;
    const init = { method: 'POST', body: '{}' };
    expect(await fetcher('http://test.invalid', init)).toBe(expected);
    expect(customFetch).toHaveBeenCalledExactlyOnceWith(
      'http://test.invalid',
      init,
    );
  });
});
