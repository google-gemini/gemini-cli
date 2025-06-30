/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getInstallationId, getObfuscatedGoogleAccountId } from './user_id.js';

describe('user_id', () => {
  // Store original values to restore after tests
  let originalLocalStorage: Storage | undefined;
  let originalCrypto: Crypto | undefined;

  beforeEach(() => {
    // Mock localStorage if not available in test environment
    if (typeof localStorage === 'undefined') {
      const mockStorage: { [key: string]: string } = {};
      global.localStorage = {
        getItem: vi.fn((key: string) => mockStorage[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
        }),
        length: 0,
        key: vi.fn(() => null)
      } as Storage;
    }

    // Mock crypto if not available
    if (typeof crypto === 'undefined') {
      global.crypto = {
        randomUUID: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
        getRandomValues: vi.fn((array: Uint8Array) => {
          for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
          }
          return array;
        })
      } as Crypto;
    }
  });

  afterEach(() => {
    // Clean up mocks
    vi.clearAllMocks();
    localStorage?.clear();
  });

  describe('getInstallationId', () => {
    it('should return a valid UUID format string', () => {
      const installationId = getInstallationId();

      expect(installationId).toBeDefined();
      expect(typeof installationId).toBe('string');
      expect(installationId.length).toBeGreaterThan(0);

      // Should return the same ID on subsequent calls (consistent)
      const secondCall = getInstallationId();
      expect(secondCall).toBe(installationId);
    });

    it('should generate a valid UUID format', () => {
      const installationId = getInstallationId();
      
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(installationId).toMatch(uuidRegex);
    });

    it('should persist the installation ID across calls', () => {
      const firstId = getInstallationId();
      const secondId = getInstallationId();
      const thirdId = getInstallationId();

      expect(firstId).toBe(secondId);
      expect(secondId).toBe(thirdId);
    });

    it('should generate different IDs for different instances', () => {
      localStorage.clear();
      const firstId = getInstallationId();
      
      localStorage.clear();
      const secondId = getInstallationId();

      // These should be different since we cleared storage between calls
      expect(firstId).not.toBe(secondId);
    });

    it('should handle localStorage being unavailable gracefully', () => {
      // Mock localStorage to throw errors
      const mockGetItem = vi.fn().mockImplementation(() => {
        throw new Error('localStorage not available');
      });
      const mockSetItem = vi.fn().mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      Object.defineProperty(global, 'localStorage', {
        value: {
          getItem: mockGetItem,
          setItem: mockSetItem,
          removeItem: vi.fn(),
          clear: vi.fn(),
          length: 0,
          key: vi.fn()
        },
        writable: true
      });

      // Should still return a valid ID even if localStorage fails
      const installationId = getInstallationId();
      expect(installationId).toBeDefined();
      expect(typeof installationId).toBe('string');
      expect(installationId.length).toBeGreaterThan(0);
    });

    it('should handle crypto.randomUUID being unavailable', () => {
      // Mock crypto to not have randomUUID
      const originalCrypto = global.crypto;
      global.crypto = {} as Crypto;

      // Should still generate some form of ID
      const installationId = getInstallationId();
      expect(installationId).toBeDefined();
      expect(typeof installationId).toBe('string');
      expect(installationId.length).toBeGreaterThan(0);

      // Restore original crypto
      global.crypto = originalCrypto;
    });

    it('should return consistent ID when localStorage returns stored value', () => {
      const storedId = 'stored-installation-id-12345';
      localStorage.setItem('installation_id', storedId);

      const retrievedId = getInstallationId();
      expect(retrievedId).toBe(storedId);
    });

    it('should handle empty string from localStorage', () => {
      localStorage.setItem('installation_id', '');

      const installationId = getInstallationId();
      expect(installationId).toBeDefined();
      expect(installationId.length).toBeGreaterThan(0);
      // Should generate a new ID since empty string is invalid
    });

    it('should handle null from localStorage', () => {
      vi.spyOn(localStorage, 'getItem').mockReturnValue(null);

      const installationId = getInstallationId();
      expect(installationId).toBeDefined();
      expect(typeof installationId).toBe('string');
      expect(installationId.length).toBeGreaterThan(0);
    });

    it('should handle corrupted data in localStorage', () => {
      // Set invalid UUID format
      localStorage.setItem('installation_id', 'invalid-uuid-format');

      const installationId = getInstallationId();
      expect(installationId).toBeDefined();
      expect(typeof installationId).toBe('string');
      expect(installationId.length).toBeGreaterThan(0);
    });

    it('should handle localStorage quota exceeded error', () => {
      const mockSetItem = vi.fn().mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });

      vi.spyOn(localStorage, 'setItem').mockImplementation(mockSetItem);

      // Should still work even if can't save to localStorage
      const installationId = getInstallationId();
      expect(installationId).toBeDefined();
      expect(typeof installationId).toBe('string');
      expect(installationId.length).toBeGreaterThan(0);
    });
  });

  describe('getObfuscatedGoogleAccountId', () => {
    it('should return a non-empty string', () => {
      const result = getObfuscatedGoogleAccountId();

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);

      // Should be consistent on subsequent calls
      const secondCall = getObfuscatedGoogleAccountId();
      expect(secondCall).toBe(result);
    });

    it('should return the same as installation ID when no Google Account ID is cached', () => {
      // In a clean test environment, there should be no cached Google Account ID
      // so getObfuscatedGoogleAccountId should fall back to installation ID
      const googleAccountIdResult = getObfuscatedGoogleAccountId();
      const installationIdResult = getInstallationId();

      // They should be the same when no Google Account ID is cached
      expect(googleAccountIdResult).toBe(installationIdResult);
    });

    it('should return obfuscated Google Account ID when cached', () => {
      const mockGoogleAccountId = 'google-account-123456789';
      localStorage.setItem('google_account_id', mockGoogleAccountId);

      const result = getObfuscatedGoogleAccountId();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      
      // Should not be the same as the raw Google Account ID
      expect(result).not.toBe(mockGoogleAccountId);
    });

    it('should consistently return the same obfuscated ID for the same Google Account', () => {
      const mockGoogleAccountId = 'consistent-google-account-id';
      localStorage.setItem('google_account_id', mockGoogleAccountId);

      const firstResult = getObfuscatedGoogleAccountId();
      const secondResult = getObfuscatedGoogleAccountId();
      const thirdResult = getObfuscatedGoogleAccountId();

      expect(firstResult).toBe(secondResult);
      expect(secondResult).toBe(thirdResult);
    });

    it('should return different obfuscated IDs for different Google Accounts', () => {
      const firstAccountId = 'google-account-111';
      const secondAccountId = 'google-account-222';

      localStorage.setItem('google_account_id', firstAccountId);
      const firstResult = getObfuscatedGoogleAccountId();

      localStorage.setItem('google_account_id', secondAccountId);
      const secondResult = getObfuscatedGoogleAccountId();

      expect(firstResult).not.toBe(secondResult);
    });

    it('should handle localStorage errors gracefully', () => {
      const mockGetItem = vi.fn().mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      Object.defineProperty(global, 'localStorage', {
        value: {
          getItem: mockGetItem,
          setItem: vi.fn(),
          removeItem: vi.fn(),
          clear: vi.fn(),
          length: 0,
          key: vi.fn()
        },
        writable: true
      });

      // Should fallback gracefully
      const result = getObfuscatedGoogleAccountId();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty Google Account ID', () => {
      localStorage.setItem('google_account_id', '');

      const result = getObfuscatedGoogleAccountId();
      // Should fallback to installation ID behavior
      expect(result).toBe(getInstallationId());
    });

    it('should handle whitespace-only Google Account ID', () => {
      localStorage.setItem('google_account_id', '   \t\n   ');

      const result = getObfuscatedGoogleAccountId();
      // Should fallback to installation ID behavior
      expect(result).toBe(getInstallationId());
    });

    it('should handle very long Google Account ID', () => {
      const longAccountId = 'a'.repeat(1000);
      localStorage.setItem('google_account_id', longAccountId);

      const result = getObfuscatedGoogleAccountId();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // Result should be obfuscated/hashed, likely shorter than input
      expect(result.length).toBeLessThan(longAccountId.length);
    });

    it('should handle special characters in Google Account ID', () => {
      const specialCharsAccountId = 'user@example.com!@#$%^&*()_+-=[]{}|;:,.<>?';
      localStorage.setItem('google_account_id', specialCharsAccountId);

      const result = getObfuscatedGoogleAccountId();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle Unicode characters in Google Account ID', () => {
      const unicodeAccountId = 'user-测试-🌟-नमस्ते';
      localStorage.setItem('google_account_id', unicodeAccountId);

      const result = getObfuscatedGoogleAccountId();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle null Google Account ID in localStorage', () => {
      vi.spyOn(localStorage, 'getItem').mockReturnValue(null);

      const result = getObfuscatedGoogleAccountId();
      expect(result).toBe(getInstallationId());
    });

    it('should handle undefined returned from localStorage', () => {
      vi.spyOn(localStorage, 'getItem').mockReturnValue(undefined as any);

      const result = getObfuscatedGoogleAccountId();
      expect(result).toBe(getInstallationId());
    });
  });

  describe('Edge cases and error conditions', () => {
    it('should handle when both localStorage and crypto are completely unavailable', () => {
      // Remove both localStorage and crypto
      const originalLocalStorage = global.localStorage;
      const originalCrypto = global.crypto;
      
      delete (global as any).localStorage;
      delete (global as any).crypto;

      const installationId = getInstallationId();
      const googleAccountId = getObfuscatedGoogleAccountId();

      expect(installationId).toBeDefined();
      expect(googleAccountId).toBeDefined();
      expect(typeof installationId).toBe('string');
      expect(typeof googleAccountId).toBe('string');

      // Restore
      global.localStorage = originalLocalStorage;
      global.crypto = originalCrypto;
    });

    it('should handle concurrent calls gracefully', async () => {
      // Clear any existing cached values
      localStorage.clear();

      // Make multiple concurrent calls
      const promises = Array.from({ length: 10 }, () => 
        Promise.resolve(getInstallationId())
      );

      const results = await Promise.all(promises);

      // All results should be the same (consistent)
      const firstResult = results[0];
      results.forEach(result => {
        expect(result).toBe(firstResult);
      });
    });

    it('should maintain consistency across different localStorage states', () => {
      // Test with clean localStorage
      localStorage.clear();
      const cleanId = getInstallationId();

      // Test with existing installation_id
      const storedId = getInstallationId(); // This should store it
      expect(storedId).toBe(cleanId);

      // Test after manually setting a different value
      localStorage.setItem('installation_id', 'manually-set-id');
      const manuallySetId = getInstallationId();
      expect(manuallySetId).toBe('manually-set-id');
    });

    it('should handle browser private/incognito mode localStorage restrictions', () => {
      // Simulate private mode where localStorage throws on access
      Object.defineProperty(global, 'localStorage', {
        get: () => {
          throw new DOMException('Access denied');
        },
        configurable: true
      });

      const installationId = getInstallationId();
      const googleAccountId = getObfuscatedGoogleAccountId();

      expect(installationId).toBeDefined();
      expect(googleAccountId).toBeDefined();
      expect(typeof installationId).toBe('string');
      expect(typeof googleAccountId).toBe('string');
    });

    it('should handle SecurityError when accessing localStorage', () => {
      const mockLocalStorage = {
        getItem: vi.fn().mockImplementation(() => {
          throw new DOMException('SecurityError');
        }),
        setItem: vi.fn().mockImplementation(() => {
          throw new DOMException('SecurityError');
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn()
      };

      Object.defineProperty(global, 'localStorage', {
        value: mockLocalStorage,
        writable: true
      });

      const result = getInstallationId();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and reliability', () => {
    it('should execute quickly for repeated calls', () => {
      const start = performance.now();
      
      // Make 100 calls
      for (let i = 0; i < 100; i++) {
        getInstallationId();
        getObfuscatedGoogleAccountId();
      }
      
      const end = performance.now();
      const duration = end - start;
      
      // Should complete 200 total calls in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);
    });

    it('should not leak memory with repeated calls', () => {
      // This is more of a conceptual test - in a real environment you'd use memory profiling
      const initialMemoryKeys = Object.keys(localStorage);
      
      // Make many calls
      for (let i = 0; i < 50; i++) {
        getInstallationId();
        getObfuscatedGoogleAccountId();
      }
      
      const finalMemoryKeys = Object.keys(localStorage);
      
      // Should not have significantly increased localStorage usage
      expect(finalMemoryKeys.length - initialMemoryKeys.length).toBeLessThanOrEqual(2);
    });

    it('should handle rapid sequential calls without race conditions', () => {
      localStorage.clear();
      
      const results: string[] = [];
      
      // Make rapid sequential calls
      for (let i = 0; i < 20; i++) {
        results.push(getInstallationId());
      }
      
      // All results should be identical
      const firstResult = results[0];
      results.forEach(result => {
        expect(result).toBe(firstResult);
      });
    });

    it('should be deterministic with same input conditions', () => {
      const testAccountId = 'deterministic-test-account';
      
      // Run test multiple times with same conditions
      for (let i = 0; i < 5; i++) {
        localStorage.clear();
        localStorage.setItem('google_account_id', testAccountId);
        
        const result = getObfuscatedGoogleAccountId();
        
        // Should get same result each time with same input
        if (i === 0) {
          var expectedResult = result;
        } else {
          expect(result).toBe(expectedResult);
        }
      }
    });
  });

  describe('Input validation and sanitization', () => {
    it('should handle localStorage returning non-string values', () => {
      // Mock localStorage to return non-string values
      vi.spyOn(localStorage, 'getItem').mockReturnValue(123 as any);

      const result = getInstallationId();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle localStorage returning objects', () => {
      vi.spyOn(localStorage, 'getItem').mockReturnValue({ invalid: 'object' } as any);

      const result = getInstallationId();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle localStorage with circular references', () => {
      const circular: any = { prop: null };
      circular.prop = circular;
      
      vi.spyOn(localStorage, 'getItem').mockReturnValue(circular);

      const result = getInstallationId();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle extremely large strings from localStorage', () => {
      const hugeString = 'x'.repeat(10000);
      localStorage.setItem('installation_id', hugeString);

      const result = getInstallationId();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
});
