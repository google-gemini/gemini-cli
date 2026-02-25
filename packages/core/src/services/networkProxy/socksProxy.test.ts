/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as net from 'node:net';
import { SocksProxy } from './socksProxy.js';
import { DomainFilterAction } from './types.js';
import type { ProxyConnectionRecord } from './types.js';

/**
 * Performs a SOCKS5 handshake and CONNECT request to the given proxy.
 * Returns the reply code from the proxy.
 */
async function socks5Connect(
  proxyPort: number,
  targetHost: string,
  targetPort: number,
): Promise<{ replyCode: number; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, '127.0.0.1', () => {
      // Step 1: Send greeting with no-auth method
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });

    let phase: 'greeting' | 'request' | 'done' = 'greeting';

    socket.on('data', (data: Buffer) => {
      if (phase === 'greeting') {
        // Server should respond with [0x05, 0x00] (version, no-auth)
        if (data[0] !== 0x05 || data[1] !== 0x00) {
          socket.destroy();
          reject(new Error(`Bad greeting response: ${data[0]}, ${data[1]}`));
          return;
        }

        phase = 'request';

        // Step 2: Send CONNECT request with domain address type
        const hostBuf = Buffer.from(targetHost, 'ascii');
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(targetPort);

        const request = Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),
          hostBuf,
          portBuf,
        ]);
        socket.write(request);
      } else if (phase === 'request') {
        phase = 'done';
        // Reply: [VER, REP, RSV, ATYP, BND.ADDR, BND.PORT]
        const replyCode = data[1];
        resolve({ replyCode, socket });
      }
    });

    socket.on('error', reject);
  });
}

describe('SocksProxy', () => {
  let proxy: SocksProxy;
  let echoServer: net.Server;
  let echoPort: number;

  afterEach(async () => {
    if (proxy) {
      await proxy.stop();
    }
    if (echoServer) {
      await new Promise<void>((resolve) => {
        echoServer.close(() => resolve());
      });
    }
  });

  async function startEchoTcpServer(): Promise<number> {
    return new Promise((resolve) => {
      echoServer = net.createServer((socket) => {
        socket.on('data', (data) => {
          socket.write(`echo: ${data.toString()}`);
        });
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
    proxy = new SocksProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });

    const port = await proxy.start();
    expect(port).toBeGreaterThan(0);
    expect(proxy.getPort()).toBe(port);

    await proxy.stop();
  });

  it('allows CONNECT when default action is allow', async () => {
    await startEchoTcpServer();

    proxy = new SocksProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    const { replyCode, socket } = await socks5Connect(
      proxyPort,
      '127.0.0.1',
      echoPort,
    );

    expect(replyCode).toBe(0x00); // success
    expect(proxy.getConnectionCount()).toBe(1);

    socket.destroy();
  });

  it('denies CONNECT when default action is deny', async () => {
    proxy = new SocksProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.DENY,
    });
    const proxyPort = await proxy.start();

    const { replyCode, socket } = await socks5Connect(
      proxyPort,
      'blocked.example.com',
      443,
    );

    expect(replyCode).toBe(0x02); // connection not allowed
    expect(proxy.getDeniedCount()).toBe(1);

    socket.destroy();
  });

  it('allows domains matching allow rules when default is deny', async () => {
    await startEchoTcpServer();

    proxy = new SocksProxy({
      port: 0,
      rules: [{ pattern: '127.0.0.1', action: DomainFilterAction.ALLOW }],
      defaultAction: DomainFilterAction.DENY,
    });
    const proxyPort = await proxy.start();

    const { replyCode, socket } = await socks5Connect(
      proxyPort,
      '127.0.0.1',
      echoPort,
    );

    expect(replyCode).toBe(0x00);
    socket.destroy();
  });

  it('blocks domains matching deny rules when default is allow', async () => {
    proxy = new SocksProxy({
      port: 0,
      rules: [
        { pattern: 'evil.example.com', action: DomainFilterAction.DENY },
      ],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    const { replyCode, socket } = await socks5Connect(
      proxyPort,
      'evil.example.com',
      443,
    );

    expect(replyCode).toBe(0x02);
    expect(proxy.getDeniedCount()).toBe(1);
    socket.destroy();
  });

  it('emits connection events', async () => {
    await startEchoTcpServer();

    proxy = new SocksProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    const records: ProxyConnectionRecord[] = [];
    proxy.on('connection', (record: ProxyConnectionRecord) => {
      records.push(record);
    });

    const { socket } = await socks5Connect(proxyPort, '127.0.0.1', echoPort);
    socket.destroy();

    expect(records).toHaveLength(1);
    expect(records[0].host).toBe('127.0.0.1');
    expect(records[0].protocol).toBe('tcp');
    expect(records[0].action).toBe(DomainFilterAction.ALLOW);
  });

  it('emits denied events on blocked connections', async () => {
    proxy = new SocksProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.DENY,
    });
    const proxyPort = await proxy.start();

    const deniedRecords: ProxyConnectionRecord[] = [];
    proxy.on('denied', (record: ProxyConnectionRecord) => {
      deniedRecords.push(record);
    });

    const { socket } = await socks5Connect(
      proxyPort,
      'blocked.example.com',
      443,
    );
    socket.destroy();

    expect(deniedRecords).toHaveLength(1);
    expect(deniedRecords[0].action).toBe(DomainFilterAction.DENY);
  });

  it('respects session decisions', async () => {
    await startEchoTcpServer();

    proxy = new SocksProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.DENY,
    });
    const proxyPort = await proxy.start();

    proxy.recordSessionDecision('127.0.0.1', DomainFilterAction.ALLOW);

    const { replyCode, socket } = await socks5Connect(
      proxyPort,
      '127.0.0.1',
      echoPort,
    );

    expect(replyCode).toBe(0x00);
    socket.destroy();
  });

  it('updates rules at runtime', async () => {
    proxy = new SocksProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    // Add deny rule
    proxy.updateRules([
      { pattern: 'target.com', action: DomainFilterAction.DENY },
    ]);

    const { replyCode, socket } = await socks5Connect(
      proxyPort,
      'target.com',
      80,
    );

    expect(replyCode).toBe(0x02);
    socket.destroy();
  });

  it('rejects non-SOCKS5 connections gracefully', async () => {
    proxy = new SocksProxy({
      port: 0,
      rules: [],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    // Send garbage data
    const destroyed = await new Promise<boolean>((resolve) => {
      const socket = net.connect(proxyPort, '127.0.0.1', () => {
        socket.write(Buffer.from([0x04, 0x01, 0x00])); // SOCKS4 greeting
      });
      socket.on('close', () => resolve(true));
      socket.on('error', () => resolve(true));
    });

    expect(destroyed).toBe(true);
  });

  it('supports wildcard domain rules', async () => {
    proxy = new SocksProxy({
      port: 0,
      rules: [
        { pattern: '*.blocked.org', action: DomainFilterAction.DENY },
      ],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    const { replyCode, socket } = await socks5Connect(
      proxyPort,
      'api.blocked.org',
      8080,
    );

    expect(replyCode).toBe(0x02);
    socket.destroy();
  });

  it('handles IPv6 CONNECT requests with canonical address format', async () => {
    proxy = new SocksProxy({
      port: 0,
      rules: [{ pattern: '::1', action: DomainFilterAction.DENY }],
      defaultAction: DomainFilterAction.ALLOW,
    });
    const proxyPort = await proxy.start();

    // Send a SOCKS5 CONNECT with IPv6 address type (ATYP 0x04)
    const result = await new Promise<{ replyCode: number; host: string }>((resolve, reject) => {
      const socket = net.connect(proxyPort, '127.0.0.1', () => {
        socket.write(Buffer.from([0x05, 0x01, 0x00]));
      });

      let phase: 'greeting' | 'request' | 'done' = 'greeting';

      socket.on('data', (data: Buffer) => {
        if (phase === 'greeting') {
          if (data[0] !== 0x05 || data[1] !== 0x00) {
            socket.destroy();
            reject(new Error('Bad greeting'));
            return;
          }
          phase = 'request';

          // Build IPv6 CONNECT for ::1 (all zeros except last byte = 1)
          const ipv6Bytes = Buffer.alloc(16, 0);
          ipv6Bytes[15] = 1; // ::1
          const portBuf = Buffer.alloc(2);
          portBuf.writeUInt16BE(8080);

          const request = Buffer.concat([
            Buffer.from([0x05, 0x01, 0x00, 0x04]), // VER, CMD=CONNECT, RSV, ATYP=IPv6
            ipv6Bytes,
            portBuf,
          ]);
          socket.write(request);
        } else if (phase === 'request') {
          phase = 'done';
          resolve({ replyCode: data[1], host: '' });
          socket.destroy();
        }
      });

      socket.on('error', reject);
    });

    // ::1 should match the deny rule and be blocked
    expect(result.replyCode).toBe(0x02);
    expect(proxy.getDeniedCount()).toBe(1);
  });
});
