/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { FetchError, isPrivateIp } from './fetch.js';

describe('isPrivateIp', () => {
  describe('IPv4 private ranges (RFC 1918)', () => {
    it('should detect 10.x.x.x private range', () => {
      expect(isPrivateIp('http://10.0.0.1')).toBe(true);
      expect(isPrivateIp('https://10.255.255.255')).toBe(true);
      expect(isPrivateIp('http://10.1.2.3:8080')).toBe(true);
      expect(isPrivateIp('https://10.0.0.1/path?query=value')).toBe(true);
    });

    it('should detect 172.16-31.x.x private range', () => {
      expect(isPrivateIp('http://172.16.0.1')).toBe(true);
      expect(isPrivateIp('https://172.31.255.255')).toBe(true);
      expect(isPrivateIp('http://172.20.1.1:3000')).toBe(true);
      expect(isPrivateIp('https://172.25.10.20/api/test')).toBe(true);
    });

    it('should detect 192.168.x.x private range', () => {
      expect(isPrivateIp('http://192.168.1.1')).toBe(true);
      expect(isPrivateIp('https://192.168.255.255')).toBe(true);
      expect(isPrivateIp('http://192.168.0.1:8080')).toBe(true);
      expect(isPrivateIp('https://192.168.1.100/admin')).toBe(true);
    });

    it('should not detect IPs outside private ranges', () => {
      expect(isPrivateIp('http://9.255.255.255')).toBe(false); // Just below 10.x
      expect(isPrivateIp('http://11.0.0.1')).toBe(false); // Just above 10.x
      expect(isPrivateIp('http://172.15.255.255')).toBe(false); // Just below 172.16
      expect(isPrivateIp('http://172.32.0.1')).toBe(false); // Just above 172.31
      expect(isPrivateIp('http://192.167.255.255')).toBe(false); // Just below 192.168
      expect(isPrivateIp('http://192.169.0.1')).toBe(false); // Just above 192.168
    });
  });

  describe('IPv4 loopback and localhost', () => {
    it('should detect 127.x.x.x loopback range', () => {
      expect(isPrivateIp('http://127.0.0.1')).toBe(true);
      expect(isPrivateIp('https://127.0.0.1:8080')).toBe(true);
      expect(isPrivateIp('http://127.255.255.255')).toBe(true);
      expect(isPrivateIp('https://127.1.2.3/path')).toBe(true);
    });

    it('should detect localhost (URL normalizes to lowercase)', () => {
      expect(isPrivateIp('http://localhost')).toBe(true);
      expect(isPrivateIp('https://localhost:3000')).toBe(true);
      expect(isPrivateIp('http://localhost/path')).toBe(true);
      // URL constructor normalizes hostname to lowercase
      expect(isPrivateIp('http://LOCALHOST')).toBe(true);
    });
  });

  describe('IPv6 addresses', () => {
    it('should detect IPv6 loopback (::1)', () => {
      expect(isPrivateIp('http://[::1]')).toBe(true);
      expect(isPrivateIp('https://[::1]:8080')).toBe(true);
      expect(isPrivateIp('http://[::1]/path')).toBe(true);
    });

    it('should detect IPv6 unique local addresses (fc00: prefix)', () => {
      expect(isPrivateIp('http://[fc00::1]')).toBe(true);
      expect(isPrivateIp('https://[fc00:1234:5678:9abc::1]')).toBe(true);
      expect(
        isPrivateIp('http://[fc00:ffff:ffff:ffff:ffff:ffff:ffff:ffff]:3000'),
      ).toBe(true);
      expect(isPrivateIp('https://[fc00::]/api')).toBe(true);
    });

    it('should detect IPv6 link-local addresses (fe80::/10)', () => {
      expect(isPrivateIp('http://[fe80::1]')).toBe(true);
      expect(
        isPrivateIp('https://[fe80:0000:0000:0000:0000:0000:0000:0001]'),
      ).toBe(true);
      expect(isPrivateIp('http://[fe80::abcd:ef12:3456:7890]:8080')).toBe(true);
      expect(isPrivateIp('https://[fe80::]/path')).toBe(true);
    });

    it('should not detect IPv4-mapped IPv6 addresses (not in simplified patterns)', () => {
      expect(isPrivateIp('http://[::ffff:127.0.0.1]')).toBe(false);
      expect(isPrivateIp('https://[::ffff:127.255.255.255]:3000')).toBe(false);
      expect(isPrivateIp('http://[::ffff:127.1.2.3]/api')).toBe(false);
    });

    it('should not detect public IPv6 addresses', () => {
      expect(isPrivateIp('http://[2001:db8::1]')).toBe(false); // Documentation prefix
      expect(isPrivateIp('https://[2607:f8b0:4004:c1b::65]')).toBe(false); // Google IPv6
      expect(isPrivateIp('http://[2a00:1450:4001:810::200e]')).toBe(false); // Google IPv6
    });
  });

  describe('Public addresses', () => {
    it('should not detect public IPv4 addresses', () => {
      expect(isPrivateIp('http://8.8.8.8')).toBe(false); // Google DNS
      expect(isPrivateIp('https://1.1.1.1')).toBe(false); // Cloudflare DNS
      expect(isPrivateIp('http://208.67.222.222')).toBe(false); // OpenDNS
      expect(isPrivateIp('https://151.101.193.140')).toBe(false); // Reddit
    });

    it('should not detect public domain names', () => {
      expect(isPrivateIp('http://google.com')).toBe(false);
      expect(isPrivateIp('https://example.com')).toBe(false);
      expect(isPrivateIp('http://github.com')).toBe(false);
      expect(isPrivateIp('https://stackoverflow.com')).toBe(false);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle invalid URLs gracefully', () => {
      expect(isPrivateIp('not-a-url')).toBe(false);
      expect(isPrivateIp('ftp://127.0.0.1')).toBe(true); // Different protocol but valid URL
      expect(isPrivateIp('http://')).toBe(false); // Invalid URL
      expect(isPrivateIp('')).toBe(false); // Empty string
      expect(isPrivateIp('://localhost')).toBe(false); // Malformed URL
    });

    it('should handle URLs with paths, queries, and fragments', () => {
      expect(
        isPrivateIp('http://127.0.0.1/some/path?query=value#fragment'),
      ).toBe(true);
      expect(
        isPrivateIp('https://localhost:8080/api/v1/users?limit=10&offset=0'),
      ).toBe(true);
      expect(isPrivateIp('http://192.168.1.1:3000/admin#dashboard')).toBe(true);
      expect(
        isPrivateIp('https://10.0.0.1/very/long/path/with/many/segments'),
      ).toBe(true);
    });

    it('should handle URLs with userinfo (should not affect hostname detection)', () => {
      expect(isPrivateIp('http://user:pass@127.0.0.1')).toBe(true);
      expect(isPrivateIp('https://admin@localhost:8080')).toBe(true);
      expect(isPrivateIp('http://test:secret@192.168.1.1/path')).toBe(true);
    });

    it('should handle special characters in URLs', () => {
      expect(isPrivateIp('http://127.0.0.1/path with spaces')).toBe(true);
      expect(isPrivateIp('https://localhost/path%20encoded')).toBe(true);
    });
  });

  describe('Case sensitivity', () => {
    it('should handle URL normalization to lowercase', () => {
      expect(isPrivateIp('http://[fc00::1]')).toBe(true); // Lowercase
      expect(isPrivateIp('http://[fe80::1]')).toBe(true); // Lowercase
      // URL constructor normalizes IPv6 addresses to lowercase
      expect(isPrivateIp('http://[FC00::1]')).toBe(true);
      expect(isPrivateIp('http://[FE80::1]')).toBe(true);
    });
  });
});

describe('FetchError', () => {
  it('should create FetchError with message and optional code', () => {
    const error1 = new FetchError('Test error');
    expect(error1.message).toBe('Test error');
    expect(error1.name).toBe('FetchError');
    expect(error1.code).toBeUndefined();

    const error2 = new FetchError('Timeout error', 'ETIMEDOUT');
    expect(error2.message).toBe('Timeout error');
    expect(error2.name).toBe('FetchError');
    expect(error2.code).toBe('ETIMEDOUT');
  });

  it('should be an instance of Error', () => {
    const error = new FetchError('Test error');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FetchError);
  });
});
