/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';

import { isPrivateIp } from './fetch.js';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

const mockedLookup = vi.mocked(lookup);

describe('isPrivateIp', () => {
  beforeEach(() => {
    mockedLookup.mockReset();
  });

  it('returns true for well-known private hostnames without resolving', async () => {
    await expect(isPrivateIp('http://localhost')).resolves.toBe(true);
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('returns true when DNS resolves to a private IPv4 address', async () => {
    mockedLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    await expect(isPrivateIp('https://internal.example')).resolves.toBe(true);
    expect(mockedLookup).toHaveBeenCalledWith('internal.example', {
      all: true,
      verbatim: true,
    });
  });

  it('returns false when DNS resolves to a public IPv4 address', async () => {
    mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    await expect(isPrivateIp('https://example.com')).resolves.toBe(false);
  });

  it('returns false when DNS lookup fails', async () => {
    mockedLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(isPrivateIp('https://unknown.example')).resolves.toBe(false);
  });

  it('returns false for invalid URLs and skips DNS', async () => {
    await expect(isPrivateIp('not-a-url')).resolves.toBe(false);
    expect(mockedLookup).not.toHaveBeenCalled();
  });
});
