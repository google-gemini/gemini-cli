/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApiKeyAuthProvider } from './api-key-provider.js';

describe('ApiKeyAuthProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
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
      process.env['TEST_API_KEY'] = 'env-api-key';

      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: '$TEST_API_KEY',
      });
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({ 'X-API-Key': 'env-api-key' });
    });

    it('should throw if environment variable is not set', async () => {
      delete process.env['MISSING_KEY'];

      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: '$MISSING_KEY',
      });

      await expect(provider.initialize()).rejects.toThrow(
        "Environment variable 'MISSING_KEY' is not set",
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

    it('should use default header name X-API-Key for header location', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: 'my-key',
        in: 'header',
      });
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({ 'X-API-Key': 'my-key' });
    });
  });

  describe('query and cookie locations', () => {
    it('should return empty headers for query location', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: 'my-key',
        in: 'query',
      });
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({});
    });

    it('should expose key for query via getKeyForQuery', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: 'my-key',
        in: 'query',
        name: 'apikey',
      });
      await provider.initialize();

      const queryKey = provider.getKeyForQuery();
      expect(queryKey).toEqual({ name: 'apikey', value: 'my-key' });
    });

    it('should return undefined from getKeyForQuery when location is header', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: 'my-key',
        in: 'header',
      });
      await provider.initialize();

      expect(provider.getKeyForQuery()).toBeUndefined();
    });

    it('should expose key for cookie via getKeyForCookie', async () => {
      const provider = new ApiKeyAuthProvider({
        type: 'apiKey',
        key: 'my-key',
        in: 'cookie',
        name: 'auth_cookie',
      });
      await provider.initialize();

      const cookieKey = provider.getKeyForCookie();
      expect(cookieKey).toEqual({ name: 'auth_cookie', value: 'my-key' });
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
