/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpAuthProvider } from './http-auth-provider.js';

describe('HttpAuthProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Bearer authentication', () => {
    it('should generate Bearer authorization header', async () => {
      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Bearer',
        token: 'my-bearer-token',
      });
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({ Authorization: 'Bearer my-bearer-token' });
    });

    it('should resolve token from environment variable', async () => {
      process.env['BEARER_TOKEN'] = 'env-token';

      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Bearer',
        token: '$BEARER_TOKEN',
      });
      await provider.initialize();

      const headers = await provider.headers();
      expect(headers).toEqual({ Authorization: 'Bearer env-token' });
    });

    it('should throw if Bearer token is not provided', async () => {
      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Bearer',
      });

      await expect(provider.initialize()).rejects.toThrow(
        'HTTP Bearer authentication requires a token',
      );
    });

    it('should throw if not initialized', async () => {
      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Bearer',
        token: 'test',
      });

      await expect(provider.headers()).rejects.toThrow('not initialized');
    });
  });

  describe('Basic authentication', () => {
    it('should generate Basic authorization header', async () => {
      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Basic',
        username: 'user',
        password: 'pass',
      });
      await provider.initialize();

      const headers = await provider.headers();
      // 'user:pass' base64 encoded is 'dXNlcjpwYXNz'
      expect(headers).toEqual({ Authorization: 'Basic dXNlcjpwYXNz' });
    });

    it('should resolve credentials from environment variables', async () => {
      process.env['AUTH_USER'] = 'envuser';
      process.env['AUTH_PASS'] = 'envpass';

      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Basic',
        username: '$AUTH_USER',
        password: '$AUTH_PASS',
      });
      await provider.initialize();

      const headers = await provider.headers();
      // 'envuser:envpass' base64 encoded
      const expected = Buffer.from('envuser:envpass').toString('base64');
      expect(headers).toEqual({ Authorization: `Basic ${expected}` });
    });

    it('should throw if username is not provided', async () => {
      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Basic',
        password: 'pass',
      });

      await expect(provider.initialize()).rejects.toThrow(
        'HTTP Basic authentication requires username and password',
      );
    });

    it('should throw if password is not provided', async () => {
      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Basic',
        username: 'user',
      });

      await expect(provider.initialize()).rejects.toThrow(
        'HTTP Basic authentication requires username and password',
      );
    });
  });

  describe('shouldRetryWithHeaders', () => {
    it('should return undefined for non-auth errors', async () => {
      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Bearer',
        token: 'test-token',
      });
      await provider.initialize();

      const response = new Response(null, { status: 500 });
      const result = await provider.shouldRetryWithHeaders({}, response);
      expect(result).toBeUndefined();
    });

    it('should return headers for 401 response', async () => {
      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Bearer',
        token: 'test-token',
      });
      await provider.initialize();

      const response = new Response(null, { status: 401 });
      const result = await provider.shouldRetryWithHeaders({}, response);
      expect(result).toEqual({ Authorization: 'Bearer test-token' });
    });

    it('should return headers for 403 response', async () => {
      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Bearer',
        token: 'test-token',
      });
      await provider.initialize();

      const response = new Response(null, { status: 403 });
      const result = await provider.shouldRetryWithHeaders({}, response);
      expect(result).toEqual({ Authorization: 'Bearer test-token' });
    });

    it('should re-resolve command-based tokens on retry', async () => {
      // Use a command that returns different values
      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Bearer',
        token: '!echo refreshed-token',
      });
      await provider.initialize();

      const response = new Response(null, { status: 401 });
      const result = await provider.shouldRetryWithHeaders({}, response);
      expect(result).toEqual({ Authorization: 'Bearer refreshed-token' });
    });
  });

  describe('type property', () => {
    it('should have type http', () => {
      const provider = new HttpAuthProvider({
        type: 'http',
        scheme: 'Bearer',
        token: 'test',
      });
      expect(provider.type).toBe('http');
    });
  });
});
