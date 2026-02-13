/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { detectHomograph } from './urlSecurityUtils.js';

describe('urlSecurityUtils', () => {
  describe('detectHomograph', () => {
    it('should return null for standard ASCII URLs', () => {
      expect(detectHomograph('https://google.com')).toBeNull();
      expect(detectHomograph('https://example.org/path?q=1')).toBeNull();
      expect(detectHomograph('http://localhost:8080')).toBeNull();
    });

    it('should detect non-ASCII characters in hostnames', () => {
      const result = detectHomograph('https://täst.com');
      expect(result).not.toBeNull();
      expect(result?.original).toBe('https://täst.com');
      expect(result?.punycodeHost).toBe('xn--tst-qla.com');
      expect(result?.punycode).toBe('https://xn--tst-qla.com/');
    });

    it('should detect deceptive homoglyphs', () => {
      // Using Cyrillic 'е' (U+0435) instead of Latin 'e'
      const result = detectHomograph('https://еxample.com');
      expect(result).not.toBeNull();
      expect(result?.punycodeHost).toBe('xn--xample-2of.com');
    });

    it('should detect already Punycoded hostnames', () => {
      const result = detectHomograph('https://xn--tst-qla.com');
      expect(result).not.toBeNull();
      expect(result?.punycodeHost).toBe('xn--tst-qla.com');
    });

    it('should return null for non-URL strings', () => {
      expect(detectHomograph('just a string')).toBeNull();
      expect(detectHomograph('google.com')).toBeNull(); // Missing scheme
    });

    it('should handle complex URLs with paths and queries', () => {
      const result = detectHomograph(
        'https://täst.com/path/to/file?query=true#hash',
      );
      expect(result).not.toBeNull();
      expect(result?.punycodeHost).toBe('xn--tst-qla.com');
      expect(result?.punycode).toBe(
        'https://xn--tst-qla.com/path/to/file?query=true#hash',
      );
    });

    it('should be case-insensitive for Punycode detection', () => {
      const result = detectHomograph('https://XN--TST-QLA.com');
      expect(result).not.toBeNull();
      expect(result?.punycodeHost).toBe('xn--tst-qla.com');
    });
  });
});
