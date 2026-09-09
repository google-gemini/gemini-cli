/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getDeceptiveUrlDetails, toUnicodeUrl } from './urlSecurityUtils.js';

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
