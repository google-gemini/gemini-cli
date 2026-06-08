/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as dnsPromises from 'node:dns/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  assertUrlIsPublic,
  safeFetchFollowingRedirects,
  PrivateIpError,
} from './fetch.js';

describe('assertUrlIsPublic', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://localhost/',
  ])('rejects the literal private or loopback address %s', async (url) => {
    await expect(assertUrlIsPublic(url)).rejects.toBeInstanceOf(PrivateIpError);
  });

  it('rejects a hostname that resolves to a private address', async () => {
    vi.spyOn(dnsPromises, 'lookup').mockResolvedValue([
      { address: '169.254.169.254', family: 4 },
    ] as never);
    await expect(
      assertUrlIsPublic('http://metadata.internal.example/'),
    ).rejects.toBeInstanceOf(PrivateIpError);
  });

  it('rejects a hostname that resolves to the gcp metadata address', async () => {
    vi.spyOn(dnsPromises, 'lookup').mockResolvedValue([
      { address: '169.254.169.254', family: 4 },
    ] as never);
    await expect(
      assertUrlIsPublic('http://metadata.google.internal/'),
    ).rejects.toBeInstanceOf(PrivateIpError);
  });

  it('allows a hostname that resolves to a public address', async () => {
    vi.spyOn(dnsPromises, 'lookup').mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as never);
    await expect(
      assertUrlIsPublic('http://example.test/'),
    ).resolves.toBeUndefined();
  });
});

describe('safeFetchFollowingRedirects', () => {
  let internal: http.Server;
  let internalUrl: string;

  beforeEach(async () => {
    internal = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('INTERNAL_SECRET');
    });
    await new Promise<void>((resolve) =>
      internal.listen(0, '127.0.0.1', resolve),
    );
    internalUrl = `http://127.0.0.1:${(internal.address() as AddressInfo).port}/`;
  });

  afterEach(() => {
    internal.close();
    vi.restoreAllMocks();
  });

  it('refuses to fetch a private target so the internal body is never read', async () => {
    await expect(
      safeFetchFollowingRedirects(internalUrl, 5000),
    ).rejects.toBeInstanceOf(PrivateIpError);
  });
});
