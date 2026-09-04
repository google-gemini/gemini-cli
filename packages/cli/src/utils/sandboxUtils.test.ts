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
  isSensitiveHostPath,
  sanitizeSettingsForSandbox,
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
  homedir: vi.fn(() => os.homedir()),
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

    it('should return true on NixOS', async () => {
      delete process.env['SANDBOX_SET_UID_GID'];
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(readFile).mockResolvedValue('ID=nixos\n');
      expect(await shouldUseCurrentUserInSandbox()).toBe(true);
    });

    it('should return true on NixOS with quotes', async () => {
      delete process.env['SANDBOX_SET_UID_GID'];
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(readFile).mockResolvedValue('ID="nixos"\n');
      expect(await shouldUseCurrentUserInSandbox()).toBe(true);
    });

    it('should return true on Ubuntu with single quotes', async () => {
      delete process.env['SANDBOX_SET_UID_GID'];
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(readFile).mockResolvedValue("ID='ubuntu'\n");
      expect(await shouldUseCurrentUserInSandbox()).toBe(true);
    });

    it('should return true on Arch Linux', async () => {
      delete process.env['SANDBOX_SET_UID_GID'];
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(readFile).mockResolvedValue('ID=arch\n');
      expect(await shouldUseCurrentUserInSandbox()).toBe(true);
    });

    it('should return false on unrecognized Linux and warn on UID mismatch', async () => {
      delete process.env['SANDBOX_SET_UID_GID'];
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(readFile).mockResolvedValue('ID=unknown\n');
      vi.mocked(os.userInfo).mockReturnValue({
        uid: 1234,
        username: 'test',
        gid: 1234,
        shell: '/bin/bash',
        homedir: '/home/test',
      });

      const { debugLogger } = await import('@google/gemini-cli-core');
      expect(await shouldUseCurrentUserInSandbox()).toBe(false);
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Host UID mismatch detected (current UID: 1234)',
        ),
      );
    });

    it('should return true on Pop!_OS (via ID_LIKE)', async () => {
      delete process.env['SANDBOX_SET_UID_GID'];
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(readFile).mockResolvedValue(
        'ID=pop\nID_LIKE="ubuntu debian"\n',
      );
      expect(await shouldUseCurrentUserInSandbox()).toBe(true);
    });

    it('should return false and NOT warn for host root user (UID 0)', async () => {
      delete process.env['SANDBOX_SET_UID_GID'];
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(readFile).mockResolvedValue('ID=unknown\n');
      vi.mocked(os.userInfo).mockReturnValue({
        uid: 0,
        username: 'root',
        gid: 0,
        shell: '/bin/bash',
        homedir: '/root',
      });

      const { debugLogger } = await import('@google/gemini-cli-core');
      expect(await shouldUseCurrentUserInSandbox()).toBe(false);
      expect(debugLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Host UID mismatch detected'),
      );
    });

    it('should warn and return false if /etc/os-release is unreadable', async () => {
      delete process.env['SANDBOX_SET_UID_GID'];
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(readFile).mockRejectedValue(new Error('EACCES'));

      const { debugLogger } = await import('@google/gemini-cli-core');
      expect(await shouldUseCurrentUserInSandbox()).toBe(false);
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not read /etc/os-release'),
      );
    });

    it('should return false on non-Linux', async () => {
      delete process.env['SANDBOX_SET_UID_GID'];
      vi.mocked(os.platform).mockReturnValue('darwin');
      expect(await shouldUseCurrentUserInSandbox()).toBe(false);
    });
  });

  describe('isSensitiveHostPath', () => {
    it('should detect ~/.gemini directory path', () => {
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');
      expect(isSensitiveHostPath('/home/testuser/.gemini')).toBe(true);
      expect(isSensitiveHostPath('/home/testuser/.gemini/settings.json')).toBe(
        true,
      );
      expect(isSensitiveHostPath('~/.gemini')).toBe(true);
    });

    it('should detect user home directory', () => {
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');
      expect(isSensitiveHostPath('/home/testuser')).toBe(true);
      expect(isSensitiveHostPath('~')).toBe(true);
    });

    it('should detect sensitive credential files', () => {
      expect(isSensitiveHostPath('/any/path/oauth_creds.json')).toBe(true);
      expect(isSensitiveHostPath('/any/path/gemini-credentials.json')).toBe(
        true,
      );
      expect(isSensitiveHostPath('/any/path/mcp-oauth-tokens.json')).toBe(true);
      expect(isSensitiveHostPath('/any/path/a2a-oauth-tokens.json')).toBe(true);
    });

    it('should detect environment files (.env)', () => {
      expect(isSensitiveHostPath('/project/.env')).toBe(true);
      expect(isSensitiveHostPath('/project/.env.local')).toBe(true);
      expect(isSensitiveHostPath('/project/.env.production')).toBe(true);
    });

    it('should allow non-sensitive workspace and project paths', () => {
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');
      expect(isSensitiveHostPath('/home/testuser/project')).toBe(false);
      expect(isSensitiveHostPath('/workspace/app')).toBe(false);
      expect(isSensitiveHostPath('/tmp/test-dir')).toBe(false);
    });
  });

  describe('sanitizeSettingsForSandbox', () => {
    it('should strip hooks and malicious execution commands', () => {
      const rawSettings = {
        theme: 'dark',
        hooks: {
          beforeCommand: 'evil-script.sh',
        },
        tools: {
          allowed: ['read_file'],
          callCommand: '/bin/bash',
          discoveryCommand: '/bin/sh',
        },
        apiKey: 'secret-api-key',
        geminiApiKey: 'secret-gemini-key',
        googleApiKey: 'secret-google-key',
        customConfig: {
          nestedKey: 'safe-value',
        },
      };

      const sanitized = sanitizeSettingsForSandbox(rawSettings);

      expect(sanitized['hooks']).toBeUndefined();
      expect(sanitized['apiKey']).toBeUndefined();
      expect(sanitized['geminiApiKey']).toBeUndefined();
      expect(sanitized['googleApiKey']).toBeUndefined();

      const tools = sanitized['tools'] as Record<string, unknown>;
      expect(tools['allowed']).toEqual(['read_file']);
      expect(tools['callCommand']).toBeUndefined();
      expect(tools['discoveryCommand']).toBeUndefined();

      expect(sanitized['theme']).toBe('dark');
      expect(
        (sanitized['customConfig'] as Record<string, unknown>)['nestedKey'],
      ).toBe('safe-value');
    });

    it('should not mutate the original settings object', () => {
      const original = {
        hooks: { test: true },
        tools: { callCommand: 'run' },
      };
      const copy = JSON.parse(JSON.stringify(original));
      sanitizeSettingsForSandbox(original);
      expect(original).toEqual(copy);
    });
  });
});
