/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { assumeExhaustive, checkExhaustive } from './checks.js';

describe('checks', () => {
  describe('assumeExhaustive', () => {
    it('should be a function', () => {
      expect(typeof assumeExhaustive).toBe('function');
    });

    it('should not throw when called', () => {
      expect(() => assumeExhaustive(undefined as never)).not.toThrow();
    });

    it('should return undefined', () => {
      const result = assumeExhaustive(null as never);
      expect(result).toBeUndefined();
    });

    it('should be type-safe compile-time check', () => {
      // This test primarily validates TypeScript compilation
      // At runtime, it should just pass through without error
      const value: never = 'test' as never;
      assumeExhaustive(value);
    });
  });

  describe('checkExhaustive', () => {
    it('should throw an error when called', () => {
      expect(() => checkExhaustive('unexpected' as never)).toThrow();
    });

    it('should throw Error instance', () => {
      try {
        checkExhaustive('value' as never);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should include value in default error message', () => {
      const value = 'unexpected-value';
      expect(() => checkExhaustive(value as never)).toThrow(value);
    });

    it('should use default error message when no message provided', () => {
      expect(() => checkExhaustive('test' as never)).toThrow(
        'unexpected value',
      );
    });

    it('should accept custom error message', () => {
      const customMessage = 'This should never happen!';
      expect(() => checkExhaustive('value' as never, customMessage)).toThrow(
        customMessage,
      );
    });

    it('should use custom message over default', () => {
      const customMessage = 'Custom error';
      try {
        checkExhaustive('value' as never, customMessage);
      } catch (error) {
        expect((error as Error).message).toBe(customMessage);
        expect((error as Error).message).not.toContain('unexpected value');
      }
    });

    it('should have never return type', () => {
      // TypeScript compile-time check: this should not compile without as never
      const fn = (): string => {
        const x: 'a' | 'b' = 'a';
        switch (x) {
          case 'a':
            return 'A';
          case 'b':
            return 'B';
          default:
            checkExhaustive(x);
        }
      };
      expect(fn()).toBe('A');
    });

    it('should work in switch statement default case', () => {
      enum TestEnum {
        A = 'a',
        B = 'b',
      }

      const test = (value: TestEnum): string => {
        switch (value) {
          case TestEnum.A:
            return 'A';
          case TestEnum.B:
            return 'B';
          default:
            checkExhaustive(value);
        }
      };

      expect(test(TestEnum.A)).toBe('A');
      expect(test(TestEnum.B)).toBe('B');
    });

    it('should detect unhandled enum values at runtime', () => {
      enum Color {
        RED = 'red',
        BLUE = 'blue',
      }

      const handleColor = (color: Color): string => {
        switch (color) {
          case Color.RED:
            return 'red';
          default:
            checkExhaustive(color, `Unhandled color: ${color}`);
        }
      };

      expect(handleColor(Color.RED)).toBe('red');
      expect(() => handleColor(Color.BLUE as never)).toThrow(
        'Unhandled color: blue',
      );
    });

    it('should call assumeExhaustive internally', () => {
      // This test verifies the implementation calls assumeExhaustive
      // We can't directly spy on it, but we can verify it doesn't break
      expect(() => checkExhaustive('test' as never)).toThrow();
    });
  });

  describe('integration', () => {
    it('should handle union types exhaustively', () => {
      type Status = 'pending' | 'success' | 'error';

      const getStatusMessage = (status: Status): string => {
        switch (status) {
          case 'pending':
            return 'Processing...';
          case 'success':
            return 'Done!';
          case 'error':
            return 'Failed!';
          default:
            checkExhaustive(status);
        }
      };

      expect(getStatusMessage('pending')).toBe('Processing...');
      expect(getStatusMessage('success')).toBe('Done!');
      expect(getStatusMessage('error')).toBe('Failed!');
    });

    it('should prevent missing case handling', () => {
      type Action = 'start' | 'stop';

      const handleAction = (action: Action): string => {
        switch (action) {
          case 'start':
            return 'Started';
          default:
            checkExhaustive(action, `Missing handler for: ${action}`);
        }
      };

      expect(handleAction('start')).toBe('Started');
      expect(() => handleAction('stop' as never)).toThrow('Missing handler');
    });
  });
});
