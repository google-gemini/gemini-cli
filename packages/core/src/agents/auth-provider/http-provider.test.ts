/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpAuthProvider } from './http-provider.js';

describe('HttpAuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Bearer Authentication', () => {
    it('should provide Bearer token header', async () => {
      const config = {
        type: 'http' as const,
        scheme: 'Bearer' as const,
        token: 'test-token',
      };
      const provider = new HttpAuthProvider(config);
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({ Authorization: 'Bearer test-token' });
    });

    it('should resolve token from environment variable', async () => {
      process.env['TEST_TOKEN'] = 'env-token';
      const config = {
        type: 'http' as const,
        scheme: 'Bearer' as const,
        token: '$TEST_TOKEN',
      };
      const provider = new HttpAuthProvider(config);
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({ Authorization: 'Bearer env-token' });
      delete process.env['TEST_TOKEN'];
    });
  });

  describe('Basic Authentication', () => {
    it('should provide Basic auth header', async () => {
      const config = {
        type: 'http' as const,
        scheme: 'Basic' as const,
        username: 'user',
        password: 'password',
      };
      const provider = new HttpAuthProvider(config);
      await provider.initialize();

      const headers = await provider.headers();
      const expected = Buffer.from('user:password').toString('base64');
      expect(headers).toEqual({ Authorization: `Basic ${expected}` });
    });
  });

  describe('Generic/Raw Authentication', () => {
    it('should provide custom scheme with raw value', async () => {
      const config = {
        type: 'http' as const,
        scheme: 'CustomScheme',
        value: 'raw-value-here',
      };
      const provider = new HttpAuthProvider(config);
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({ Authorization: 'CustomScheme raw-value-here' });
    });

    it('should support Digest via raw value', async () => {
      const config = {
        type: 'http' as const,
        scheme: 'Digest',
        value: 'username="foo", response="bar"',
      };
      const provider = new HttpAuthProvider(config);
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({
        Authorization: 'Digest username="foo", response="bar"',
      });
    });
  });

  describe('Retry logic', () => {
    it('should re-initialize on 401 for Bearer', async () => {
      const config = {
        type: 'http' as const,
        scheme: 'Bearer' as const,
        token: '$DYNAMIC_TOKEN',
      };
      process.env['DYNAMIC_TOKEN'] = 'first';
      const provider = new HttpAuthProvider(config);
      await provider.initialize();

      process.env['DYNAMIC_TOKEN'] = 'second';
      const mockResponse = { status: 401 } as Response;
      const retryHeaders = await provider.shouldRetryWithHeaders(
        {},
        mockResponse,
      );

      expect(retryHeaders).toEqual({ Authorization: 'Bearer second' });
      delete process.env['DYNAMIC_TOKEN'];
    });

    it('should stop after max retries', async () => {
      const config = {
        type: 'http' as const,
        scheme: 'Bearer' as const,
        token: 'token',
      };
      const provider = new HttpAuthProvider(config);
      await provider.initialize();

      const mockResponse = { status: 401 } as Response;

      // MAX_AUTH_RETRIES is 2
      await provider.shouldRetryWithHeaders({}, mockResponse);
      await provider.shouldRetryWithHeaders({}, mockResponse);
      const third = await provider.shouldRetryWithHeaders({}, mockResponse);

      expect(third).toBeUndefined();
    });
  });
});
