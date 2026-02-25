/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
import { NetworkProxyManager } from './networkProxyManager.js';
import { DomainFilterAction } from './types.js';
import type { ProxyConnectionRecord } from './types.js';
import * as http from 'node:http';

function httpGetViaProxy(
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

describe('NetworkProxyManager', () => {
  let manager: NetworkProxyManager;
  let echoServer: http.Server;

  afterEach(async () => {
    if (manager) {
      await manager.stop();
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
          resolve(addr.port);
        }
      });
    });
  }

  it('starts both proxy servers on auto-assigned ports', async () => {
    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });

    const addresses = await manager.start();

    expect(addresses.httpProxy).toBeDefined();
    expect(addresses.socksProxy).toBeDefined();
    expect(manager.isRunning()).toBe(true);
  });

  it('stops cleanly', async () => {
    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });

    await manager.start();
    await manager.stop();

    expect(manager.isRunning()).toBe(false);
  });

  it('does not start twice', async () => {
    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });

    const addresses1 = await manager.start();
    const addresses2 = await manager.start();

    expect(addresses1).toEqual(addresses2);
  });

  it('returns correct status', async () => {
    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });

    await manager.start();

    const status = manager.getStatus();
    expect(status.running).toBe(true);
    expect(status.connectionCount).toBe(0);
    expect(status.deniedCount).toBe(0);
    expect(status.addresses.httpProxy).toBeDefined();
    expect(status.addresses.socksProxy).toBeDefined();
  });

  it('returns proxy environment variables when running', async () => {
    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });

    await manager.start();

    const env = manager.getProxyEnvironment();
    expect(env['HTTP_PROXY']).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(env['HTTPS_PROXY']).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(env['http_proxy']).toBe(env['HTTP_PROXY']);
    expect(env['https_proxy']).toBe(env['HTTPS_PROXY']);
    expect(env['ALL_PROXY']).toMatch(/^socks5:\/\/127\.0\.0\.1:\d+$/);
    expect(env['all_proxy']).toBe(env['ALL_PROXY']);
  });

  it('returns empty env when not running', () => {
    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });

    const env = manager.getProxyEnvironment();
    expect(env).toEqual({});
  });

  it('forwards connection events from HTTP proxy', async () => {
    const echoPort = await startEchoServer();

    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });

    await manager.start();

    const records: ProxyConnectionRecord[] = [];
    manager.on('connection', (record: ProxyConnectionRecord) => {
      records.push(record);
    });

    const httpPort = parseInt(
      manager.getAddresses().httpProxy!.split(':')[1],
    );
    await httpGetViaProxy(
      httpPort,
      `http://127.0.0.1:${echoPort}/test`,
    );

    expect(records).toHaveLength(1);
    expect(records[0].host).toBe('127.0.0.1');
  });

  it('forwards denied events', async () => {
    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.DENY,
    });

    await manager.start();

    const deniedRecords: ProxyConnectionRecord[] = [];
    manager.on('denied', (record: ProxyConnectionRecord) => {
      deniedRecords.push(record);
    });

    const httpPort = parseInt(
      manager.getAddresses().httpProxy!.split(':')[1],
    );
    await httpGetViaProxy(httpPort, 'http://example.com/test');

    expect(deniedRecords).toHaveLength(1);
  });

  it('logs traffic when logging is enabled', async () => {
    const echoPort = await startEchoServer();

    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
      enableLogging: true,
    });

    await manager.start();

    const httpPort = parseInt(
      manager.getAddresses().httpProxy!.split(':')[1],
    );
    await httpGetViaProxy(
      httpPort,
      `http://127.0.0.1:${echoPort}/logged`,
    );

    const logger = manager.getTrafficLogger();
    const entries = logger.getRecords();
    expect(entries).toHaveLength(1);
    expect(entries[0].host).toBe('127.0.0.1');
  });

  it('updates rules on both proxies at runtime', async () => {
    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });

    await manager.start();

    // Update rules to block example.com
    manager.updateRules([
      { pattern: 'example.com', action: DomainFilterAction.DENY },
    ]);

    const httpPort = parseInt(
      manager.getAddresses().httpProxy!.split(':')[1],
    );
    const result = await httpGetViaProxy(httpPort, 'http://example.com/test');

    expect(result.statusCode).toBe(403);
  });

  it('updates default action at runtime', async () => {
    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });

    await manager.start();

    manager.updateDefaultAction(DomainFilterAction.DENY);

    const httpPort = parseInt(
      manager.getAddresses().httpProxy!.split(':')[1],
    );
    const result = await httpGetViaProxy(httpPort, 'http://example.com/test');

    expect(result.statusCode).toBe(403);
  });

  it('records session decisions on both proxies', async () => {
    const echoPort = await startEchoServer();

    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.DENY,
    });

    await manager.start();

    manager.recordSessionDecision('127.0.0.1', DomainFilterAction.ALLOW);

    const httpPort = parseInt(
      manager.getAddresses().httpProxy!.split(':')[1],
    );
    const result = await httpGetViaProxy(
      httpPort,
      `http://127.0.0.1:${echoPort}/session`,
    );

    expect(result.statusCode).toBe(200);
  });

  it('emits started and stopped events', async () => {
    manager = new NetworkProxyManager({
      enabled: true,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });

    let started = false;
    let stopped = false;

    manager.on('started', () => {
      started = true;
    });
    manager.on('stopped', () => {
      stopped = true;
    });

    await manager.start();
    expect(started).toBe(true);

    await manager.stop();
    expect(stopped).toBe(true);
  });

  it('exposes read-only config', async () => {
    manager = new NetworkProxyManager({
      enabled: true,
      rules: [{ pattern: 'foo.com', action: DomainFilterAction.ALLOW }],
      defaultAction: DomainFilterAction.DENY,
    });

    const config = manager.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.defaultAction).toBe(DomainFilterAction.DENY);
    expect(config.rules).toHaveLength(1);
    expect(config.rules[0].pattern).toBe('foo.com');
  });
});
