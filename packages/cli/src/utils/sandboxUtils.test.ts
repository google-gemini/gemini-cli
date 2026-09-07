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
  isCredentialOrSensitivePath,
  prepareIsolatedSettingsDir,
  SENSITIVE_SETTINGS_FILENAMES,
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
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
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

  describe('isCredentialOrSensitivePath', () => {
    it('should include known credential filenames in SENSITIVE_SETTINGS_FILENAMES', () => {
      expect(SENSITIVE_SETTINGS_FILENAMES.has('oauth_creds.json')).toBe(true);
      expect(SENSITIVE_SETTINGS_FILENAMES.has('google_accounts.json')).toBe(
        true,
      );
      expect(SENSITIVE_SETTINGS_FILENAMES.has('gemini-credentials.json')).toBe(
        true,
      );
      expect(SENSITIVE_SETTINGS_FILENAMES.has('mcp-oauth-tokens.json')).toBe(
        true,
      );
      expect(SENSITIVE_SETTINGS_FILENAMES.has('a2a-oauth-tokens.json')).toBe(
        true,
      );
    });

    it('should identify known credential and auth filenames as sensitive', () => {
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/oauth_creds.json'),
      ).toBe(true);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/google_accounts.json'),
      ).toBe(true);
      expect(
        isCredentialOrSensitivePath(
          '/home/user/.gemini/gemini-credentials.json',
        ),
      ).toBe(true);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/mcp-oauth-tokens.json'),
      ).toBe(true);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/a2a-oauth-tokens.json'),
      ).toBe(true);
    });

    it('should identify tokens, credentials, and sensitive directories', () => {
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/custom-tokens.json'),
      ).toBe(true);
      expect(isCredentialOrSensitivePath('/home/user/.gemini/token.json')).toBe(
        true,
      );
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/github-token'),
      ).toBe(true);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/api.credentials'),
      ).toBe(true);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/user_creds.json'),
      ).toBe(true);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/user_cred.json'),
      ).toBe(true);
      expect(isCredentialOrSensitivePath('/home/user/.gemini/.env')).toBe(true);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/private.key'),
      ).toBe(true);
      expect(isCredentialOrSensitivePath('/home/user/.gemini/cert.pem')).toBe(
        true,
      );
      expect(
        isCredentialOrSensitivePath(
          '/home/user/.gemini/service-account-key.json',
        ),
      ).toBe(true);
      expect(isCredentialOrSensitivePath('/home/user/.gemini/history')).toBe(
        true,
      );
      expect(isCredentialOrSensitivePath('/home/user/.gemini/tmp')).toBe(true);
      expect(isCredentialOrSensitivePath('/home/user/.gemini/bin')).toBe(true);
    });

    it('should allow non-sensitive configuration files and directories', () => {
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/settings.json'),
      ).toBe(false);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/keybindings.json'),
      ).toBe(false);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/trustedFolders.json'),
      ).toBe(false);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/policy_integrity.json'),
      ).toBe(false);
      expect(isCredentialOrSensitivePath('/home/user/.gemini/commands')).toBe(
        false,
      );
      expect(isCredentialOrSensitivePath('/home/user/.gemini/skills')).toBe(
        false,
      );
      expect(isCredentialOrSensitivePath('/home/user/.gemini/policies')).toBe(
        false,
      );
      expect(isCredentialOrSensitivePath('/home/user/.gemini/agents')).toBe(
        false,
      );
    });

    it('should not false-positive on user scripts containing credential in filename', () => {
      expect(
        isCredentialOrSensitivePath(
          '/home/user/.gemini/commands/setup-credentials.sh',
        ),
      ).toBe(false);
      expect(
        isCredentialOrSensitivePath(
          '/home/user/.gemini/skills/credential-helper.js',
        ),
      ).toBe(false);
    });

    it('should not false-positive on words sharing sensitive substrings without separators', () => {
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/monkey.json'),
      ).toBe(false);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/sacred.json'),
      ).toBe(false);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/commands/tokenized.js'),
      ).toBe(false);
    });

    it('should not false-positive on nested bin or tmp directories inside commands or skills', () => {
      const rootDir = '/home/user/.gemini';
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/commands/bin', rootDir),
      ).toBe(false);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/skills/tmp', rootDir),
      ).toBe(false);
    });

    it('should not filter out the root directory itself', () => {
      const rootDir = '/home/user/.gemini';
      expect(isCredentialOrSensitivePath(rootDir, rootDir)).toBe(false);
    });
  });

  describe('prepareIsolatedSettingsDir', () => {
    it('should create an isolated directory and copy files with credential filter', () => {
      const fakeHostSettingsDir = '/home/user/.gemini';
      const fakeIsolatedDir = '/tmp/gemini-sandbox-settings-xyz';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.mkdtempSync).mockReturnValue(fakeIsolatedDir);

      const result = prepareIsolatedSettingsDir(fakeHostSettingsDir);

      expect(fs.mkdtempSync).toHaveBeenCalledWith(
        expect.stringContaining('gemini-sandbox-settings-'),
      );
      expect(fs.chmodSync).toHaveBeenCalledWith(fakeIsolatedDir, 0o700);
      expect(fs.cpSync).toHaveBeenCalledWith(
        fakeHostSettingsDir,
        fakeIsolatedDir,
        expect.objectContaining({
          recursive: true,
          filter: expect.any(Function),
        }),
      );
      expect(result).toBe(fakeIsolatedDir);
    });

    it('should return isolated directory even if source settings directory does not exist', () => {
      const fakeHostSettingsDir = '/home/user/.gemini';
      const fakeIsolatedDir = '/tmp/gemini-sandbox-settings-xyz';

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdtempSync).mockReturnValue(fakeIsolatedDir);

      const result = prepareIsolatedSettingsDir(fakeHostSettingsDir);

      expect(fs.chmodSync).toHaveBeenCalledWith(fakeIsolatedDir, 0o700);
      expect(result).toBe(fakeIsolatedDir);
      expect(fs.cpSync).not.toHaveBeenCalled();
    });
  });
});
