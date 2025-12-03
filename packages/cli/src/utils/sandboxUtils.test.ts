/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import {
  getContainerPath,
  parseImageName,
  ports,
  entrypoint,
  shouldUseCurrentUserInSandbox,
} from './sandboxUtils.js';

vi.mock('node:os');
vi.mock('node:fs');
vi.mock('node:fs/promises');
vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    log: vi.fn(),
    warn: vi.fn(),
  },
  GEMINI_DIR: '.gemini',
}));

describe('sandboxUtils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Clean up these env vars that might affect tests
    delete process.env['NODE_ENV'];
    delete process.env['DEBUG'];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getContainerPath', () => {
    it('should return same path on non-Windows', () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      expect(getContainerPath('/home/user')).toBe('/home/user');
    });

    it('should convert Windows path to container path', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      expect(getContainerPath('C:\\Users\\user')).toBe('/c/Users/user');
    });

    it('should handle Windows path without drive letter', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      expect(getContainerPath('\\Users\\user')).toBe('/Users/user');
    });
  });

  describe('parseImageName', () => {
    it('should parse image name with tag', () => {
      expect(parseImageName('my-image:latest')).toBe('my-image-latest');
    });

    it('should parse image name without tag', () => {
      expect(parseImageName('my-image')).toBe('my-image');
    });

    it('should handle registry path', () => {
      expect(parseImageName('gcr.io/my-project/my-image:v1')).toBe(
        'my-image-v1',
      );
    });
  });

  describe('ports', () => {
    it('should return empty array if SANDBOX_PORTS is not set', () => {
      delete process.env['SANDBOX_PORTS'];
      expect(ports()).toEqual([]);
    });

    it('should parse comma-separated ports', () => {
      process.env['SANDBOX_PORTS'] = '8080, 3000 , 9000';
      expect(ports()).toEqual(['8080', '3000', '9000']);
    });
  });

  describe('entrypoint', () => {
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    it('should generate default entrypoint', () => {
      const args = entrypoint('/work', ['node', 'gemini', 'arg1']);
      expect(args).toEqual(['bash', '-c', 'gemini arg1']);
    });

    it('should include PATH and PYTHONPATH if set', () => {
      process.env['PATH'] = '/work/bin:/usr/bin';
      process.env['PYTHONPATH'] = '/work/lib';
      const args = entrypoint('/work', ['node', 'gemini', 'arg1']);
      expect(args[2]).toContain('export PATH="$PATH:/work/bin"');
      expect(args[2]).toContain('export PYTHONPATH="$PYTHONPATH:/work/lib"');
    });

    it('should source sandbox.bashrc if exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const args = entrypoint('/work', ['node', 'gemini', 'arg1']);
      expect(args[2]).toContain('source .gemini/sandbox.bashrc');
    });

    it('should include socat commands for ports', () => {
      process.env['SANDBOX_PORTS'] = '8080';
      const args = entrypoint('/work', ['node', 'gemini', 'arg1']);
      expect(args[2]).toContain('socat TCP4-LISTEN:8080');
    });

    it('should use development command if NODE_ENV is development', () => {
      process.env['NODE_ENV'] = 'development';
      const args = entrypoint('/work', ['node', 'gemini', 'arg1']);
      expect(args[2]).toContain('npm rebuild && npm run start --');
    });
  });

  describe('shouldUseCurrentUserInSandbox', () => {
    it('should return true if SANDBOX_SET_UID_GID is 1', async () => {
      process.env['SANDBOX_SET_UID_GID'] = '1';
      expect(await shouldUseCurrentUserInSandbox()).toBe(true);
    });

    it('should return false if SANDBOX_SET_UID_GID is 0', async () => {
      process.env['SANDBOX_SET_UID_GID'] = '0';
      expect(await shouldUseCurrentUserInSandbox()).toBe(false);
    });

    it('should return true on Debian Linux', async () => {
      delete process.env['SANDBOX_SET_UID_GID'];
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(readFile).mockResolvedValue('ID=debian\n');
      expect(await shouldUseCurrentUserInSandbox()).toBe(true);
    });

    it('should return false on non-Linux', async () => {
      delete process.env['SANDBOX_SET_UID_GID'];
      vi.mocked(os.platform).mockReturnValue('darwin');
      expect(await shouldUseCurrentUserInSandbox()).toBe(false);
    });
  });
});
