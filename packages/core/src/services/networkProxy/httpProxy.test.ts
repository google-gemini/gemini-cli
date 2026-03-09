/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import type * as net from 'node:net';
import { HttpProxy } from './httpProxy.js';
import { DomainFilterAction } from './types.js';
import type { ProxyConnectionRecord } from './types.js';

function httpGet(
  proxyPort: number,
  targetUrl: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: proxyPort,
        path: targetUrl,
        method: 'GET',
        headers: { Host: parsed.host },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function httpConnect(
  proxyPort: number,
  target: string,
): Promise<{ statusCode: number; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: proxyPort,
      method: 'CONNECT',
      path: target,
    });
    req.on('connect', (res, socket) => {
      resolve({ statusCode: res.statusCode ?? 0, socket });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('HttpProxy', () => {
  let proxy: HttpProxy;
  let echoServer: http.Server;
  let echoPort: number;

  afterEach(async () => {
    if (proxy) {
      await proxy.stop();
    }
    if (echoServer) {
      await new Promise<void>((resolve) => {
        echoServer.close(() => resolve());
        echoServer.closeAllConnections();
      });
    }
  });

  async function startEchoServer(): Promise<number> {
    return new Promise((resolve) => {
      echoServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`echo: ${req.url}`);
      });
      echoServer.listen(0, '127.0.0.1', () => {
        const addr = echoServer.address();
        if (addr && typeof addr === 'object') {
          echoPort = addr.port;
          resolve(echoPort);
        }
      });
    });
  }

  it('starts and stops without errors', async () => {
    proxy = new HttpProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });

    const port = await proxy.start();
    expect(port).toBeGreaterThan(0);
    expect(proxy.getPort()).toBe(port);

    await proxy.stop();
    expect(proxy.getPort()).toBe(port); // port number is retained
  });

  it('allows connections when default action is allow', async () => {
    await startEchoServer();

    proxy = new HttpProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    const result = await httpGet(
      proxyPort,
      `http://127.0.0.1:${echoPort}/hello`,
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain('echo: /hello');
    expect(proxy.getConnectionCount()).toBe(1);
    expect(proxy.getDeniedCount()).toBe(0);
  });

  it('denies connections when default action is deny', async () => {
    proxy = new HttpProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.DENY,
    });
    const proxyPort = await proxy.start();

    const result = await httpGet(
      proxyPort,
      'http://example.com/test',
    );

    expect(result.statusCode).toBe(403);
    expect(result.body).toContain('Blocked by network proxy policy');
    expect(proxy.getDeniedCount()).toBe(1);
  });

  it('allows domains matching allow rules even when default is deny', async () => {
    await startEchoServer();

    proxy = new HttpProxy({
      port: 0,
      rules: [{ pattern: '127.0.0.1', action: DomainFilterAction.ALLOW }],
      defaultAction: DomainFilterAction.DENY,
    });
    const proxyPort = await proxy.start();

    const result = await httpGet(
      proxyPort,
      `http://127.0.0.1:${echoPort}/allowed`,
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain('echo: /allowed');
  });

  it('blocks domains matching deny rules even when default is allow', async () => {
    proxy = new HttpProxy({
      port: 0,
      rules: [{ pattern: 'blocked.example.com', action: DomainFilterAction.DENY }],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    const result = await httpGet(
      proxyPort,
      'http://blocked.example.com/test',
    );

    expect(result.statusCode).toBe(403);
    expect(proxy.getDeniedCount()).toBe(1);
  });

  it('emits connection events on allowed requests', async () => {
    await startEchoServer();

    proxy = new HttpProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    const records: ProxyConnectionRecord[] = [];
    proxy.on('connection', (record: ProxyConnectionRecord) => {
      records.push(record);
    });

    await httpGet(proxyPort, `http://127.0.0.1:${echoPort}/test`);

    expect(records).toHaveLength(1);
    expect(records[0].host).toBe('127.0.0.1');
    expect(records[0].action).toBe(DomainFilterAction.ALLOW);
    expect(records[0].protocol).toBe('http');
  });

  it('emits denied events on blocked requests', async () => {
    proxy = new HttpProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.DENY,
    });
    const proxyPort = await proxy.start();

    const deniedRecords: ProxyConnectionRecord[] = [];
    proxy.on('denied', (record: ProxyConnectionRecord) => {
      deniedRecords.push(record);
    });

    await httpGet(proxyPort, 'http://example.com/test');

    expect(deniedRecords).toHaveLength(1);
    expect(deniedRecords[0].action).toBe(DomainFilterAction.DENY);
  });

  it('denies CONNECT requests when domain is blocked', async () => {
    proxy = new HttpProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.DENY,
    });
    const proxyPort = await proxy.start();

    const result = await httpConnect(proxyPort, 'blocked.example.com:443');

    expect(result.statusCode).toBe(403);
    result.socket.destroy();
    expect(proxy.getDeniedCount()).toBe(1);
  });

  it('supports wildcard domain rules', async () => {
    proxy = new HttpProxy({
      port: 0,
      rules: [
        { pattern: '*.blocked.com', action: DomainFilterAction.DENY },
      ],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    const result = await httpGet(
      proxyPort,
      'http://api.blocked.com/test',
    );

    expect(result.statusCode).toBe(403);
    expect(proxy.getDeniedCount()).toBe(1);
  });

  it('respects session decisions from recordSessionDecision', async () => {
    await startEchoServer();

    proxy = new HttpProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.DENY,
    });
    const proxyPort = await proxy.start();

    // Record a session-level allow for 127.0.0.1
    proxy.recordSessionDecision('127.0.0.1', DomainFilterAction.ALLOW);

    const result = await httpGet(
      proxyPort,
      `http://127.0.0.1:${echoPort}/session-allowed`,
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain('echo: /session-allowed');
  });

  it('handles PROMPT action by emitting domainCheck event', async () => {
    await startEchoServer();

    proxy = new HttpProxy({
      port: 0,
      rules: [
        { pattern: '127.0.0.1', action: DomainFilterAction.PROMPT },
      ],
      defaultAction: DomainFilterAction.DENY,
    });
    const proxyPort = await proxy.start();

    // Listen for domainCheck and approve the domain
    proxy.on('domainCheck', (hostname: string, respond: (action: DomainFilterAction) => void) => {
      respond(DomainFilterAction.ALLOW);
    });

    const result = await httpGet(
      proxyPort,
      `http://127.0.0.1:${echoPort}/prompted`,
    );

    expect(result.statusCode).toBe(200);
  });

  it('denies PROMPT domains when no listener is attached', async () => {
    proxy = new HttpProxy({
      port: 0,
      rules: [
        { pattern: 'unhandled.com', action: DomainFilterAction.PROMPT },
      ],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    // No domainCheck listener attached

    const result = await httpGet(
      proxyPort,
      'http://unhandled.com/test',
    );

    expect(result.statusCode).toBe(403);
  });

  it('updates rules at runtime', async () => {
    proxy = new HttpProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    // Initially allowed
    const result1 = await httpGet(proxyPort, 'http://example.com/test');
    expect(result1.statusCode).not.toBe(403);

    // Now add a deny rule
    proxy.updateRules([
      { pattern: 'example.com', action: DomainFilterAction.DENY },
    ]);

    const result2 = await httpGet(proxyPort, 'http://example.com/test');
    expect(result2.statusCode).toBe(403);
  });

  it('tracks connection and denied counts correctly', async () => {
    proxy = new HttpProxy({
      port: 0,
      rules: [
        { pattern: 'allowed.com', action: DomainFilterAction.ALLOW },
        { pattern: 'blocked.com', action: DomainFilterAction.DENY },
      ],
      defaultAction: DomainFilterAction.DENY,
    });
    const proxyPort = await proxy.start();

    await httpGet(proxyPort, 'http://blocked.com/1');
    await httpGet(proxyPort, 'http://blocked.com/2');
    // allowed.com will fail to connect (no actual server) but the domain
    // check itself succeeds → connection count goes up
    await httpGet(proxyPort, 'http://allowed.com/3').catch(() => {});

    expect(proxy.getConnectionCount()).toBe(3);
    expect(proxy.getDeniedCount()).toBe(2);
  });
});
