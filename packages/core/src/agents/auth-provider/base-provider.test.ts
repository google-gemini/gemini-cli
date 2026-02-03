/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { HttpHeaders } from '@a2a-js/sdk/client';
import { BaseA2AAuthProvider } from './base-provider.js';
import type { A2AAuthProviderType } from './types.js';

/**
 * Concrete implementation of BaseA2AAuthProvider for testing.
 */
class TestAuthProvider extends BaseA2AAuthProvider {
  readonly type: A2AAuthProviderType = 'apiKey';
  private testHeaders: HttpHeaders;

  constructor(headers: HttpHeaders = { Authorization: 'test-token' }) {
    super();
    this.testHeaders = headers;
  }

  async headers(): Promise<HttpHeaders> {
    return this.testHeaders;
  }

  setHeaders(headers: HttpHeaders): void {
    this.testHeaders = headers;
  }
}

describe('BaseA2AAuthProvider', () => {
  describe('shouldRetryWithHeaders', () => {
    it('should return headers for 401 response', async () => {
      const provider = new TestAuthProvider({ Authorization: 'Bearer token' });
      const response = new Response(null, { status: 401 });

      const result = await provider.shouldRetryWithHeaders({}, response);

      expect(result).toEqual({ Authorization: 'Bearer token' });
    });

    it('should return headers for 403 response', async () => {
      const provider = new TestAuthProvider({ Authorization: 'Bearer token' });
      const response = new Response(null, { status: 403 });

      const result = await provider.shouldRetryWithHeaders({}, response);

      expect(result).toEqual({ Authorization: 'Bearer token' });
    });

    it('should return undefined for 200 response', async () => {
      const provider = new TestAuthProvider();
      const response = new Response(null, { status: 200 });

      const result = await provider.shouldRetryWithHeaders({}, response);

      expect(result).toBeUndefined();
    });

    it('should return undefined for 500 response', async () => {
      const provider = new TestAuthProvider();
      const response = new Response(null, { status: 500 });

      const result = await provider.shouldRetryWithHeaders({}, response);

      expect(result).toBeUndefined();
    });

    it('should return undefined for 404 response', async () => {
      const provider = new TestAuthProvider();
      const response = new Response(null, { status: 404 });

      const result = await provider.shouldRetryWithHeaders({}, response);

      expect(result).toBeUndefined();
    });

    it('should call headers() to get fresh headers on retry', async () => {
      const provider = new TestAuthProvider({ Authorization: 'old-token' });
      const response = new Response(null, { status: 401 });

      // Change headers before retry
      provider.setHeaders({ Authorization: 'new-token' });

      const result = await provider.shouldRetryWithHeaders({}, response);

      expect(result).toEqual({ Authorization: 'new-token' });
    });

    it('should retry up to 2 times on 401/403', async () => {
      const provider = new TestAuthProvider({ Authorization: 'Bearer token' });
      const response401 = new Response(null, { status: 401 });

      // First retry should succeed
      const result1 = await provider.shouldRetryWithHeaders({}, response401);
      expect(result1).toEqual({ Authorization: 'Bearer token' });

      // Second retry should succeed
      const result2 = await provider.shouldRetryWithHeaders({}, response401);
      expect(result2).toEqual({ Authorization: 'Bearer token' });
    });

    it('should return undefined after max retries exceeded', async () => {
      const provider = new TestAuthProvider({ Authorization: 'Bearer token' });
      const response401 = new Response(null, { status: 401 });

      // Exhaust retries
      await provider.shouldRetryWithHeaders({}, response401); // retry 1
      await provider.shouldRetryWithHeaders({}, response401); // retry 2

      // Third attempt should return undefined
      const result = await provider.shouldRetryWithHeaders({}, response401);
      expect(result).toBeUndefined();
    });

    it('should reset retry count on successful response', async () => {
      const provider = new TestAuthProvider({ Authorization: 'Bearer token' });
      const response401 = new Response(null, { status: 401 });
      const response200 = new Response(null, { status: 200 });

      // Use up retries
      await provider.shouldRetryWithHeaders({}, response401); // retry 1
      await provider.shouldRetryWithHeaders({}, response401); // retry 2

      // Success resets counter
      await provider.shouldRetryWithHeaders({}, response200);

      // Should be able to retry again
      const result = await provider.shouldRetryWithHeaders({}, response401);
      expect(result).toEqual({ Authorization: 'Bearer token' });
    });
  });

  describe('initialize', () => {
    it('should be a no-op by default', async () => {
      const provider = new TestAuthProvider();

      // Should not throw
      await expect(provider.initialize()).resolves.toBeUndefined();
    });
  });
});
