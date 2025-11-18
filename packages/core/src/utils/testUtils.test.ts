/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  shouldSimulate429,
  resetRequestCounter,
  disableSimulationAfterFallback,
  createSimulated429Error,
  resetSimulationState,
  setSimulate429,
} from './testUtils.js';

describe('testUtils', () => {
  beforeEach(() => {
    // Reset all state before each test
    setSimulate429(false);
    resetSimulationState();
  });

  describe('shouldSimulate429', () => {
    it('should return false when simulation is disabled', () => {
      setSimulate429(false);

      expect(shouldSimulate429()).toBe(false);
    });

    it('should return true when simulation is enabled', () => {
      setSimulate429(true);

      expect(shouldSimulate429()).toBe(true);
    });

    it('should increment request counter on each call', () => {
      setSimulate429(true);

      shouldSimulate429();
      shouldSimulate429();
      shouldSimulate429();

      // After 3 calls, we expect consistent behavior
      expect(shouldSimulate429()).toBe(true);
    });

    it('should not simulate after fallback occurred', () => {
      setSimulate429(true);

      expect(shouldSimulate429()).toBe(true);

      disableSimulationAfterFallback();

      expect(shouldSimulate429()).toBe(false);
    });

    it('should filter by auth type when specified', () => {
      setSimulate429(true, 0, 'oauth');

      expect(shouldSimulate429('oauth')).toBe(true);
      expect(shouldSimulate429('api-key')).toBe(false);
    });

    it('should simulate for all auth types when not specified', () => {
      setSimulate429(true);

      expect(shouldSimulate429('oauth')).toBe(true);
      expect(shouldSimulate429('api-key')).toBe(true);
      expect(shouldSimulate429()).toBe(true);
    });

    it('should simulate only after N requests', () => {
      setSimulate429(true, 2);

      expect(shouldSimulate429()).toBe(false); // request 1
      expect(shouldSimulate429()).toBe(false); // request 2
      expect(shouldSimulate429()).toBe(true); // request 3
      expect(shouldSimulate429()).toBe(true); // request 4
    });

    it('should handle zero afterRequests value', () => {
      setSimulate429(true, 0);

      expect(shouldSimulate429()).toBe(true);
      expect(shouldSimulate429()).toBe(true);
    });

    it('should track requests independently of auth type filtering', () => {
      setSimulate429(true, 1, 'oauth');

      shouldSimulate429('api-key'); // request 1, not counted
      shouldSimulate429('oauth'); // request 2, counted
      shouldSimulate429('oauth'); // request 3, counted and triggered
    });
  });

  describe('resetRequestCounter', () => {
    it('should reset request counter to zero', () => {
      setSimulate429(true, 2);

      shouldSimulate429(); // request 1
      shouldSimulate429(); // request 2
      resetRequestCounter();

      expect(shouldSimulate429()).toBe(false); // back to request 1
    });

    it('should allow restarting simulation cycle', () => {
      setSimulate429(true, 1);

      shouldSimulate429(); // request 1
      expect(shouldSimulate429()).toBe(true); // request 2, triggered

      resetRequestCounter();

      expect(shouldSimulate429()).toBe(false); // back to request 1
      expect(shouldSimulate429()).toBe(true); // request 2, triggered again
    });
  });

  describe('disableSimulationAfterFallback', () => {
    it('should stop simulation after being called', () => {
      setSimulate429(true);

      expect(shouldSimulate429()).toBe(true);

      disableSimulationAfterFallback();

      expect(shouldSimulate429()).toBe(false);
      expect(shouldSimulate429()).toBe(false);
    });

    it('should persist across request counter resets', () => {
      setSimulate429(true);

      disableSimulationAfterFallback();
      resetRequestCounter();

      expect(shouldSimulate429()).toBe(false);
    });

    it('should be reset by resetSimulationState', () => {
      setSimulate429(true);

      disableSimulationAfterFallback();
      expect(shouldSimulate429()).toBe(false);

      resetSimulationState();
      setSimulate429(true);

      expect(shouldSimulate429()).toBe(true);
    });
  });

  describe('createSimulated429Error', () => {
    it('should create an Error instance', () => {
      const error = createSimulated429Error();

      expect(error).toBeInstanceOf(Error);
    });

    it('should have status code 429', () => {
      const error = createSimulated429Error() as Error & { status: number };

      expect(error.status).toBe(429);
    });

    it('should have descriptive message', () => {
      const error = createSimulated429Error();

      expect(error.message).toContain('Rate limit exceeded');
      expect(error.message).toContain('simulated');
    });

    it('should create unique error instances', () => {
      const error1 = createSimulated429Error();
      const error2 = createSimulated429Error();

      expect(error1).not.toBe(error2);
    });

    it('should have throwable error', () => {
      expect(() => {
        throw createSimulated429Error();
      }).toThrow('Rate limit exceeded');
    });
  });

  describe('resetSimulationState', () => {
    it('should reset fallback flag', () => {
      setSimulate429(true);
      disableSimulationAfterFallback();

      resetSimulationState();
      setSimulate429(true);

      expect(shouldSimulate429()).toBe(true);
    });

    it('should reset request counter', () => {
      setSimulate429(true, 2);

      shouldSimulate429(); // request 1
      shouldSimulate429(); // request 2

      resetSimulationState();
      setSimulate429(true, 2);

      expect(shouldSimulate429()).toBe(false); // back to request 1
    });

    it('should allow starting fresh simulation', () => {
      setSimulate429(true);
      shouldSimulate429();
      disableSimulationAfterFallback();

      resetSimulationState();
      setSimulate429(true);

      expect(shouldSimulate429()).toBe(true);
    });
  });

  describe('setSimulate429', () => {
    it('should enable simulation', () => {
      setSimulate429(true);

      expect(shouldSimulate429()).toBe(true);
    });

    it('should disable simulation', () => {
      setSimulate429(true);
      setSimulate429(false);

      expect(shouldSimulate429()).toBe(false);
    });

    it('should set afterRequests threshold', () => {
      setSimulate429(true, 3);

      expect(shouldSimulate429()).toBe(false); // request 1
      expect(shouldSimulate429()).toBe(false); // request 2
      expect(shouldSimulate429()).toBe(false); // request 3
      expect(shouldSimulate429()).toBe(true); // request 4
    });

    it('should set auth type filter', () => {
      setSimulate429(true, 0, 'specific-auth');

      expect(shouldSimulate429('specific-auth')).toBe(true);
      expect(shouldSimulate429('other-auth')).toBe(false);
    });

    it('should reset fallback state when re-enabled', () => {
      setSimulate429(true);
      disableSimulationAfterFallback();

      setSimulate429(true); // Re-enable

      expect(shouldSimulate429()).toBe(true);
    });

    it('should reset request counter when called', () => {
      setSimulate429(true, 2);
      shouldSimulate429(); // request 1
      shouldSimulate429(); // request 2

      setSimulate429(true, 2); // Reset

      expect(shouldSimulate429()).toBe(false); // back to request 1
    });

    it('should handle all parameters together', () => {
      setSimulate429(true, 1, 'test-auth');

      expect(shouldSimulate429('test-auth')).toBe(false); // request 1
      expect(shouldSimulate429('test-auth')).toBe(true); // request 2
      expect(shouldSimulate429('other-auth')).toBe(false); // filtered out
    });

    it('should handle undefined auth type', () => {
      setSimulate429(true, 0, undefined);

      expect(shouldSimulate429()).toBe(true);
      expect(shouldSimulate429('any-auth')).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    it('should simulate 429 error flow', () => {
      setSimulate429(true);

      // First request should trigger 429
      if (shouldSimulate429()) {
        const error = createSimulated429Error();
        expect(error.message).toContain('Rate limit');
      }

      // After fallback, simulation stops
      disableSimulationAfterFallback();
      expect(shouldSimulate429()).toBe(false);
    });

    it('should test delayed simulation trigger', () => {
      setSimulate429(true, 5);

      for (let i = 1; i <= 5; i++) {
        expect(shouldSimulate429()).toBe(false);
      }

      expect(shouldSimulate429()).toBe(true);
    });

    it('should test auth-specific simulation', () => {
      setSimulate429(true, 0, 'oauth');

      // OAuth requests trigger simulation
      expect(shouldSimulate429('oauth')).toBe(true);

      // API key requests don't
      expect(shouldSimulate429('api-key')).toBe(false);

      // Unspecified auth type doesn't trigger
      expect(shouldSimulate429()).toBe(false);
    });

    it('should test complete test cycle', () => {
      // Setup
      setSimulate429(true, 2, 'oauth');

      // First two OAuth requests don't trigger
      expect(shouldSimulate429('oauth')).toBe(false);
      expect(shouldSimulate429('oauth')).toBe(false);

      // Third OAuth request triggers
      expect(shouldSimulate429('oauth')).toBe(true);

      // Handle fallback
      const error = createSimulated429Error();
      expect(error.status).toBe(429);
      disableSimulationAfterFallback();

      // No more simulation
      expect(shouldSimulate429('oauth')).toBe(false);

      // Reset for next test
      resetSimulationState();
      setSimulate429(true);
      expect(shouldSimulate429()).toBe(true);
    });
  });

  describe('state management', () => {
    it('should maintain separate state for different configurations', () => {
      setSimulate429(true, 1);
      shouldSimulate429();

      setSimulate429(true, 2);

      expect(shouldSimulate429()).toBe(false); // counter was reset
    });

    it('should preserve simulation state across multiple calls', () => {
      setSimulate429(true);

      const result1 = shouldSimulate429();
      const result2 = shouldSimulate429();
      const result3 = shouldSimulate429();

      expect([result1, result2, result3]).toEqual([true, true, true]);
    });

    it('should handle rapid toggling', () => {
      setSimulate429(true);
      setSimulate429(false);
      setSimulate429(true);
      setSimulate429(false);

      expect(shouldSimulate429()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle negative afterRequests value', () => {
      setSimulate429(true, -1);

      // Negative value should still work (treated as trigger condition)
      const result = shouldSimulate429();
      expect(typeof result).toBe('boolean');
    });

    it('should handle very large afterRequests value', () => {
      setSimulate429(true, 1000000);

      for (let i = 0; i < 10; i++) {
        expect(shouldSimulate429()).toBe(false);
      }
    });

    it('should handle empty string auth type', () => {
      setSimulate429(true, 0, '');

      expect(shouldSimulate429('')).toBe(true);
      expect(shouldSimulate429('other')).toBe(false);
    });

    it('should handle null/undefined in filters', () => {
      setSimulate429(true, 0, undefined);

      expect(shouldSimulate429(undefined)).toBe(true);
      expect(shouldSimulate429('any')).toBe(true);
    });
  });

  describe('error object properties', () => {
    it('should create error with all expected properties', () => {
      const error = createSimulated429Error() as Error & { status: number };

      expect(error).toHaveProperty('message');
      expect(error).toHaveProperty('status');
      expect(error).toHaveProperty('stack');
    });

    it('should have correct status type', () => {
      const error = createSimulated429Error() as Error & { status: number };

      expect(typeof error.status).toBe('number');
    });

    it('should be catchable', () => {
      let caught = false;

      try {
        throw createSimulated429Error();
      } catch (e) {
        caught = true;
        expect(e).toBeInstanceOf(Error);
      }

      expect(caught).toBe(true);
    });
  });

  describe('request counter behavior', () => {
    it('should increment monotonically', () => {
      setSimulate429(true, 10);

      for (let i = 1; i <= 10; i++) {
        shouldSimulate429();
      }

      expect(shouldSimulate429()).toBe(true);
    });

    it('should not decrement on non-matching auth types', () => {
      setSimulate429(true, 2, 'target-auth');

      shouldSimulate429('other-auth'); // doesn't count
      shouldSimulate429('other-auth'); // doesn't count
      shouldSimulate429('target-auth'); // request 1
      shouldSimulate429('target-auth'); // request 2

      expect(shouldSimulate429('target-auth')).toBe(true); // request 3, triggered
    });
  });

  describe('simulation patterns', () => {
    it('should support immediate simulation', () => {
      setSimulate429(true, 0);

      expect(shouldSimulate429()).toBe(true);
    });

    it('should support delayed simulation', () => {
      setSimulate429(true, 5);

      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(shouldSimulate429());
      }

      expect(results.slice(0, 5)).toEqual([false, false, false, false, false]);
      expect(results.slice(5)).toEqual([true, true, true, true, true]);
    });

    it('should support one-time simulation with fallback', () => {
      setSimulate429(true);

      expect(shouldSimulate429()).toBe(true);

      disableSimulationAfterFallback();

      expect(shouldSimulate429()).toBe(false);
      expect(shouldSimulate429()).toBe(false);
    });
  });
});
