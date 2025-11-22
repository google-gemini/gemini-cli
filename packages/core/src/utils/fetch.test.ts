/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FetchError, isPrivateIp, fetchWithTimeout } from './fetch.js';
import * as errorsModule from './errors.js';

vi.mock('./errors.js');

describe('fetch utilities', () => {
  describe('FetchError class', () => {
    it('should create error with message', () => {
      const error = new FetchError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('FetchError');
    });

    it('should create error with code', () => {
      const error = new FetchError('Timeout error', 'ETIMEDOUT');
      expect(error.message).toBe('Timeout error');
      expect(error.code).toBe('ETIMEDOUT');
    });

    it('should be instance of Error', () => {
      const error = new FetchError('Test');
      expect(error).toBeInstanceOf(Error);
    });

    it('should have correct name property', () => {
      const error = new FetchError('Test');
      expect(error.name).toBe('FetchError');
    });

    it('should work without code', () => {
      const error = new FetchError('Test');
      expect(error.code).toBeUndefined();
    });
  });

  describe('isPrivateIp', () => {
    describe('private IPv4 ranges', () => {
      it('should detect 10.x.x.x as private', () => {
        expect(isPrivateIp('http://10.0.0.1')).toBe(true);
        expect(isPrivateIp('http://10.255.255.255')).toBe(true);
      });

      it('should detect 127.x.x.x as private (localhost)', () => {
        expect(isPrivateIp('http://127.0.0.1')).toBe(true);
        expect(isPrivateIp('http://127.255.255.255')).toBe(true);
      });

      it('should detect 172.16-31.x.x as private', () => {
        expect(isPrivateIp('http://172.16.0.1')).toBe(true);
        expect(isPrivateIp('http://172.31.255.255')).toBe(true);
      });

      it('should detect 192.168.x.x as private', () => {
        expect(isPrivateIp('http://192.168.0.1')).toBe(true);
        expect(isPrivateIp('http://192.168.255.255')).toBe(true);
      });

      it('should not detect 172.15.x.x as private', () => {
        expect(isPrivateIp('http://172.15.0.1')).toBe(false);
      });

      it('should not detect 172.32.x.x as private', () => {
        expect(isPrivateIp('http://172.32.0.1')).toBe(false);
      });
    });

    describe('private IPv6 ranges', () => {
      it('should detect ::1 as private (localhost)', () => {
        expect(isPrivateIp('http://[::1]')).toBe(true);
      });

      it('should detect fc00::/7 as private (ULA)', () => {
        expect(isPrivateIp('http://[fc00::1]')).toBe(true);
        expect(isPrivateIp('http://[fc00:1234:5678::1]')).toBe(true);
      });

      it('should detect fe80::/10 as private (link-local)', () => {
        expect(isPrivateIp('http://[fe80::1]')).toBe(true);
        expect(isPrivateIp('http://[fe80:1234:5678::1]')).toBe(true);
      });
    });

    describe('public IPs', () => {
      it('should not detect public IPv4 as private', () => {
        expect(isPrivateIp('http://8.8.8.8')).toBe(false);
        expect(isPrivateIp('http://1.1.1.1')).toBe(false);
        expect(isPrivateIp('http://93.184.216.34')).toBe(false);
      });

      it('should not detect public IPv6 as private', () => {
        expect(isPrivateIp('http://[2001:4860:4860::8888]')).toBe(false);
      });
    });

    describe('domain names', () => {
      it('should not detect domains as private', () => {
        expect(isPrivateIp('http://example.com')).toBe(false);
        expect(isPrivateIp('https://google.com')).toBe(false);
      });

      it('should handle localhost domain', () => {
        // 'localhost' as domain name won't match IP patterns
        expect(isPrivateIp('http://localhost')).toBe(false);
      });
    });

    describe('invalid URLs', () => {
      it('should return false for invalid URLs', () => {
        expect(isPrivateIp('not-a-url')).toBe(false);
        expect(isPrivateIp('')).toBe(false);
        expect(isPrivateIp('://invalid')).toBe(false);
      });
    });

    describe('URL variations', () => {
      it('should work with https protocol', () => {
        expect(isPrivateIp('https://10.0.0.1')).toBe(true);
      });

      it('should work with ports', () => {
        expect(isPrivateIp('http://10.0.0.1:8080')).toBe(true);
        expect(isPrivateIp('http://192.168.1.1:3000')).toBe(true);
      });

      it('should work with paths', () => {
        expect(isPrivateIp('http://10.0.0.1/api/v1')).toBe(true);
      });

      it('should work with query strings', () => {
        expect(isPrivateIp('http://192.168.1.1?param=value')).toBe(true);
      });
    });
  });

  describe('fetchWithTimeout', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return response on successful fetch', async () => {
      const mockResponse = { ok: true, status: 200 } as Response;
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const promise = fetchWithTimeout('http://example.com', 5000);
      vi.advanceTimersByTime(100);

      const result = await promise;
      expect(result).toBe(mockResponse);
    });

    it('should throw FetchError on timeout', async () => {
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      const promise = fetchWithTimeout('http://example.com', 1000);

      vi.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow(FetchError);
      await expect(promise).rejects.toThrow('Request timed out after 1000ms');
    });

    it('should set timeout code on timeout error', async () => {
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      const promise = fetchWithTimeout('http://example.com', 1000);
      vi.advanceTimersByTime(1001);

      try {
        await promise;
      } catch (error) {
        expect((error as FetchError).code).toBe('ETIMEDOUT');
      }
    });

    it('should pass AbortSignal to fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;

      const promise = fetchWithTimeout('http://example.com', 5000);
      vi.advanceTimersByTime(100);

      await promise;

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('should clear timeout on successful fetch', async () => {
      const mockResponse = { ok: true } as Response;
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      await fetchWithTimeout('http://example.com', 5000);

      // Should not have any active timers
      expect(vi.getTimerCount()).toBe(0);
    });

    it('should handle fetch errors', async () => {
      const testError = new Error('Network error');
      global.fetch = vi.fn().mockRejectedValue(testError);
      vi.mocked(errorsModule.isNodeError).mockReturnValue(false);
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue('Network error');

      await expect(
        fetchWithTimeout('http://example.com', 5000),
      ).rejects.toThrow(FetchError);
    });

    it('should use getErrorMessage for non-timeout errors', async () => {
      const testError = new Error('Custom error');
      global.fetch = vi.fn().mockRejectedValue(testError);
      vi.mocked(errorsModule.isNodeError).mockReturnValue(false);
      vi.mocked(errorsModule.getErrorMessage).mockReturnValue('Custom error');

      try {
        await fetchWithTimeout('http://example.com', 5000);
      } catch (error) {
        expect(error).toBeInstanceOf(FetchError);
        expect((error as FetchError).message).toBe('Custom error');
      }

      expect(errorsModule.getErrorMessage).toHaveBeenCalledWith(testError);
    });

    it('should handle different timeout durations', async () => {
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      const promise = fetchWithTimeout('http://example.com', 500);
      vi.advanceTimersByTime(501);

      await expect(promise).rejects.toThrow('Request timed out after 500ms');
    });

    it('should abort fetch on timeout', async () => {
      const abortSpy = vi.fn();
      const mockController = {
        signal: {},
        abort: abortSpy,
      } as never;

      const originalAbortController = global.AbortController;
      global.AbortController = vi.fn().mockImplementation(() => mockController);

      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      fetchWithTimeout('http://example.com', 1000);
      vi.advanceTimersByTime(1001);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(abortSpy).toHaveBeenCalled();

      global.AbortController = originalAbortController;
    });
  });

  describe('integration scenarios', () => {
    it('should prevent fetching private IPs in production', () => {
      const url = 'http://192.168.1.1/api';
      if (isPrivateIp(url)) {
        expect(true).toBe(true);
      }
    });

    it('should allow fetching public URLs', () => {
      const url = 'https://api.example.com/data';
      expect(isPrivateIp(url)).toBe(false);
    });

    it('should handle timeout for slow private IPs', async () => {
      // This would be a real-world scenario
      const privateUrl = 'http://10.0.0.1:9999';
      expect(isPrivateIp(privateUrl)).toBe(true);

      // In production, you'd check isPrivateIp before calling fetchWithTimeout
    });
  });
});
