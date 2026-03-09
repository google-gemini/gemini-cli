/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isPrivateIp } from './fetch.js';

describe('isPrivateIp', () => {
  describe('RFC 1918 private ranges', () => {
    it('should block 10.x.x.x (Class A private)', () => {
      expect(isPrivateIp('http://10.0.0.1')).toBe(true);
      expect(isPrivateIp('http://10.255.255.255')).toBe(true);
      expect(isPrivateIp('http://10.0.0.1:8080/path')).toBe(true);
    });

    it('should block 172.16.x.x - 172.31.x.x (Class B private)', () => {
      expect(isPrivateIp('http://172.16.0.1')).toBe(true);
      expect(isPrivateIp('http://172.31.255.255')).toBe(true);
      expect(isPrivateIp('http://172.20.0.1')).toBe(true);
    });

    it('should not block 172.15.x.x or 172.32.x.x (outside private range)', () => {
      expect(isPrivateIp('http://172.15.0.1')).toBe(false);
      expect(isPrivateIp('http://172.32.0.1')).toBe(false);
    });

    it('should block 192.168.x.x (Class C private)', () => {
      expect(isPrivateIp('http://192.168.0.1')).toBe(true);
      expect(isPrivateIp('http://192.168.1.100')).toBe(true);
      expect(isPrivateIp('http://192.168.255.255')).toBe(true);
    });
  });

  describe('loopback addresses', () => {
    it('should block 127.x.x.x (IPv4 loopback range)', () => {
      expect(isPrivateIp('http://127.0.0.1')).toBe(true);
      expect(isPrivateIp('http://127.0.0.1:3000')).toBe(true);
      expect(isPrivateIp('http://127.255.255.255')).toBe(true);
    });

    it('should block ::1 (IPv6 loopback)', () => {
      expect(isPrivateIp('http://[::1]')).toBe(true);
      expect(isPrivateIp('http://[::1]:8080')).toBe(true);
    });

    it('should block localhost hostname', () => {
      expect(isPrivateIp('http://localhost')).toBe(true);
      expect(isPrivateIp('http://localhost:3000')).toBe(true);
      expect(isPrivateIp('http://localhost/path')).toBe(true);
      expect(isPrivateIp('https://localhost')).toBe(true);
    });

    it('should block localhost case-insensitively', () => {
      expect(isPrivateIp('http://LOCALHOST')).toBe(true);
      expect(isPrivateIp('http://Localhost')).toBe(true);
      expect(isPrivateIp('http://LocalHost:8080')).toBe(true);
    });
  });

  describe('0.0.0.0 (all interfaces)', () => {
    it('should block 0.0.0.0', () => {
      expect(isPrivateIp('http://0.0.0.0')).toBe(true);
      expect(isPrivateIp('http://0.0.0.0:8080')).toBe(true);
    });
  });

  describe('link-local and cloud metadata', () => {
    it('should block 169.254.x.x (link-local range)', () => {
      expect(isPrivateIp('http://169.254.0.1')).toBe(true);
      expect(isPrivateIp('http://169.254.255.255')).toBe(true);
    });

    it('should block 169.254.169.254 (cloud metadata endpoint)', () => {
      expect(isPrivateIp('http://169.254.169.254')).toBe(true);
      expect(isPrivateIp('http://169.254.169.254/latest/meta-data/')).toBe(
        true,
      );
      expect(isPrivateIp('http://169.254.169.254/computeMetadata/v1/')).toBe(
        true,
      );
    });
  });

  describe('IPv4-mapped IPv6 addresses', () => {
    it('should block ::ffff: prefixed addresses', () => {
      // Node.js URL parser normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1
      expect(isPrivateIp('http://[::ffff:127.0.0.1]')).toBe(true);
      expect(isPrivateIp('http://[::ffff:10.0.0.1]')).toBe(true);
    });
  });

  describe('IPv6 private ranges', () => {
    it('should block fc00: (unique local)', () => {
      expect(isPrivateIp('http://[fc00::1]')).toBe(true);
    });

    it('should block fe80: (link-local)', () => {
      expect(isPrivateIp('http://[fe80::1]')).toBe(true);
    });
  });

  describe('public IPs should be allowed', () => {
    it('should allow public IPv4 addresses', () => {
      expect(isPrivateIp('http://8.8.8.8')).toBe(false);
      expect(isPrivateIp('http://1.1.1.1')).toBe(false);
      expect(isPrivateIp('http://142.250.80.46')).toBe(false);
    });

    it('should allow public domains', () => {
      expect(isPrivateIp('https://google.com')).toBe(false);
      expect(isPrivateIp('https://github.com/path')).toBe(false);
      expect(isPrivateIp('https://example.com:443')).toBe(false);
    });
  });

  describe('fail-closed on parse error', () => {
    it('should return true (blocked) for malformed URLs', () => {
      expect(isPrivateIp('not-a-url')).toBe(true);
      expect(isPrivateIp('')).toBe(true);
      expect(isPrivateIp('://missing-scheme')).toBe(true);
    });

    it('should return true (blocked) for URLs that throw on parse', () => {
      expect(isPrivateIp('http://')).toBe(true);
    });
  });
});
