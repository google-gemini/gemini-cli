/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { ApiKeyAuthProvider } from './api-key-provider.js';

describe('ApiKeyAuthProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('initialization', () => {
    it('should initialize with literal API key', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: 'my-api-key',
      });
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({ 'X-API-Key': 'my-api-key' });
    });

    it('should resolve API key from environment variable', async () => {
      vi.stubEnv('TEST_API_KEY', 'env-api-key');

      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: '$TEST_API_KEY',
      });
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({ 'X-API-Key': 'env-api-key' });
    });

    it('should throw if environment variable is not set', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: '$MISSING_KEY_12345',
      });

      await expect(provider.initialize()).rejects.toThrow(
        "Environment variable 'MISSING_KEY_12345' is not set",
      );
    });
  });

  describe('headers', () => {
    it('should throw if not initialized', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: 'test-key',
      });

      await expect(provider.headers()).rejects.toThrow('not initialized');
    });

    it('should use custom header name', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: 'my-key',
        name: 'X-Custom-Auth',
      });
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({ 'X-Custom-Auth': 'my-key' });
    });

    it('should use default header name X-API-Key', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: 'my-key',
      });
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({ 'X-API-Key': 'my-key' });
    });
  });

  describe('shouldRetryWithHeaders', () => {
    it('should return undefined for non-auth errors', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: 'test-key',
      });
      await provider.initialize();

      const result = await provider.shouldRetryWithHeaders(
        {},
        new Response(null, { status: 500 }),
      );
      expect(result).toBeUndefined();
    });

    it('should return undefined for literal keys on 401 (same headers would fail again)', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: 'test-key',
      });
      await provider.initialize();

      const result = await provider.shouldRetryWithHeaders(
        {},
        new Response(null, { status: 401 }),
      );
      expect(result).toBeUndefined();
    });

    it('should return undefined for env-var keys on 403', async () => {
      vi.stubEnv('RETRY_TEST_KEY', 'some-key');
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: '$RETRY_TEST_KEY',
      });
      await provider.initialize();

      const result = await provider.shouldRetryWithHeaders(
        {},
        new Response(null, { status: 403 }),
      );
      expect(result).toBeUndefined();
    });

    it('should re-resolve and return headers for command keys on 401', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: '!echo refreshed-key',
      });
      await provider.initialize();

      const result = await provider.shouldRetryWithHeaders(
        {},
        new Response(null, { status: 401 }),
      );
      expect(result).toEqual({ 'X-API-Key': 'refreshed-key' });
    });

    it('should stop retrying after MAX_AUTH_RETRIES', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: '!echo rotating-key',
      });
      await provider.initialize();

      const r1 = await provider.shouldRetryWithHeaders(
        {},
        new Response(null, { status: 401 }),
      );
      expect(r1).toBeDefined();

      const r2 = await provider.shouldRetryWithHeaders(
        {},
        new Response(null, { status: 401 }),
      );
      expect(r2).toBeDefined();

      const r3 = await provider.shouldRetryWithHeaders(
        {},
        new Response(null, { status: 401 }),
      );
      expect(r3).toBeUndefined();
    });
  });

  describe('type property', () => {
    it('should have type apiKey', () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: 'test',
      });
      expect(provider.type).toBe('apiKey');
    });
  });
});
