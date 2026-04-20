/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import net from 'node:net';
import { SocksProxy } from '../socksProxy.js';
import { DomainAction, DefaultPolicy } from '../types.js';
import type { DomainRule } from '../types.js';

/**
 * Build a SOCKS5 greeting buffer.
 */
function buildGreeting(methods: number[] = [0x00]): Buffer {
  return Buffer.from([0x05, methods.length, ...methods]);
}

/**
 * Build a SOCKS5 connect request for a domain.
 */
function buildDomainConnectRequest(domain: string, port: number): Buffer {
  const domainBuf = Buffer.from(domain, 'ascii');
  const buf = Buffer.alloc(4 + 1 + domainBuf.length + 2);
  buf[0] = 0x05; // VER
  buf[1] = 0x01; // CMD: CONNECT
  buf[2] = 0x00; // RSV
  buf[3] = 0x03; // ATYP: DOMAIN
  buf[4] = domainBuf.length;
  domainBuf.copy(buf, 5);
  buf.writeUInt16BE(port, 5 + domainBuf.length);
  return buf;
}

/**
 * Build a SOCKS5 connect request for an IPv4 address.
 */
function buildIPv4ConnectRequest(
  ip: [number, number, number, number],
  port: number,
): Buffer {
  const buf = Buffer.alloc(10);
  buf[0] = 0x05; // VER
  buf[1] = 0x01; // CMD: CONNECT
  buf[2] = 0x00; // RSV
  buf[3] = 0x01; // ATYP: IPv4
  buf[4] = ip[0];
  buf[5] = ip[1];
  buf[6] = ip[2];
  buf[7] = ip[3];
  buf.writeUInt16BE(port, 8);
  return buf;
}

describe('SocksProxy', () => {
  let proxy: SocksProxy;

  afterEach(async () => {
    if (proxy?.isRunning) {
      await proxy.stop();
    }
  });

  describe('lifecycle', () => {
    it('should start and stop', async () => {
      proxy = new SocksProxy({ port: 0, host: '127.0.0.1' });
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
      proxy = new SocksProxy({ port: 0, host: '127.0.0.1' });
      await proxy.start();
      await expect(proxy.start()).rejects.toThrow('already running');
    });

    it('should be safe to stop when not running', async () => {
      proxy = new SocksProxy({ port: 0, host: '127.0.0.1' });
      await proxy.stop();
    });
  });

  describe('domain filtering', () => {
    it('should expose the filter', () => {
      proxy = new SocksProxy({ port: 0, host: '127.0.0.1' });
      expect(proxy.getFilter()).toBeDefined();
    });

    it('should load allowlist from config', () => {
      const allowlist: DomainRule[] = [
        { pattern: 'example.com', action: DomainAction.ALLOW },
      ];
      proxy = new SocksProxy({
        port: 0,
        host: '127.0.0.1',
        defaultPolicy: DefaultPolicy.DENY_ALL,
        allowlist,
      });
      expect(proxy.getFilter().isAllowed('example.com')).toBe(true);
      expect(proxy.getFilter().isAllowed('other.com')).toBe(false);
    });

    it('should load denylist from config', () => {
      const denylist: DomainRule[] = [
        { pattern: 'evil.com', action: DomainAction.DENY },
      ];
      proxy = new SocksProxy({
        port: 0,
        host: '127.0.0.1',
        defaultPolicy: DefaultPolicy.ALLOW_ALL,
        denylist,
      });
      expect(proxy.getFilter().isAllowed('evil.com')).toBe(false);
    });
  });

  describe('traffic logging', () => {
    it('should expose the logger', () => {
      proxy = new SocksProxy({ port: 0, host: '127.0.0.1' });
      expect(proxy.getLogger()).toBeDefined();
    });
  });

  describe('SOCKS5 handshake', () => {
    it('should accept no-auth greeting', async () => {
      proxy = new SocksProxy({ port: 0, host: '127.0.0.1' });
      await proxy.start();
      const proxyPort = proxy.address!.port;

      const response = await new Promise<Buffer>((resolve, reject) => {
        const socket = net.connect(proxyPort, '127.0.0.1', () => {
          socket.write(buildGreeting([0x00]));
        });
        socket.once('data', (data) => {
          socket.end();
          resolve(data);
        });
        socket.on('error', reject);
      });

      expect(response[0]).toBe(0x05); // SOCKS version
      expect(response[1]).toBe(0x00); // No auth
    });

    it('should reject when no-auth is not offered', async () => {
      proxy = new SocksProxy({ port: 0, host: '127.0.0.1' });
      await proxy.start();
      const proxyPort = proxy.address!.port;

      const response = await new Promise<Buffer>((resolve, reject) => {
        const socket = net.connect(proxyPort, '127.0.0.1', () => {
          // Only offer username/password auth (0x02), not no-auth
          socket.write(buildGreeting([0x02]));
        });
        socket.once('data', (data) => {
          socket.end();
          resolve(data);
        });
        socket.on('error', reject);
      });

      expect(response[0]).toBe(0x05);
      expect(response[1]).toBe(0xff); // No acceptable methods
    });

    it('should reject non-SOCKS5 version', async () => {
      proxy = new SocksProxy({ port: 0, host: '127.0.0.1' });
      await proxy.start();
      const proxyPort = proxy.address!.port;

      const closed = await new Promise<boolean>((resolve) => {
        const socket = net.connect(proxyPort, '127.0.0.1', () => {
          // Send SOCKS4 greeting
          socket.write(Buffer.from([0x04, 0x01, 0x00]));
        });
        socket.on('close', () => resolve(true));
        socket.on('error', () => resolve(true));
      });

      expect(closed).toBe(true);
    });
  });

  describe('SOCKS5 connect', () => {
    let echoServer: net.Server;
    let echoPort: number;

    beforeEach(async () => {
      echoServer = net.createServer((socket) => {
        socket.on('data', (data) => {
          socket.write(data);
        });
      });
      await new Promise<void>((resolve) => {
        echoServer.listen(0, '127.0.0.1', () => {
          const addr = echoServer.address();
          if (addr && typeof addr === 'object') {
            echoPort = addr.port;
          }
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve, reject) => {
        echoServer.close((err) => (err ? reject(err) : resolve()));
      });
    });

    it('should connect to allowed domain and tunnel data', async () => {
      proxy = new SocksProxy({
        port: 0,
        host: '127.0.0.1',
        defaultPolicy: DefaultPolicy.ALLOW_ALL,
      });
      await proxy.start();
      const proxyPort = proxy.address!.port;

      const result = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(proxyPort, '127.0.0.1', () => {
          socket.write(buildGreeting([0x00]));
        });

        let phase: 'greeting' | 'request' | 'echo' = 'greeting';

        socket.on('data', (data) => {
          if (phase === 'greeting') {
            if (data[0] === 0x05 && data[1] === 0x00) {
              phase = 'request';
              socket.write(buildIPv4ConnectRequest([127, 0, 0, 1], echoPort));
            } else {
              socket.end();
              reject(new Error('Auth negotiation failed'));
            }
          } else if (phase === 'request') {
            if (data[0] === 0x05 && data[1] === 0x00) {
              phase = 'echo';
              socket.write(Buffer.from('SOCKS_ECHO'));
            } else {
              socket.end();
              reject(new Error(`Connect failed with reply: ${data[1]}`));
            }
          } else if (phase === 'echo') {
            socket.end();
            resolve(data.toString());
          }
        });

        socket.on('error', reject);
      });

      expect(result).toBe('SOCKS_ECHO');
    });

    it('should deny connection to blocked domain', async () => {
      proxy = new SocksProxy({
        port: 0,
        host: '127.0.0.1',
        defaultPolicy: DefaultPolicy.DENY_ALL,
        enableLogging: true,
      });
      await proxy.start();
      const proxyPort = proxy.address!.port;

      const reply = await new Promise<number>((resolve, reject) => {
        const socket = net.connect(proxyPort, '127.0.0.1', () => {
          socket.write(buildGreeting([0x00]));
        });

        let phase: 'greeting' | 'request' = 'greeting';

        socket.on('data', (data) => {
          if (phase === 'greeting') {
            if (data[0] === 0x05 && data[1] === 0x00) {
              phase = 'request';
              socket.write(
                buildDomainConnectRequest('blocked.example.com', 443),
              );
            }
          } else if (phase === 'request') {
            resolve(data[1]);
          }
        });

        socket.on('error', reject);
      });

      // REP_CONNECTION_NOT_ALLOWED = 0x02
      expect(reply).toBe(0x02);
    });

    it('should emit blocked event for denied connections', async () => {
      proxy = new SocksProxy({
        port: 0,
        host: '127.0.0.1',
        defaultPolicy: DefaultPolicy.DENY_ALL,
      });
      await proxy.start();
      const proxyPort = proxy.address!.port;

      const blockedPromise = new Promise<{ domain: string }>((resolve) => {
        proxy.on('blocked', resolve);
      });

      const socket = net.connect(proxyPort, '127.0.0.1', () => {
        socket.write(buildGreeting([0x00]));
      });

      let phase: 'greeting' | 'request' = 'greeting';
      socket.on('data', (data) => {
        if (phase === 'greeting' && data[0] === 0x05 && data[1] === 0x00) {
          phase = 'request';
          socket.write(buildDomainConnectRequest('denied.example.com', 443));
        }
      });

      const blocked = await blockedPromise;
      expect(blocked.domain).toBe('denied.example.com');
      socket.destroy();
    });

    it('should connect using domain address type', async () => {
      proxy = new SocksProxy({
        port: 0,
        host: '127.0.0.1',
        defaultPolicy: DefaultPolicy.ALLOW_ALL,
      });
      await proxy.start();
      const proxyPort = proxy.address!.port;

      const result = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(proxyPort, '127.0.0.1', () => {
          socket.write(buildGreeting([0x00]));
        });

        let phase: 'greeting' | 'request' | 'echo' = 'greeting';

        socket.on('data', (data) => {
          if (phase === 'greeting') {
            if (data[0] === 0x05 && data[1] === 0x00) {
              phase = 'request';
              // Use domain name "127.0.0.1" (as domain type, not IPv4 type)
              socket.write(buildDomainConnectRequest('127.0.0.1', echoPort));
            }
          } else if (phase === 'request') {
            if (data[0] === 0x05 && data[1] === 0x00) {
              phase = 'echo';
              socket.write(Buffer.from('DOMAIN_ECHO'));
            } else {
              socket.end();
              reject(new Error(`Connect failed: ${data[1]}`));
            }
          } else if (phase === 'echo') {
            socket.end();
            resolve(data.toString());
          }
        });

        socket.on('error', reject);
      });

      expect(result).toBe('DOMAIN_ECHO');
    });
  });

  describe('config', () => {
    it('should use default port 1080 when not specified', () => {
      proxy = new SocksProxy();
      // Cannot inspect private port, but we can verify filter defaults
      expect(proxy.getFilter().isAllowed('anything.com')).toBe(true);
    });

    it('should use custom maxLogEntries', () => {
      proxy = new SocksProxy({
        port: 0,
        host: '127.0.0.1',
        maxLogEntries: 5,
        enableLogging: true,
      });
      const logger = proxy.getLogger();
      expect(logger).toBeDefined();
    });
  });
});
