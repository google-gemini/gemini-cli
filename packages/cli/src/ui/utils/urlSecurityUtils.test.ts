/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  isDeceptiveUrl,
  getDeceptiveUrlDetails,
  toUnicodeUrl,
} from './urlSecurityUtils.js';

describe('urlSecurityUtils', () => {
  describe('toUnicodeUrl', () => {
    it('should convert a Punycode URL string to its Unicode version', () => {
      expect(toUnicodeUrl('https://xn--tst-qla.com/')).toBe(
        'https://täst.com/',
      );
    });

    it('should convert a URL object to its Unicode version', () => {
      const urlObj = new URL('https://xn--tst-qla.com/path');
      expect(toUnicodeUrl(urlObj)).toBe('https://täst.com/path');
    });

    it('should handle complex URLs with credentials and ports', () => {
      const complexUrl = 'https://user:pass@xn--tst-qla.com:8080/path?q=1#hash';
      expect(toUnicodeUrl(complexUrl)).toBe(
        'https://user:pass@täst.com:8080/path?q=1#hash',
      );
    });

    it('should correctly reconstruct the URL even if the hostname appears in the path', () => {
      const urlWithHostnameInPath =
        'https://xn--tst-qla.com/some/path/xn--tst-qla.com/index.html';
      expect(toUnicodeUrl(urlWithHostnameInPath)).toBe(
        'https://täst.com/some/path/xn--tst-qla.com/index.html',
      );
    });

    it('should return the original string if URL parsing fails', () => {
      expect(toUnicodeUrl('not a url')).toBe('not a url');
    });

    it('should return the original string for already safe URLs', () => {
      expect(toUnicodeUrl('https://google.com/')).toBe('https://google.com/');
    });
  });

  describe('isDeceptiveUrl', () => {
    it('should return false for standard ASCII URLs', () => {
      expect(isDeceptiveUrl('https://google.com')).toBe(false);
      expect(isDeceptiveUrl('https://example.org/path?q=1')).toBe(false);
      expect(isDeceptiveUrl('http://localhost:8080')).toBe(false);
    });

    it('should return true for non-ASCII characters in hostnames', () => {
      expect(isDeceptiveUrl('https://täst.com')).toBe(true);
    });

    it('should return true for deceptive homoglyphs', () => {
      // Using Cyrillic 'е' (U+0435) instead of Latin 'e'
      expect(isDeceptiveUrl('https://еxample.com')).toBe(true);
    });

    it('should return false for non-URL strings', () => {
      expect(isDeceptiveUrl('just a string')).toBe(false);
      expect(isDeceptiveUrl('google.com')).toBe(false);
    });
  });

  describe('getDeceptiveUrlDetails', () => {
    it('should return full details for a deceptive URL', () => {
      const details = getDeceptiveUrlDetails('https://еxample.com');
      expect(details).not.toBeNull();
      expect(details?.originalUrl).toBe('https://еxample.com/');
      expect(details?.punycodeUrl).toBe('https://xn--xample-2of.com/');
    });

    it('should return null for safe URLs', () => {
      expect(getDeceptiveUrlDetails('https://google.com')).toBeNull();
    });

    it('should handle already Punycoded hostnames', () => {
      const details = getDeceptiveUrlDetails('https://xn--tst-qla.com');
      expect(details).not.toBeNull();
      expect(details?.originalUrl).toBe('https://täst.com/');
    });
  });
});
