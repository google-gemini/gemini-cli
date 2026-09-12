/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolveToRealPath, homedir } from '@google/gemini-cli-core';
import {
  getContainerPath,
  parseImageName,
  ports,
  entrypoint,
  shouldUseCurrentUserInSandbox,
  isSensitiveHostPath,
  sanitizeSettingsForSandbox,
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
  homedir: vi.fn(() => os.homedir()),
  resolveToRealPath: vi.fn((p: string) => path.resolve(p)),
}));

describe('sandboxUtils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    vi.mocked(os.platform).mockReturnValue(process.platform);
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
    vi.mocked(homedir).mockImplementation(() => os.homedir());
    vi.mocked(resolveToRealPath).mockImplementation((p: string) =>
      path.resolve(p),
    );
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.lstatSync).mockReset();
    vi.mocked(fs.readlinkSync).mockReset();
    // Clean up these env vars that might affect tests
    delete process.env['NODE_ENV'];
    delete process.env['DEBUG'];
    delete process.env['GEMINI_CLI_HOME'];
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
    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
    });

    it('should detect ~/.gemini directory path', () => {
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');
      expect(isSensitiveHostPath('/home/testuser/.gemini')).toBe(true);
      expect(isSensitiveHostPath('/home/testuser/.gemini/settings.json')).toBe(
        true,
      );
      expect(isSensitiveHostPath('~/.gemini')).toBe(true);
    });

    it('should detect user home directory and its parent directories', () => {
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');
      expect(isSensitiveHostPath('/home/testuser')).toBe(true);
      expect(isSensitiveHostPath('~')).toBe(true);
      expect(isSensitiveHostPath('/home')).toBe(true);
      expect(isSensitiveHostPath('/')).toBe(true);
    });

    it('should detect sensitive credential files', () => {
      expect(isSensitiveHostPath('/any/path/oauth_creds.json')).toBe(true);
      expect(isSensitiveHostPath('/any/path/gemini-credentials.json')).toBe(
        true,
      );
      expect(isSensitiveHostPath('/any/path/mcp-oauth-tokens.json')).toBe(true);
      expect(isSensitiveHostPath('/any/path/a2a-oauth-tokens.json')).toBe(true);
      expect(isSensitiveHostPath('/any/path/google_accounts.json')).toBe(true);
      expect(isSensitiveHostPath('/any/path/trusted_hooks.json')).toBe(true);
      expect(isSensitiveHostPath('/any/path/trustedFolders.json')).toBe(true);
      expect(isSensitiveHostPath('/any/path/trustedfolders.json')).toBe(true);
      expect(isSensitiveHostPath('/any/path/policy_integrity.json')).toBe(true);
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

    it('should resolve symlinks to detect sensitive targets', () => {
      const homeDir = path.resolve('/home/testuser');
      const symlinkGemini = path.resolve('/var/symlink_to_gemini');
      const symlinkHome = path.resolve('/var/symlink_to_home');

      vi.mocked(os.homedir).mockReturnValue(homeDir);
      vi.mocked(resolveToRealPath).mockImplementation((p: string) => {
        const resolvedP = path.resolve(p);
        if (
          resolvedP === symlinkGemini ||
          (os.platform() === 'win32' &&
            resolvedP.toLowerCase() === symlinkGemini.toLowerCase())
        ) {
          return path.join(homeDir, '.gemini');
        }
        if (
          resolvedP === symlinkHome ||
          (os.platform() === 'win32' &&
            resolvedP.toLowerCase() === symlinkHome.toLowerCase())
        ) {
          return homeDir;
        }
        return resolvedP;
      });

      expect(isSensitiveHostPath(symlinkGemini)).toBe(true);
      expect(isSensitiveHostPath(symlinkHome)).toBe(true);
    });

    it('should fail closed when resolveToRealPath encounters an error', () => {
      vi.mocked(os.homedir).mockReturnValue('/home/testuser');
      vi.mocked(resolveToRealPath).mockImplementation(() => {
        throw new Error('Unrecoverable resolution error');
      });

      expect(isSensitiveHostPath('/home/testuser/.gemini')).toBe(true);
      expect(isSensitiveHostPath('/workspace/safe-path')).toBe(true);
    });

    it('should resolve non-existent paths cleanly via resolveToRealPath', () => {
      const homeDir = path.resolve('/home/testuser');
      const safeDir = path.resolve('/workspace/safe-path');
      vi.mocked(os.homedir).mockReturnValue(homeDir);
      vi.mocked(resolveToRealPath).mockImplementation((p: string) =>
        path.resolve(p),
      );

      expect(
        isSensitiveHostPath(path.join(homeDir, '.gemini', 'non-existent-sub')),
      ).toBe(true);
      expect(isSensitiveHostPath(path.join(safeDir, 'non-existent-sub'))).toBe(
        false,
      );
    });

    it('should fall back to path.resolve when resolveToRealPath encounters ENOENT', () => {
      const homeDir = path.resolve('/home/testuser');
      const safeDir = path.resolve('/workspace/safe-path');
      vi.mocked(os.homedir).mockReturnValue(homeDir);
      vi.mocked(resolveToRealPath).mockImplementation((p: string) => {
        const resolvedP = path.resolve(p);
        if (resolvedP.includes('non-existent')) {
          const err = new Error(
            `ENOENT: no such file or directory, realpath '${p}'`,
          );
          (err as NodeJS.ErrnoException).code = 'ENOENT';
          throw err;
        }
        return resolvedP;
      });

      expect(
        isSensitiveHostPath(path.join(homeDir, '.gemini', 'non-existent-sub')),
      ).toBe(true);
      expect(isSensitiveHostPath(path.join(safeDir, 'non-existent-sub'))).toBe(
        false,
      );
    });

    it('should detect broken symlinks pointing into ~/.gemini as sensitive', () => {
      const homeDir = path.resolve('/home/testuser');
      const brokenSymlink = path.resolve('/workspace/broken_symlink');
      const targetFile = path.join(homeDir, '.gemini', 'trusted_hooks.json');

      vi.mocked(os.homedir).mockReturnValue(homeDir);

      const matchesBroken = (p: string) => {
        const resolvedP = path.resolve(p);
        return (
          resolvedP === brokenSymlink ||
          (os.platform() === 'win32' &&
            resolvedP.toLowerCase() === brokenSymlink.toLowerCase())
        );
      };

      vi.mocked(resolveToRealPath).mockImplementation((p: string) => {
        if (matchesBroken(p)) {
          const err = new Error('ENOENT: no such file or directory');
          (err as NodeJS.ErrnoException).code = 'ENOENT';
          throw err;
        }
        return path.resolve(p);
      });

      vi.mocked(fs.lstatSync).mockImplementation((p: fs.PathLike) => {
        if (matchesBroken(String(p))) {
          return {
            isSymbolicLink: () => true,
          } as fs.Stats;
        }
        const err = new Error('ENOENT: no such file or directory');
        (err as NodeJS.ErrnoException).code = 'ENOENT';
        throw err;
      });

      vi.mocked(fs.readlinkSync).mockImplementation((p: fs.PathLike) => {
        if (matchesBroken(String(p))) {
          return targetFile;
        }
        throw new Error('EINVAL: not a symlink');
      });

      expect(isSensitiveHostPath(brokenSymlink)).toBe(true);
    });

    it('should fail closed and block mounts when circular symlinks are encountered', () => {
      const homeDir = path.resolve('/home/testuser');
      const circ1 = path.resolve('/workspace/circ1');
      const circ2 = path.resolve('/workspace/circ2');

      vi.mocked(os.homedir).mockReturnValue(homeDir);

      const matchesCirc = (p: string, target: string) => {
        const resolvedP = path.resolve(p);
        return (
          resolvedP === target ||
          (os.platform() === 'win32' &&
            resolvedP.toLowerCase() === target.toLowerCase())
        );
      };

      vi.mocked(resolveToRealPath).mockImplementation((p: string) => {
        if (matchesCirc(p, circ1) || matchesCirc(p, circ2)) {
          const err = new Error('ENOENT: no such file or directory');
          (err as NodeJS.ErrnoException).code = 'ENOENT';
          throw err;
        }
        return path.resolve(p);
      });

      vi.mocked(fs.lstatSync).mockImplementation((p: fs.PathLike) => {
        const strP = String(p);
        if (matchesCirc(strP, circ1) || matchesCirc(strP, circ2)) {
          return {
            isSymbolicLink: () => true,
          } as fs.Stats;
        }
        const err = new Error('ENOENT: no such file or directory');
        (err as NodeJS.ErrnoException).code = 'ENOENT';
        throw err;
      });

      vi.mocked(fs.readlinkSync).mockImplementation((p: fs.PathLike) => {
        const strP = String(p);
        if (matchesCirc(strP, circ1)) {
          return circ2;
        }
        if (matchesCirc(strP, circ2)) {
          return circ1;
        }
        throw new Error('EINVAL: not a symlink');
      });

      expect(isSensitiveHostPath(circ1)).toBe(true);
    });

    it('should handle empty or undetermined homedir without blocking working directory', () => {
      vi.mocked(homedir).mockReturnValue('');
      vi.mocked(os.homedir).mockReturnValue('');

      expect(isSensitiveHostPath(process.cwd())).toBe(false);
      expect(isSensitiveHostPath(path.join(process.cwd(), '.gemini'))).toBe(
        false,
      );
      expect(isSensitiveHostPath('/workspace/safe-project')).toBe(false);

      // Still blocks ~ notations and sensitive credential files
      expect(isSensitiveHostPath('~')).toBe(true);
      expect(isSensitiveHostPath('~/.gemini')).toBe(true);
      expect(isSensitiveHostPath('/workspace/.env')).toBe(true);
      expect(isSensitiveHostPath('/workspace/oauth_creds.json')).toBe(true);
      expect(isSensitiveHostPath('/workspace/google_accounts.json')).toBe(true);
      expect(isSensitiveHostPath('/workspace/trustedFolders.json')).toBe(true);
      expect(isSensitiveHostPath('/workspace/trustedfolders.json')).toBe(true);
      expect(isSensitiveHostPath('/workspace/policy_integrity.json')).toBe(
        true,
      );
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

    it('should handle tools property when it is an array without runtime errors', () => {
      const rawSettings = {
        tools: ['read_file', 'edit_file'],
      };
      const sanitized = sanitizeSettingsForSandbox(rawSettings);
      expect(sanitized['tools']).toEqual(['read_file', 'edit_file']);
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
      expect(SENSITIVE_SETTINGS_FILENAMES.has('trusted_hooks.json')).toBe(true);
      expect(SENSITIVE_SETTINGS_FILENAMES.has('trustedFolders.json')).toBe(
        true,
      );
      expect(SENSITIVE_SETTINGS_FILENAMES.has('trustedfolders.json')).toBe(
        true,
      );
      expect(SENSITIVE_SETTINGS_FILENAMES.has('policy_integrity.json')).toBe(
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
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/trusted_hooks.json'),
      ).toBe(true);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/trustedFolders.json'),
      ).toBe(true);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/trustedfolders.json'),
      ).toBe(true);
      expect(
        isCredentialOrSensitivePath('/home/user/.gemini/policy_integrity.json'),
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
