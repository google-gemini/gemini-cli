/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import * as net from 'node:net';
import type { buildConnector } from 'undici';
import ipaddr from 'ipaddr.js';
import type { LookupAddress } from 'node:dns';

const { mockLookup } = vi.hoisted(() => ({
  mockLookup: vi.fn(async (hostname: string) => {
    if (hostname === 'test.localhost' || hostname === 'localhost') {
      return [{ address: '127.0.0.1', family: 4 }];
    }
    if (hostname === 'dual-stack-test.example.com') {
      return [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ];
    }
    if (hostname === 'pinning-test.example.com') {
      return [{ address: '93.184.216.34', family: 4 }];
    }
    if (hostname === 'failing-dns.example.com') {
      throw new Error('getaddrinfo ENOTFOUND failing-dns.example.com');
    }
    if (hostname.endsWith('.nip.io')) {
      const prefix = hostname.slice(0, -'.nip.io'.length);
      if (ipaddr.isValid(prefix)) {
        return [{ address: prefix, family: prefix.includes(':') ? 6 : 4 }];
      }
    }
    if (ipaddr.isValid(hostname)) {
      return [{ address: hostname, family: hostname.includes(':') ? 6 : 4 }];
    }
    return [{ address: '93.184.216.34', family: 4 }];
  }),
}));

vi.mock('node:dns/promises', () => ({
  lookup: mockLookup,
}));

const {
  fetchWithTimeout,
  isPrivateIp,
  validateUrlDestination,
  PrivateIpError,
  createSafeConnector,
  safeLookup,
} = await import('./fetch.js');

describe('Destination IP Validation & Connection Pinning (fetch.spec.ts)', () => {
  let server: http.Server;
  let serverPort: number;
  let requestReceived: boolean;

  beforeEach(async () => {
    requestReceived = false;

    server = http.createServer((_req, res) => {
      requestReceived = true;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('CONFIDENTIAL_INTERNAL_DATA');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Cloud Metadata & Link-Local IP Protection', () => {
    it('should block GCP Metadata (169.254.169.254) on default and custom ports', async () => {
      const gcpMetadataUrls = [
        'http://169.254.169.254/computeMetadata/v1/',
        'http://169.254.169.254:8080/computeMetadata/v1/',
        'http://169.254.169.254:443/computeMetadata/v1/',
        'http://[::ffff:169.254.169.254]/computeMetadata/v1/',
        'http://[::ffff:169.254.169.254]:8080/computeMetadata/v1/',
        'http://169.254.1.1:9090/',
      ];

      for (const url of gcpMetadataUrls) {
        expect(await isPrivateIp(url)).toBe(true);
        expect(await validateUrlDestination(url)).toBe(false);
        await expect(fetchWithTimeout(url, 2000)).rejects.toThrow(
          PrivateIpError,
        );
      }
    });
  });

  describe('Standard Private IP Blocks (RFC 1918 & Loopback)', () => {
    it('should block 10.x.x.x private ranges with standard and custom ports', async () => {
      const urls = [
        'http://10.0.0.1/',
        'http://10.0.0.1:8080/api',
        'http://10.255.255.254:9000/',
        'http://[::ffff:10.0.0.1]:8080/',
      ];

      for (const url of urls) {
        expect(await isPrivateIp(url)).toBe(true);
        expect(await validateUrlDestination(url)).toBe(false);
        await expect(fetchWithTimeout(url, 2000)).rejects.toThrow(
          PrivateIpError,
        );
      }
    });

    it('should block 172.16.x.x - 172.31.x.x private ranges with custom ports', async () => {
      const urls = [
        'http://172.16.0.1:3000/',
        'http://172.20.10.1:8443/',
        'http://172.31.255.255:9090/',
      ];

      for (const url of urls) {
        expect(await isPrivateIp(url)).toBe(true);
        expect(await validateUrlDestination(url)).toBe(false);
        await expect(fetchWithTimeout(url, 2000)).rejects.toThrow(
          PrivateIpError,
        );
      }
    });

    it('should block 192.168.x.x private ranges with standard and custom ports', async () => {
      const urls = [
        'http://192.168.0.1/',
        'http://192.168.1.1:8080/',
        'http://192.168.100.254:4000/admin',
        'http://[::ffff:192.168.1.1]:8080/',
      ];

      for (const url of urls) {
        expect(await isPrivateIp(url)).toBe(true);
        expect(await validateUrlDestination(url)).toBe(false);
        await expect(fetchWithTimeout(url, 2000)).rejects.toThrow(
          PrivateIpError,
        );
      }
    });

    it('should block IPv6 loopback, link-local, and unique local addresses', async () => {
      const urls = [
        'http://[::1]:8080/',
        'http://[fe80::1]:8080/',
        'http://[fc00::1]:8080/',
        'http://[fd00::1]:8080/',
      ];

      for (const url of urls) {
        expect(await isPrivateIp(url)).toBe(true);
        expect(await validateUrlDestination(url)).toBe(false);
        await expect(fetchWithTimeout(url, 2000)).rejects.toThrow(
          PrivateIpError,
        );
      }
    });
  });

  describe('Internal TLDs & Domain Resolution', () => {
    it('should identify internal TLDs (.internal, .local, .localhost) as private', async () => {
      const internalUrls = [
        'http://instance-data.internal',
        'http://metadata.google.internal/computeMetadata/v1/',
        'http://printer.local:631/',
        'http://service.internal:8080/',
        'http://myhost.localhost:3000/',
        'http://localhost:8080/',
      ];

      for (const url of internalUrls) {
        expect(await isPrivateIp(url)).toBe(true);
        expect(await validateUrlDestination(url)).toBe(false);
        await expect(fetchWithTimeout(url, 2000)).rejects.toThrow(
          PrivateIpError,
        );
      }
    });

    it('should block fetching a domain that resolves to loopback IP (test.localhost)', async () => {
      const targetUrl = `http://test.localhost:${serverPort}/secret`;

      await expect(fetchWithTimeout(targetUrl, 5000)).rejects.toThrow(
        PrivateIpError,
      );

      // Verify the local loopback server was never contacted
      expect(requestReceived).toBe(false);
    });

    it('should block Carrier-Grade NAT (100.64.0.0/10) and IANA benchmark range (198.18.0.0/15)', async () => {
      const urls = [
        'http://100.64.0.1:8080/',
        'http://100.127.255.254/',
        'http://198.18.0.1:8080/',
        'http://198.19.255.254/',
      ];

      for (const url of urls) {
        expect(await isPrivateIp(url)).toBe(true);
        expect(await validateUrlDestination(url)).toBe(false);
        await expect(fetchWithTimeout(url, 2000)).rejects.toThrow(
          PrivateIpError,
        );
      }
    });

    it('should block wildcard DNS service (nip.io style) disguised domains pointing to private IPs', async () => {
      const nipUrls = [
        'http://127.0.0.1.nip.io:8080/admin',
        'http://169.254.169.254.nip.io/computeMetadata/v1/',
        'http://10.0.0.1.nip.io/',
        'http://192.168.1.1.nip.io:3000/',
      ];

      for (const url of nipUrls) {
        expect(await isPrivateIp(url)).toBe(true);
        expect(await validateUrlDestination(url)).toBe(false);
        await expect(fetchWithTimeout(url, 2000)).rejects.toThrow(
          PrivateIpError,
        );
      }

      // Allow public IP via nip.io
      expect(await isPrivateIp('http://8.8.8.8.nip.io/')).toBe(false);
      expect(await validateUrlDestination('http://8.8.8.8.nip.io/')).toBe(true);
    });

    it('should block domain if any of multiple resolved IPs is private (dual-stack validation)', async () => {
      const testUrl = 'http://dual-stack-test.example.com/data';
      expect(await isPrivateIp(testUrl)).toBe(true);
      expect(await validateUrlDestination(testUrl)).toBe(false);
      await expect(fetchWithTimeout(testUrl, 2000)).rejects.toThrow(
        PrivateIpError,
      );
    });
  });

  describe('Connection Pinning & Fail-Closed Safety', () => {
    it('should forward connection options and preserve hostname/servername', async () => {
      let passedOpts: buildConnector.Options | undefined;
      const mockDefaultConnector: buildConnector.connector = (
        opts: buildConnector.Options,
        callback: buildConnector.Callback,
      ) => {
        passedOpts = opts;
        callback(null, new net.Socket());
      };

      const connector = createSafeConnector(undefined, mockDefaultConnector);
      await new Promise<void>((resolve, reject) => {
        connector(
          {
            hostname: 'pinning-test.example.com',
            protocol: 'https:',
            port: '443',
            servername: 'pinning-test.example.com',
          },
          (...args) => {
            const [err] = args;
            if (err) reject(err);
            else resolve();
          },
        );
      });

      expect(passedOpts?.hostname).toBe('pinning-test.example.com');
      expect(passedOpts?.servername).toBe('pinning-test.example.com');
    });

    it('should block direct private IP literals and internal TLDs at connector level', async () => {
      const mockDefaultConnector: buildConnector.connector = (
        opts,
        callback,
      ) => {
        callback(null, new net.Socket());
      };
      const connector = createSafeConnector(undefined, mockDefaultConnector);

      await expect(
        new Promise<void>((resolve, reject) => {
          connector(
            { hostname: '127.0.0.1', protocol: 'http:', port: '80' },
            (...args) => {
              const [err] = args;
              if (err) reject(err);
              else resolve();
            },
          );
        }),
      ).rejects.toThrow(PrivateIpError);

      await expect(
        new Promise<void>((resolve, reject) => {
          connector(
            {
              hostname: 'metadata.google.internal',
              protocol: 'http:',
              port: '80',
            },
            (...args) => {
              const [err] = args;
              if (err) reject(err);
              else resolve();
            },
          );
        }),
      ).rejects.toThrow(PrivateIpError);
    });

    it('should configure safeLookup for dual-stack Happy Eyeballs resolution and validate IPs', async () => {
      const addresses = await new Promise<LookupAddress[]>(
        (resolve, reject) => {
          safeLookup('pinning-test.example.com', { all: true }, (err, res) => {
            if (err) {
              reject(err);
            } else if (Array.isArray(res)) {
              resolve(res);
            } else {
              reject(new Error('Expected array of addresses'));
            }
          });
        },
      );
      expect(addresses).toEqual([{ address: '93.184.216.34', family: 4 }]);
    });

    it('should block safeLookup when resolving to private IP or internal host', async () => {
      await expect(
        new Promise((resolve, reject) => {
          safeLookup('test.localhost', { all: true }, (err, res) => {
            if (err) reject(err);
            else resolve(res);
          });
        }),
      ).rejects.toThrow(PrivateIpError);

      await expect(
        new Promise((resolve, reject) => {
          safeLookup('169.254.169.254', { all: true }, (err, res) => {
            if (err) reject(err);
            else resolve(res);
          });
        }),
      ).rejects.toThrow(PrivateIpError);
    });

    it('should block safeLookup for dual-stack when any resolved IP is private', async () => {
      await expect(
        new Promise((resolve, reject) => {
          safeLookup(
            'dual-stack-test.example.com',
            { all: true },
            (err, res) => {
              if (err) reject(err);
              else resolve(res);
            },
          );
        }),
      ).rejects.toThrow(PrivateIpError);
    });

    it('should fail closed when DNS resolution fails or times out', async () => {
      const unresolvableUrl = 'http://failing-dns.example.com/path';
      expect(await isPrivateIp(unresolvableUrl)).toBe(true);
      expect(await validateUrlDestination(unresolvableUrl)).toBe(false);
      await expect(fetchWithTimeout(unresolvableUrl, 2000)).rejects.toThrow();
    });

    it('should allow public domains and public IP addresses', async () => {
      expect(await isPrivateIp('http://8.8.8.8/')).toBe(false);
      expect(await validateUrlDestination('http://8.8.8.8/')).toBe(true);
      expect(await isPrivateIp('http://93.184.216.34/')).toBe(false);
      expect(await validateUrlDestination('http://93.184.216.34/')).toBe(true);
    });
  });
});
