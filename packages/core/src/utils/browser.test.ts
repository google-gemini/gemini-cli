/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { shouldAttemptBrowserLaunch } from './browser.js';

describe('shouldAttemptBrowserLaunch', () => {
  let originalEnv: typeof process.env;
  let originalPlatform: typeof process.platform;

  beforeEach(() => {
    originalEnv = process.env;
    originalPlatform = process.platform;
    // Start with a clean environment for each test
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  describe('browser blocklist', () => {
    it('should return false when BROWSER is www-browser', () => {
      process.env['BROWSER'] = 'www-browser';
      expect(shouldAttemptBrowserLaunch()).toBe(false);
    });

    it('should return true when BROWSER is not in blocklist', () => {
      process.env['BROWSER'] = 'chrome';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should return true when BROWSER is not set', () => {
      delete process.env['BROWSER'];
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });
  });

  describe('CI environment detection', () => {
    it('should return false when CI is set', () => {
      process.env['CI'] = 'true';
      expect(shouldAttemptBrowserLaunch()).toBe(false);
    });

    it('should return false when DEBIAN_FRONTEND is noninteractive', () => {
      process.env['DEBIAN_FRONTEND'] = 'noninteractive';
      expect(shouldAttemptBrowserLaunch()).toBe(false);
    });

    it('should return true when DEBIAN_FRONTEND is not noninteractive', () => {
      process.env['DEBIAN_FRONTEND'] = 'readline';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });
  });

  describe('Linux platform', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });
    });

    it('should return true when DISPLAY is set', () => {
      process.env['DISPLAY'] = ':0';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should return true when WAYLAND_DISPLAY is set', () => {
      process.env['WAYLAND_DISPLAY'] = 'wayland-0';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should return true when MIR_SOCKET is set', () => {
      process.env['MIR_SOCKET'] = '/run/user/1000/mir_socket';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should return false when no display variables are set', () => {
      delete process.env['DISPLAY'];
      delete process.env['WAYLAND_DISPLAY'];
      delete process.env['MIR_SOCKET'];
      expect(shouldAttemptBrowserLaunch()).toBe(false);
    });

    it('should return true when SSH connection and DISPLAY is set', () => {
      process.env['SSH_CONNECTION'] = '192.168.1.1';
      process.env['DISPLAY'] = ':0';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should return false when SSH connection and no DISPLAY', () => {
      process.env['SSH_CONNECTION'] = '192.168.1.1';
      delete process.env['DISPLAY'];
      delete process.env['WAYLAND_DISPLAY'];
      delete process.env['MIR_SOCKET'];
      expect(shouldAttemptBrowserLaunch()).toBe(false);
    });
  });

  describe('SSH detection', () => {
    it('should return false for SSH on macOS without display', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });
      process.env['SSH_CONNECTION'] = '192.168.1.1';
      expect(shouldAttemptBrowserLaunch()).toBe(false);
    });

    it('should return false for SSH on Windows without display', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });
      process.env['SSH_CONNECTION'] = '192.168.1.1';
      expect(shouldAttemptBrowserLaunch()).toBe(false);
    });

    it('should return true when SSH_CONNECTION is not set', () => {
      delete process.env['SSH_CONNECTION'];
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });
  });

  describe('platform-specific behavior', () => {
    it('should return true for macOS without SSH', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });
      delete process.env['SSH_CONNECTION'];
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should return true for Windows without SSH', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });
      delete process.env['SSH_CONNECTION'];
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should return true for other platforms without SSH', () => {
      Object.defineProperty(process, 'platform', {
        value: 'freebsd',
      });
      delete process.env['SSH_CONNECTION'];
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });
  });

  describe('complex scenarios', () => {
    it('should prioritize CI detection over platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });
      process.env['CI'] = 'true';
      expect(shouldAttemptBrowserLaunch()).toBe(false);
    });

    it('should prioritize browser blocklist over everything', () => {
      process.env['BROWSER'] = 'www-browser';
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });
      delete process.env['CI'];
      delete process.env['SSH_CONNECTION'];
      expect(shouldAttemptBrowserLaunch()).toBe(false);
    });

    it('should handle multiple display variables on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });
      process.env['DISPLAY'] = ':0';
      process.env['WAYLAND_DISPLAY'] = 'wayland-0';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should handle all negative conditions', () => {
      process.env['CI'] = 'true';
      process.env['BROWSER'] = 'www-browser';
      process.env['SSH_CONNECTION'] = '192.168.1.1';
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });
      delete process.env['DISPLAY'];
      expect(shouldAttemptBrowserLaunch()).toBe(false);
    });

    it('should allow browser launch in ideal conditions', () => {
      delete process.env['CI'];
      delete process.env['BROWSER'];
      delete process.env['SSH_CONNECTION'];
      delete process.env['DEBIAN_FRONTEND'];
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string BROWSER value', () => {
      process.env['BROWSER'] = '';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should handle empty string CI value', () => {
      process.env['CI'] = '';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should handle empty string SSH_CONNECTION', () => {
      process.env['SSH_CONNECTION'] = '';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should handle DISPLAY set to empty string on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });
      process.env['DISPLAY'] = '';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should be case-sensitive for DEBIAN_FRONTEND', () => {
      process.env['DEBIAN_FRONTEND'] = 'NonInteractive';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });

    it('should be case-sensitive for browser name', () => {
      process.env['BROWSER'] = 'WWW-BROWSER';
      expect(shouldAttemptBrowserLaunch()).toBe(true);
    });
  });

  describe('return type', () => {
    it('should always return a boolean', () => {
      const result = shouldAttemptBrowserLaunch();
      expect(typeof result).toBe('boolean');
    });

    it('should return either true or false', () => {
      const result = shouldAttemptBrowserLaunch();
      expect([true, false]).toContain(result);
    });
  });
});
