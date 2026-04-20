/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import net from 'node:net';
import { ProxyServer } from '../proxyServer.js';
import { DomainAction, DefaultPolicy } from '../types.js';
import type { DomainRule } from '../types.js';

describe('ProxyServer', () => {
  let proxy: ProxyServer;

  afterEach(async () => {
    if (proxy?.isRunning) {
      await proxy.stop();
    }
  });

  describe('lifecycle', () => {
    it('should start and stop', async () => {
      proxy = new ProxyServer({ port: 0, host: '127.0.0.1' });
      expect(proxy.isRunning).toBe(false);

      await proxy.start();
      expect(proxy.isRunning).toBe(true);
      expect(proxy.address).not.toBeNull();
      expect(proxy.address!.port).toBeGreaterThan(0);

      await proxy.stop();
      expect(proxy.isRunning).toBe(false);
      expect(proxy.address).toBeNull();
    });

    it('should throw when starting twice', async () => {
      proxy = new ProxyServer({ port: 0, host: '127.0.0.1' });
      await proxy.start();
      await expect(proxy.start()).rejects.toThrow('already running');
    });

    it('should be safe to stop when not running', async () => {
      proxy = new ProxyServer({ port: 0, host: '127.0.0.1' });
      // Should not throw
      await proxy.stop();
    });

    it('should emit start event', async () => {
      proxy = new ProxyServer({ port: 0, host: '127.0.0.1' });
      const startPromise = new Promise<void>((resolve) => {
        proxy.on('start', () => resolve());
      });
      await proxy.start();
      await startPromise;
    });
  });

  describe('domain filtering', () => {
    it('should expose the filter', () => {
      proxy = new ProxyServer({ port: 0, host: '127.0.0.1' });
      const filter = proxy.getFilter();
      expect(filter).toBeDefined();
    });

    it('should load allowlist rules from config', () => {
      const allowlist: DomainRule[] = [
        { pattern: 'example.com', action: DomainAction.ALLOW },
      ];
      proxy = new ProxyServer({
        port: 0,
        host: '127.0.0.1',
        defaultPolicy: DefaultPolicy.DENY_ALL,
        allowlist,
      });
      const filter = proxy.getFilter();
      expect(filter.isAllowed('example.com')).toBe(true);
      expect(filter.isAllowed('other.com')).toBe(false);
    });

    it('should load denylist rules from config', () => {
      const denylist: DomainRule[] = [
        { pattern: 'evil.com', action: DomainAction.DENY },
      ];
      proxy = new ProxyServer({
        port: 0,
        host: '127.0.0.1',
        defaultPolicy: DefaultPolicy.ALLOW_ALL,
        denylist,
      });
      const filter = proxy.getFilter();
      expect(filter.isAllowed('evil.com')).toBe(false);
      expect(filter.isAllowed('good.com')).toBe(true);
    });
  });

  describe('traffic logging', () => {
    it('should expose the logger', () => {
      proxy = new ProxyServer({ port: 0, host: '127.0.0.1' });
      const logger = proxy.getLogger();
      expect(logger).toBeDefined();
    });
  });

  describe('HTTP forwarding', () => {
    let targetServer: http.Server;
    let targetPort: number;

    beforeEach(async () => {
      // Create a simple target HTTP server
      targetServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      });
      await new Promise<void>((resolve) => {
        targetServer.listen(0, '127.0.0.1', () => {
          const addr = targetServer.address();
          if (addr && typeof addr === 'object') {
            targetPort = addr.port;
          }
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve, reject) => {
        targetServer.close((err) => (err ? reject(err) : resolve()));
      });
    });

    it('should forward allowed HTTP requests', async () => {
      proxy = new ProxyServer({
        port: 0,
        host: '127.0.0.1',
        enableLogging: true,
      });
      await proxy.start();
      const proxyPort = proxy.address!.port;

      const response = await new Promise<{
        statusCode: number;
        body: string;
      }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: proxyPort,
            path: `http://127.0.0.1:${targetPort}/test`,
            method: 'GET',
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

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('OK');
    });

    it('should block denied HTTP requests', async () => {
      proxy = new ProxyServer({
        port: 0,
        host: '127.0.0.1',
        defaultPolicy: DefaultPolicy.DENY_ALL,
        enableLogging: true,
      });
      await proxy.start();
      const proxyPort = proxy.address!.port;

      const response = await new Promise<{ statusCode: number }>(
        (resolve, reject) => {
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port: proxyPort,
              path: `http://127.0.0.1:${targetPort}/test`,
              method: 'GET',
            },
            (res) => {
              res.resume(); // Consume response body
              res.on('end', () => {
                resolve({ statusCode: res.statusCode ?? 0 });
              });
            },
          );
          req.on('error', reject);
          req.end();
        },
      );

      expect(response.statusCode).toBe(403);

      // Verify logging
      const entries = proxy.getLogger().getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.blocked).toBe(true);
    });

    it('should emit blocked event for denied requests', async () => {
      proxy = new ProxyServer({
        port: 0,
        host: '127.0.0.1',
        defaultPolicy: DefaultPolicy.DENY_ALL,
      });
      await proxy.start();
      const proxyPort = proxy.address!.port;

      const blockedPromise = new Promise<{ domain: string }>((resolve) => {
        proxy.on('blocked', resolve);
      });

      // Send a request that will be blocked
      const req = http.request({
        hostname: '127.0.0.1',
        port: proxyPort,
        path: `http://blocked.example.com/test`,
        method: 'GET',
      });
      req.on('error', () => {
        // Expected
      });
      // Consume the response
      req.on('response', (res) => res.resume());
      req.end();

      const blocked = await blockedPromise;
      expect(blocked.domain).toBe('blocked.example.com');
    });
  });

  describe('CONNECT tunneling', () => {
    it('should reject CONNECT for denied domains', async () => {
      proxy = new ProxyServer({
        port: 0,
        host: '127.0.0.1',
        defaultPolicy: DefaultPolicy.DENY_ALL,
        enableLogging: true,
      });
      await proxy.start();
      const proxyPort = proxy.address!.port;

      const result = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(proxyPort, '127.0.0.1', () => {
          socket.write(
            'CONNECT blocked.example.com:443 HTTP/1.1\r\nHost: blocked.example.com:443\r\n\r\n',
          );
        });

        let data = '';
        socket.on('data', (chunk) => {
          data += chunk.toString();
          if (data.includes('\r\n\r\n')) {
            socket.end();
            resolve(data);
          }
        });
        socket.on('error', reject);
      });

      expect(result).toContain('403 Forbidden');
    });

    it('should allow CONNECT for allowed domains and establish tunnel', async () => {
      // Create a simple TCP echo server as the target
      const echoServer = net.createServer((socket) => {
        socket.on('data', (data) => {
          socket.write(data);
        });
      });

      await new Promise<void>((resolve) => {
        echoServer.listen(0, '127.0.0.1', resolve);
      });

      const echoAddr = echoServer.address();
      const echoPort =
        echoAddr && typeof echoAddr === 'object' ? echoAddr.port : 0;

      proxy = new ProxyServer({
        port: 0,
        host: '127.0.0.1',
        defaultPolicy: DefaultPolicy.ALLOW_ALL,
      });
      await proxy.start();
      const proxyPort = proxy.address!.port;

      const echoResult = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(proxyPort, '127.0.0.1', () => {
          socket.write(
            `CONNECT 127.0.0.1:${echoPort} HTTP/1.1\r\nHost: 127.0.0.1:${echoPort}\r\n\r\n`,
          );
        });

        let phase: 'handshake' | 'echo' = 'handshake';
        let data = '';

        socket.on('data', (chunk) => {
          data += chunk.toString();
          if (phase === 'handshake' && data.includes('\r\n\r\n')) {
            if (data.includes('200')) {
              phase = 'echo';
              data = '';
              socket.write('HELLO');
            } else {
              socket.end();
              reject(new Error('CONNECT rejected: ' + data));
            }
          } else if (phase === 'echo' && data === 'HELLO') {
            socket.end();
            resolve(data);
          }
        });
        socket.on('error', reject);
      });

      expect(echoResult).toBe('HELLO');

      await new Promise<void>((resolve, reject) => {
        echoServer.close((err) => (err ? reject(err) : resolve()));
      });
    });
  });

  describe('config defaults', () => {
    it('should use default config values', () => {
      proxy = new ProxyServer();
      // Filter should use allow-all by default
      expect(proxy.getFilter().isAllowed('anything.com')).toBe(true);
    });
  });
});
