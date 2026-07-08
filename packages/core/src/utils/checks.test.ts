/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { checkExhaustive, assumeExhaustive } from './checks.js';

describe('checks', () => {
  describe('checkExhaustive', () => {
    it('should throw an error with default message', () => {
      expect(() => {
        checkExhaustive('unexpected' as never);
      }).toThrow('unexpected value unexpected!');
    });

    it('should throw an error with custom message', () => {
      expect(() => {
        checkExhaustive('unexpected' as never, 'custom message');
      }).toThrow('custom message');
    });
  });

  describe('assumeExhaustive', () => {
    it('should do nothing', () => {
      expect(() => {
        assumeExhaustive('unexpected' as never);
      }).not.toThrow();
    });
  });
});
