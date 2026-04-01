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
vi.mock('node:fs');

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
    it('should return undefined for unknown tools', () => {
      expect(getProactiveToolSuggestions('ls')).toBeUndefined();
      expect(getProactiveToolSuggestions('node')).toBeUndefined();
    });

    it('should return permissions for npm if paths exist', () => {
      vi.mocked(fs.existsSync).mockImplementation(
        (p: string | Buffer | URL) => {
          const pathStr = p.toString();
          return (
            pathStr === path.join(homeDir, '.npm') ||
            pathStr === path.join(homeDir, '.cache') ||
            pathStr === path.join(homeDir, '.npmrc')
          );
        },
      );

      const permissions = getProactiveToolSuggestions('npm');
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

    it('should grant network access and suggest primary cache paths even if they do not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const permissions = getProactiveToolSuggestions('npm');
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

    it('should suggest .ssh and .gitconfig only for git', () => {
      vi.mocked(fs.existsSync).mockImplementation(
        (p: string | Buffer | URL) => {
          const pathStr = p.toString();
          return (
            pathStr === path.join(homeDir, '.ssh') ||
            pathStr === path.join(homeDir, '.gitconfig')
          );
        },
      );

      const permissions = getProactiveToolSuggestions('git');
      expect(permissions?.network).toBe(true);
      expect(permissions?.fileSystem?.read).toContain(
        path.join(homeDir, '.ssh'),
      );
      expect(permissions?.fileSystem?.read).toContain(
        path.join(homeDir, '.gitconfig'),
      );
    });

    it('should suggest .ssh but NOT .gitconfig for ssh', () => {
      vi.mocked(fs.existsSync).mockImplementation(
        (p: string | Buffer | URL) => {
          const pathStr = p.toString();
          return pathStr === path.join(homeDir, '.ssh');
        },
      );

      const permissions = getProactiveToolSuggestions('ssh');
      expect(permissions?.network).toBe(true);
      expect(permissions?.fileSystem?.read).toContain(
        path.join(homeDir, '.ssh'),
      );
      expect(permissions?.fileSystem?.read).not.toContain(
        path.join(homeDir, '.gitconfig'),
      );
    });

    it('should handle Windows specific paths', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      const appData = 'C:\\Users\\testuser\\AppData\\Roaming';
      vi.stubEnv('AppData', appData);

      vi.mocked(fs.existsSync).mockImplementation(
        (p: string | Buffer | URL) => {
          const pathStr = p.toString();
          return pathStr === path.join(appData, 'npm');
        },
      );

      const permissions = getProactiveToolSuggestions('npm.exe');
      expect(permissions).toBeDefined();
      expect(permissions?.fileSystem?.read).toContain(
        path.join(appData, 'npm'),
      );
    });

    it('should include bun, pnpm, and yarn specific paths', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const bun = getProactiveToolSuggestions('bun');
      expect(bun?.fileSystem?.read).toContain(path.join(homeDir, '.bun'));
      expect(bun?.fileSystem?.read).not.toContain(path.join(homeDir, '.yarn'));

      const yarn = getProactiveToolSuggestions('yarn');
      expect(yarn?.fileSystem?.read).toContain(path.join(homeDir, '.yarn'));
    });
  });
});
