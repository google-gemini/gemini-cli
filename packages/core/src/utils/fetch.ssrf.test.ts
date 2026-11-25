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
  applyRedirect,
  assertUrlIsPublic,
  safeFetchFollowingRedirects,
  PrivateIpError,
} from './fetch.js';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

type MockLookup = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

function mockResolvedAddress(address: string): void {
  vi.mocked(dnsPromises.lookup as unknown as MockLookup).mockImplementation(
    async () => [{ address, family: 4 }],
  );
}

describe('assertUrlIsPublic', () => {
  beforeEach(() => {
    mockResolvedAddress('93.184.216.34');
  });

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
    mockResolvedAddress('169.254.169.254');
    await expect(
      assertUrlIsPublic('http://metadata.internal.example/'),
    ).rejects.toBeInstanceOf(PrivateIpError);
  });

  it('rejects a hostname that resolves to the gcp metadata address', async () => {
    mockResolvedAddress('169.254.169.254');
    await expect(
      assertUrlIsPublic('http://metadata.google.internal/'),
    ).rejects.toBeInstanceOf(PrivateIpError);
  });

  it('allows a hostname that resolves to a public address', async () => {
    mockResolvedAddress('93.184.216.34');
    await expect(
      assertUrlIsPublic('http://example.test/'),
    ).resolves.toBeUndefined();
  });
});

describe('applyRedirect', () => {
  it.each(['gopher://evil/', 'file:///etc/passwd', 'ftp://evil/'])(
    'rejects a redirect to the non http protocol %s',
    (location) => {
      expect(() =>
        applyRedirect('https://a.example/', 302, location, {}),
      ).toThrow();
    },
  );

  it('strips credential headers on a cross origin redirect', () => {
    const { nextOptions } = applyRedirect(
      'https://a.example/',
      302,
      'https://b.example/',
      {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=secret',
          'user-agent': 'gemini',
        },
      },
    );
    const headers = new Headers(nextOptions.headers);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('user-agent')).toBe('gemini');
  });

  it('keeps headers on a same origin redirect', () => {
    const { nextOptions } = applyRedirect(
      'https://a.example/one',
      302,
      'https://a.example/two',
      { headers: { authorization: 'Bearer secret' } },
    );
    const headers = new Headers(nextOptions.headers);
    expect(headers.get('authorization')).toBe('Bearer secret');
  });

  it('downgrades a 303 to GET and drops the body and content headers', () => {
    const { nextOptions } = applyRedirect(
      'https://a.example/',
      303,
      'https://a.example/next',
      {
        method: 'POST',
        body: 'payload',
        headers: { 'content-type': 'application/json', 'content-length': '7' },
      },
    );
    expect(nextOptions.method).toBe('GET');
    expect(nextOptions.body).toBeUndefined();
    const headers = new Headers(nextOptions.headers);
    expect(headers.get('content-type')).toBeNull();
    expect(headers.get('content-length')).toBeNull();
  });

  it('downgrades a 302 POST to GET', () => {
    const { nextOptions } = applyRedirect(
      'https://a.example/',
      302,
      'https://a.example/next',
      { method: 'POST', body: 'payload' },
    );
    expect(nextOptions.method).toBe('GET');
    expect(nextOptions.body).toBeUndefined();
  });
});

describe('safeFetchFollowingRedirects', () => {
  let internal: http.Server;
  let internalUrl: string;

  beforeEach(async () => {
    mockResolvedAddress('93.184.216.34');
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
