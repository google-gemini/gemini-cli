/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getProactiveToolSuggestions,
  isNetworkReliantCommand,
} from './proactivePermissions.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

vi.mock('node:os');
vi.mock('node:fs', () => ({
  default: {
    promises: {
      access: vi.fn(),
    },
    constants: {
      F_OK: 0,
    },
  },
  promises: {
    access: vi.fn(),
  },
  constants: {
    F_OK: 0,
  },
}));

describe('proactivePermissions', () => {
  const homeDir = '/Users/testuser';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue(homeDir);
    vi.mocked(os.platform).mockReturnValue('darwin');
  });

  describe('isNetworkReliantCommand', () => {
    it('should return true for always-network tools', () => {
      expect(isNetworkReliantCommand('ssh')).toBe(true);
      expect(isNetworkReliantCommand('git')).toBe(true);
      expect(isNetworkReliantCommand('curl')).toBe(true);
    });

    it('should return true for network-heavy node subcommands', () => {
      expect(isNetworkReliantCommand('npm', 'install')).toBe(true);
      expect(isNetworkReliantCommand('yarn', 'add')).toBe(true);
      expect(isNetworkReliantCommand('bun', '')).toBe(true);
    });

    it('should return false for local node subcommands', () => {
      expect(isNetworkReliantCommand('npm', 'test')).toBe(false);
      expect(isNetworkReliantCommand('yarn', 'run')).toBe(false);
    });

    it('should return false for unknown tools', () => {
      expect(isNetworkReliantCommand('ls')).toBe(false);
    });
  });

  describe('getProactiveToolSuggestions', () => {
    it('should return undefined for unknown tools', async () => {
      expect(await getProactiveToolSuggestions('ls')).toBeUndefined();
      expect(await getProactiveToolSuggestions('node')).toBeUndefined();
    });

    it('should return permissions for npm if paths exist', async () => {
      vi.mocked(fs.promises.access).mockImplementation(
        (p: fs.PathLike, _mode?: number) => {
          const pathStr = p.toString();
          if (
            pathStr === path.join(homeDir, '.npm') ||
            pathStr === path.join(homeDir, '.cache') ||
            pathStr === path.join(homeDir, '.npmrc')
          ) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        },
      );

      const permissions = await getProactiveToolSuggestions('npm');
      expect(permissions).toBeDefined();
      expect(permissions?.network).toBe(true);
      // .npmrc should be read-only
      expect(permissions?.fileSystem?.read).toContain(
        path.join(homeDir, '.npmrc'),
      );
      expect(permissions?.fileSystem?.write).not.toContain(
        path.join(homeDir, '.npmrc'),
      );
      // .npm should be read-write
      expect(permissions?.fileSystem?.read).toContain(
        path.join(homeDir, '.npm'),
      );
      expect(permissions?.fileSystem?.write).toContain(
        path.join(homeDir, '.npm'),
      );
      // .cache should be read-write
      expect(permissions?.fileSystem?.write).toContain(
        path.join(homeDir, '.cache'),
      );
      // should NOT contain .ssh or .gitconfig for npm
      expect(permissions?.fileSystem?.read).not.toContain(
        path.join(homeDir, '.ssh'),
      );
    });

    it('should grant network access and suggest primary cache paths even if they do not exist', async () => {
      vi.mocked(fs.promises.access).mockRejectedValue(new Error('ENOENT'));
      const permissions = await getProactiveToolSuggestions('npm');
      expect(permissions).toBeDefined();
      expect(permissions?.network).toBe(true);
      expect(permissions?.fileSystem?.write).toContain(
        path.join(homeDir, '.npm'),
      );
      // .cache is optional and should NOT be included if it doesn't exist
      expect(permissions?.fileSystem?.write).not.toContain(
        path.join(homeDir, '.cache'),
      );
    });

    it('should suggest .ssh and .gitconfig only for git', async () => {
      vi.mocked(fs.promises.access).mockImplementation(
        (p: fs.PathLike, _mode?: number) => {
          const pathStr = p.toString();
          if (
            pathStr === path.join(homeDir, '.ssh') ||
            pathStr === path.join(homeDir, '.gitconfig')
          ) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        },
      );

      const permissions = await getProactiveToolSuggestions('git');
      expect(permissions?.network).toBe(true);
      expect(permissions?.fileSystem?.read).toContain(
        path.join(homeDir, '.ssh'),
      );
      expect(permissions?.fileSystem?.read).toContain(
        path.join(homeDir, '.gitconfig'),
      );
    });

    it('should suggest .ssh but NOT .gitconfig for ssh', async () => {
      vi.mocked(fs.promises.access).mockImplementation(
        (p: fs.PathLike, _mode?: number) => {
          const pathStr = p.toString();
          if (pathStr === path.join(homeDir, '.ssh')) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        },
      );

      const permissions = await getProactiveToolSuggestions('ssh');
      expect(permissions?.network).toBe(true);
      expect(permissions?.fileSystem?.read).toContain(
        path.join(homeDir, '.ssh'),
      );
      expect(permissions?.fileSystem?.read).not.toContain(
        path.join(homeDir, '.gitconfig'),
      );
    });

    it('should handle Windows specific paths', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      const appData = 'C:\\Users\\testuser\\AppData\\Roaming';
      vi.stubEnv('AppData', appData);

      vi.mocked(fs.promises.access).mockImplementation(
        (p: fs.PathLike, _mode?: number) => {
          const pathStr = p.toString();
          if (pathStr === path.join(appData, 'npm')) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        },
      );

      const permissions = await getProactiveToolSuggestions('npm.exe');
      expect(permissions).toBeDefined();
      expect(permissions?.fileSystem?.read).toContain(
        path.join(appData, 'npm'),
      );

      vi.unstubAllEnvs();
    });

    it('should include bun, pnpm, and yarn specific paths', async () => {
      vi.mocked(fs.promises.access).mockResolvedValue(undefined);

      const bun = await getProactiveToolSuggestions('bun');
      expect(bun?.fileSystem?.read).toContain(path.join(homeDir, '.bun'));
      expect(bun?.fileSystem?.read).not.toContain(path.join(homeDir, '.yarn'));

      const yarn = await getProactiveToolSuggestions('yarn');
      expect(yarn?.fileSystem?.read).toContain(path.join(homeDir, '.yarn'));
    });
  });
});
