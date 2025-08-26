/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect } from 'vitest';
import { validateDnsResolutionOrder } from './gemini.js';

describe('gemini.tsx', () => {
  describe('validateDnsResolutionOrder', () => {
    it('should work as expected', () => {
      expect(validateDnsResolutionOrder('ipv4first')).toBe('ipv4first');
      expect(validateDnsResolutionOrder('verbatim')).toBe('verbatim');
      expect(validateDnsResolutionOrder(undefined)).toBe('ipv4first');
      expect(validateDnsResolutionOrder('invalid')).toBe('ipv4first');
    });
  });
});