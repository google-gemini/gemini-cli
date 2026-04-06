/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach, type Mock } from 'vitest';
import { fetchJson, getGitHubToken } from './github_fetch.js';
import { fetchWithTimeout } from './fetch.js';

vi.mock('./fetch.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

describe('getGitHubToken', () => {
  const originalToken = process.env['GITHUB_TOKEN'];

  afterEach(() => {
    if (originalToken) {
      process.env['GITHUB_TOKEN'] = originalToken;
    } else {
      delete process.env['GITHUB_TOKEN'];
    }
  });

  it('should return the token if GITHUB_TOKEN is set', () => {
    process.env['GITHUB_TOKEN'] = 'test-token';
    expect(getGitHubToken()).toBe('test-token');
  });

  it('should return undefined if GITHUB_TOKEN is not set', () => {
    delete process.env['GITHUB_TOKEN'];
    expect(getGitHubToken()).toBeUndefined();
  });
});

describe('fetchJson', () => {
  const fetchMock = fetchWithTimeout as Mock;

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should fetch and parse JSON successfully', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ foo: 'bar' }),
    });

    await expect(fetchJson('https://example.com/data.json')).resolves.toEqual({
      foo: 'bar',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/data.json',
      10000,
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'gemini-cli',
          Accept: 'application/vnd.github+json',
        }),
      }),
    );
  });

  it('should reject on non-ok status code', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(fetchJson('https://example.com/error')).rejects.toThrow(
      'Request failed with status code 404',
    );
  });

  describe('with GITHUB_TOKEN', () => {
    const originalToken = process.env['GITHUB_TOKEN'];

    beforeEach(() => {
      process.env['GITHUB_TOKEN'] = 'my-secret-token';
    });

    afterEach(() => {
      if (originalToken) {
        process.env['GITHUB_TOKEN'] = originalToken;
      } else {
        delete process.env['GITHUB_TOKEN'];
      }
    });

    it('should include Authorization header if token is present', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ foo: 'bar' }),
      });

      await expect(fetchJson('https://api.github.com/user')).resolves.toEqual({
        foo: 'bar',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/user',
        10000,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'token my-secret-token',
          }),
        }),
      );
    });
  });
});
