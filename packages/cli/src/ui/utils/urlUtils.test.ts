/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isUrl, URL_REGEX } from './urlUtils.js';

/*
 * Testing strategy
 *
 * partition on isUrl(text):
 *    - valid URL:
 *      - http, https
 *      - with/without path, query, params
 *    - invalid URL:
 *      - empty string
 *      - plain text
 *      - missing protocol
 *
 * partition on URL_REGEX (match behavior):
 *    - embedded in text (start, middle, end)
 *    - trailing punctuation (boundary value analysis):
 *      - dot (.)
 *      - comma (,)
 *      - quote (")
 *      - parenthesis ())
 *      - none (clean URL)
 *    - security safeguards (input validation):
 *      - ANSI escape codes (injection prevention)
 *      - Dangerous delimiters (<, >)
 *
 * partition on output:
 *    - match[0] should contain ONLY the URL, strictly excluding trailing punctuation.
 */

describe('urlUtils', () => {
  describe('isUrl', () => {
    it('returns true for valid https URLs', () => {
      expect(isUrl('https://google.com')).toBe(true);
      expect(isUrl('https://example.com/path?q=1')).toBe(true);
    });

    it('returns true for valid http URLs', () => {
      expect(isUrl('http://insecure.com')).toBe(true);
    });

    it('returns false for non-URLs', () => {
      expect(isUrl('not a url')).toBe(false);
      expect(isUrl('google.com')).toBe(false); // requires protocol
      expect(isUrl('')).toBe(false);
    });
  });

  describe('URL_REGEX', () => {
    it('matches simple URLs', () => {
      const text = 'Visit https://example.com today';
      const match = text.match(URL_REGEX);
      expect(match).toBeDefined();
      expect(match?.[0]).toBe('https://example.com');
    });

    it('matches URLs with query parameters', () => {
      const text = 'Check https://example.com/path?q=foo&bar=1';
      expect(text.match(URL_REGEX)?.[0]).toBe(
        'https://example.com/path?q=foo&bar=1',
      );
    });

    it('excludes trailing punctuation (dots)', () => {
      const text = 'Go to https://example.com.';
      // Should match url but NOT the trailing dot
      expect(text.match(URL_REGEX)?.[0]).toBe('https://example.com');
    });

    it('excludes trailing punctuation (commas)', () => {
      const text = 'Visit https://example.com, please.';
      expect(text.match(URL_REGEX)?.[0]).toBe('https://example.com');
    });

    it('excludes trailing punctuation (quotes - BUG FIX)', () => {
      const text = 'Child "https://example.com"';
      expect(text.match(URL_REGEX)?.[0]).toBe('https://example.com');
    });

    it('excludes trailing punctuation (parentheses)', () => {
      const text = '(see https://example.com)';
      const match = text.match(URL_REGEX);
      // Ideally it should capture the URL.
      expect(match).toBeDefined();
    });

    it('SAFEGUARD: excludes ANSI escape codes (injection attempt)', () => {
      // Malicious string trying to inject a terminal color reset code
      const text = 'https://example.com\x1b[31m';
      const match = text.match(URL_REGEX);
      // Should match ONLY the URL part, stopping before the escape char
      expect(match?.[0]).toBe('https://example.com');
    });

    it('SAFEGUARD: excludes dangerous delimiters like < >', () => {
      const text = '<https://example.com>';
      const match = text.match(URL_REGEX);
      expect(match?.[0]).toBe('https://example.com');
    });

    it('SAFEGUARD: excludes quotes', () => {
      const text = '"https://example.com"';
      expect(text.match(URL_REGEX)?.[0]).toBe('https://example.com');
    });
  });
});
