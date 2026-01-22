/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatHyperlink, formatClickableUrl } from './terminal.js';

describe('terminal hyperlink utilities', () => {
  describe('formatHyperlink', () => {
    describe('basic functionality', () => {
      it('should create an OSC 8 hyperlink with the URL as display text by default', () => {
        const url = 'https://example.com';
        const result = formatHyperlink(url);

        // OSC 8 format: \x1b]8;;URL\x07TEXT\x1b]8;;\x07
        expect(result).toBe(
          '\x1b]8;;https://example.com\x07https://example.com\x1b]8;;\x07',
        );
      });

      it('should create an OSC 8 hyperlink with custom display text', () => {
        const url = 'https://example.com/auth?param=value';
        const displayText = 'Click here';
        const result = formatHyperlink(url, displayText);

        expect(result).toBe(
          '\x1b]8;;https://example.com/auth?param=value\x07Click here\x1b]8;;\x07',
        );
      });

      it('should have correct escape sequence structure', () => {
        const url = 'https://test.com';
        const text = 'Test Link';
        const result = formatHyperlink(url, text);

        // Verify the escape sequence structure
        const startSequence = '\x1b]8;;';
        const separator = '\x07';
        const endSequence = '\x1b]8;;\x07';

        expect(result.startsWith(startSequence)).toBe(true);
        expect(result.endsWith(endSequence)).toBe(true);
        expect(result.includes(separator)).toBe(true);

        // Parse the structure
        const afterStart = result.slice(startSequence.length);
        const urlEndIndex = afterStart.indexOf(separator);
        const extractedUrl = afterStart.slice(0, urlEndIndex);
        expect(extractedUrl).toBe(url);
      });
    });

    describe('URL edge cases', () => {
      it('should handle URLs with query parameters', () => {
        const url = 'https://example.com/path?foo=bar&baz=qux';
        const result = formatHyperlink(url, 'Link');

        expect(result).toContain(url);
        expect(result).toContain('foo=bar');
        expect(result).toContain('baz=qux');
      });

      it('should handle URLs with URL-encoded characters', () => {
        const url =
          'https://example.com/path?scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcloud-platform';
        const result = formatHyperlink(url, 'Link');

        expect(result).toContain(url);
        expect(result).toContain('%3A%2F%2F');
      });

      it('should handle URLs with hash fragments', () => {
        const url = 'https://example.com/page#section-1';
        const result = formatHyperlink(url, 'Link');

        expect(result).toContain(url);
        expect(result).toContain('#section-1');
      });

      it('should handle URLs with port numbers', () => {
        const url = 'http://localhost:3000/oauth2callback';
        const result = formatHyperlink(url, 'Callback');

        expect(result).toContain(url);
        expect(result).toContain(':3000');
      });

      it('should handle URLs with authentication info', () => {
        const url = 'https://user:pass@example.com/path';
        const result = formatHyperlink(url, 'Auth Link');

        expect(result).toContain(url);
      });

      it('should handle file:// URLs', () => {
        const url = 'file:///home/user/document.pdf';
        const result = formatHyperlink(url, 'Local File');

        expect(result).toContain(url);
      });

      it('should handle mailto: URLs', () => {
        const url = 'mailto:support@example.com?subject=Help';
        const result = formatHyperlink(url, 'Email Support');

        expect(result).toContain(url);
      });

      it('should handle very long OAuth URLs that would normally wrap', () => {
        // Simulate a real OAuth URL that would cause wrapping issues
        const longUrl =
          'https://accounts.google.com/o/oauth2/v2/auth?' +
          'client_id=681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com&' +
          'redirect_uri=http://localhost:3000/oauth2callback&' +
          'access_type=offline&' +
          'scope=https://www.googleapis.com/auth/cloud-platform%20https://www.googleapis.com/auth/userinfo.email%20https://www.googleapis.com/auth/userinfo.profile&' +
          'state=abc123def456789xyz&' +
          'code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&' +
          'code_challenge_method=S256';

        const result = formatHyperlink(longUrl, '🔗 Click here to authenticate');

        // The hyperlink should contain the full URL without any truncation
        expect(result).toContain(longUrl);
        expect(result).toContain('access_type=offline');
        expect(result).toContain('code_challenge_method=S256');
        // The display text should be short
        expect(result).toContain('🔗 Click here to authenticate');
        // The structure should be correct
        expect(result.startsWith('\x1b]8;;')).toBe(true);
        expect(result.endsWith('\x1b]8;;\x07')).toBe(true);
      });

      it('should handle URLs with international domain names', () => {
        const url = 'https://例え.jp/path';
        const result = formatHyperlink(url, 'Japanese Site');

        expect(result).toContain(url);
      });

      it('should handle URLs with IPv6 addresses', () => {
        const url = 'http://[::1]:8080/api';
        const result = formatHyperlink(url, 'IPv6 Link');

        expect(result).toContain(url);
      });
    });

    describe('display text edge cases', () => {
      it('should handle empty display text', () => {
        const url = 'https://example.com';
        const result = formatHyperlink(url, '');

        // Empty string should be used as-is
        expect(result).toBe('\x1b]8;;https://example.com\x07\x1b]8;;\x07');
      });

      it('should handle display text with emoji', () => {
        const url = 'https://example.com';
        const result = formatHyperlink(url, '🔗 📎 Click 👆');

        expect(result).toContain('🔗 📎 Click 👆');
      });

      it('should handle display text with special characters', () => {
        const url = 'https://example.com';
        const result = formatHyperlink(url, 'Click <here> & "authenticate"');

        expect(result).toContain('Click <here> & "authenticate"');
      });

      it('should handle display text with newlines (though not recommended)', () => {
        const url = 'https://example.com';
        const result = formatHyperlink(url, 'Line1\nLine2');

        expect(result).toContain('Line1\nLine2');
      });

      it('should handle display text with tabs', () => {
        const url = 'https://example.com';
        const result = formatHyperlink(url, 'Tab\there');

        expect(result).toContain('Tab\there');
      });

      it('should handle very long display text', () => {
        const url = 'https://example.com';
        const longText = 'A'.repeat(1000);
        const result = formatHyperlink(url, longText);

        expect(result).toContain(longText);
        expect(result).toContain(url);
      });

      it('should handle Unicode characters in display text', () => {
        const url = 'https://example.com';
        const result = formatHyperlink(url, '点击这里 • Нажмите здесь');

        expect(result).toContain('点击这里 • Нажмите здесь');
      });

      it('should handle display text with ANSI escape codes', () => {
        const url = 'https://example.com';
        // Bold text
        const result = formatHyperlink(url, '\x1b[1mBold Link\x1b[0m');

        expect(result).toContain('\x1b[1mBold Link\x1b[0m');
      });
    });

    describe('boundary conditions', () => {
      it('should handle empty URL', () => {
        const result = formatHyperlink('', 'Empty Link');

        expect(result).toBe('\x1b]8;;\x07Empty Link\x1b]8;;\x07');
      });

      it('should handle both URL and display text empty', () => {
        const result = formatHyperlink('', '');

        expect(result).toBe('\x1b]8;;\x07\x1b]8;;\x07');
      });

      it('should handle URL with only protocol', () => {
        const result = formatHyperlink('https://', 'Protocol Only');

        expect(result).toContain('https://');
      });

      it('should handle undefined display text (should use URL)', () => {
        const url = 'https://example.com';
        const result = formatHyperlink(url, undefined);

        // Should fall back to URL as display text
        expect(result).toBe(
          '\x1b]8;;https://example.com\x07https://example.com\x1b]8;;\x07',
        );
      });

      it('should not modify URLs with existing escape sequences', () => {
        // Edge case: URL that happens to contain escape-like sequences
        const url = 'https://example.com/path?data=%1b%5b';
        const result = formatHyperlink(url, 'Link');

        expect(result).toContain(url);
      });
    });

    describe('security considerations', () => {
      it('should preserve javascript: URLs (terminal handles safety)', () => {
        const url = 'javascript:alert(1)';
        const result = formatHyperlink(url, 'JS Link');

        // We don't sanitize - terminal emulators handle this
        expect(result).toContain(url);
      });

      it('should preserve data: URLs', () => {
        const url = 'data:text/html,<h1>Hello</h1>';
        const result = formatHyperlink(url, 'Data Link');

        expect(result).toContain(url);
      });
    });
  });

  describe('formatClickableUrl', () => {
    describe('basic functionality', () => {
      it('should format a URL with default label and plain text fallback', () => {
        const url = 'https://example.com/auth';
        const result = formatClickableUrl(url);

        // Should contain the hyperlink
        expect(result).toContain('\x1b]8;;');
        expect(result).toContain('🔗 Click here to open');
        // Should contain the plain URL for copying
        expect(result).toContain('Or copy this URL');
        expect(result).toContain(url);
      });

      it('should format a URL with custom label', () => {
        const url = 'https://example.com/auth';
        const label = 'Authenticate Now';
        const result = formatClickableUrl(url, label);

        expect(result).toContain(label);
        expect(result).toContain(url);
      });

      it('should include the URL twice (once in hyperlink, once as plain text)', () => {
        const url = 'https://example.com/unique-url-12345';
        const result = formatClickableUrl(url);

        // Count occurrences of the URL
        const matches = result.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
        expect(matches).toHaveLength(2);
      });
    });

    describe('output structure', () => {
      it('should have hyperlink before plain text', () => {
        const url = 'https://example.com';
        const result = formatClickableUrl(url);

        const hyperlinkIndex = result.indexOf('\x1b]8;;');
        const plainTextIndex = result.indexOf('Or copy this URL');

        expect(hyperlinkIndex).toBeLessThan(plainTextIndex);
      });

      it('should have proper line breaks for readability', () => {
        const url = 'https://example.com';
        const result = formatClickableUrl(url);

        expect(result).toContain('\n');
        // Should have at least one blank line between hyperlink and instructions
        expect(result).toContain('\n\n');
      });
    });

    describe('edge cases', () => {
      it('should handle very long URLs', () => {
        const longUrl =
          'https://accounts.google.com/o/oauth2/v2/auth?' +
          'client_id=681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com&' +
          'redirect_uri=http://localhost:3000/oauth2callback&' +
          'access_type=offline&' +
          'scope=https://www.googleapis.com/auth/cloud-platform';

        const result = formatClickableUrl(longUrl);

        // Should contain the full URL without truncation
        expect(result).toContain(longUrl);
        expect(result).toContain('access_type=offline');
      });

      it('should handle empty label (uses empty string as label)', () => {
        const url = 'https://example.com';
        const result = formatClickableUrl(url, '');

        // Empty string is a valid string, so it's used as the label
        // The hyperlink structure should still be valid
        expect(result).toContain('\x1b]8;;');
        expect(result).toContain(url);
        expect(result).toContain('Or copy this URL');
      });

      it('should handle URL with spaces (unusual but possible)', () => {
        const url = 'https://example.com/path with spaces';
        const result = formatClickableUrl(url);

        expect(result).toContain(url);
      });
    });
  });

  describe('OSC 8 compliance', () => {
    it('should use correct OSC 8 start sequence (ESC ] 8 ; ;)', () => {
      const result = formatHyperlink('https://example.com', 'Link');

      // \x1b is ESC, ] is literal, 8;; follows
      expect(result.startsWith('\x1b]8;;')).toBe(true);
    });

    it('should use BEL (\\x07) as string terminator', () => {
      const result = formatHyperlink('https://example.com', 'Link');

      // Should have BEL after URL and at the end
      expect(result).toContain('\x07');
      expect(result.split('\x07').length).toBe(3); // URL\x07TEXT\x07 = 3 parts
    });

    it('should use correct OSC 8 end sequence (ESC ] 8 ; ; BEL)', () => {
      const result = formatHyperlink('https://example.com', 'Link');

      expect(result.endsWith('\x1b]8;;\x07')).toBe(true);
    });

    it('should produce valid OSC 8 that can be parsed', () => {
      const url = 'https://example.com/path?query=value';
      const text = 'Display Text';
      const result = formatHyperlink(url, text);

      // Parse the OSC 8 sequence
      const osc8Regex = /\x1b\]8;;([^\x07]*)\x07([^\x1b]*)\x1b\]8;;\x07/;
      const match = result.match(osc8Regex);

      expect(match).not.toBeNull();
      expect(match![1]).toBe(url);
      expect(match![2]).toBe(text);
    });
  });
});
