/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOPBACK_HOST,
  formatLoopbackHostForUri,
  normalizeLoopbackHost,
} from './loopback.js';

describe('loopback helpers', () => {
  describe('normalizeLoopbackHost', () => {
    it('returns default when host is undefined', () => {
      expect(normalizeLoopbackHost()).toBe(DEFAULT_LOOPBACK_HOST);
    });

    it('returns default when host is empty after trimming brackets', () => {
      expect(normalizeLoopbackHost('[]')).toBe(DEFAULT_LOOPBACK_HOST);
    });

    it('trims whitespace before processing', () => {
      expect(normalizeLoopbackHost(' [::1] ')).toBe('::1');
    });

    it('strips IPv6 brackets', () => {
      expect(normalizeLoopbackHost('[::1]')).toBe('::1');
    });

    it('leaves IPv4 literal unchanged', () => {
      expect(normalizeLoopbackHost('127.0.0.1')).toBe('127.0.0.1');
    });
  });

  describe('formatLoopbackHostForUri', () => {
    it('wraps IPv6 literal in brackets', () => {
      expect(formatLoopbackHostForUri('::1')).toBe('[::1]');
    });

    it('does not wrap IPv4 literal', () => {
      expect(formatLoopbackHostForUri('127.0.0.1')).toBe('127.0.0.1');
    });
  });
});
