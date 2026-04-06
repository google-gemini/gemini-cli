/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkForExtensionUpdate } from './github.js';
import { simpleGit, type SimpleGit } from 'simple-git';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import type { ExtensionManager } from '../extension-manager.js';
import {
  fetchReleaseFromGithub,
  type GeminiCLIExtension,
} from '@google/gemini-cli-core';
import type { ExtensionConfig } from '../extension.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    Storage: {
      getGlobalSettingsPath: vi.fn().mockReturnValue('/mock/settings.json'),
      getGlobalGeminiDir: vi.fn().mockReturnValue('/mock/.gemini'),
    },
    debugLogger: {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
    fetchJson: vi.fn(),
    fetchReleaseFromGithub: vi.fn(),
  };
});

vi.mock('simple-git');
vi.mock('../extension-manager.js');
vi.mock('../settings.js', () => ({
  loadSettings: vi.fn(),
  USER_SETTINGS_PATH: '/mock/settings.json',
}));

describe('github.ts (CLI specific)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('checkForExtensionUpdate', () => {
    let mockExtensionManager: ExtensionManager;
    let mockGit: {
      getRemotes: ReturnType<typeof vi.fn>;
      listRemote: ReturnType<typeof vi.fn>;
      revparse: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockExtensionManager = {
        loadExtensionConfig: vi.fn(),
      } as unknown as ExtensionManager;
      mockGit = {
        getRemotes: vi.fn(),
        listRemote: vi.fn(),
        revparse: vi.fn(),
      };
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as SimpleGit);
    });

    it('should return NOT_UPDATABLE for non-git/non-release extensions', async () => {
      vi.mocked(mockExtensionManager.loadExtensionConfig).mockReturnValue(
        Promise.resolve({
          version: '1.0.0',
        } as unknown as ExtensionConfig),
      );

      const linkExt = {
        installMetadata: { type: 'link' },
      } as unknown as GeminiCLIExtension;
      expect(await checkForExtensionUpdate(linkExt, mockExtensionManager)).toBe(
        ExtensionUpdateState.NOT_UPDATABLE,
      );
    });

    it('should return UPDATE_AVAILABLE if git remote hash differs', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'url' } },
      ]);
      mockGit.listRemote.mockResolvedValue('remote-hash\tHEAD');
      mockGit.revparse.mockResolvedValue('local-hash');

      const ext = {
        path: '/path',
        installMetadata: { type: 'git', source: 'url' },
      } as unknown as GeminiCLIExtension;
      expect(await checkForExtensionUpdate(ext, mockExtensionManager)).toBe(
        ExtensionUpdateState.UPDATE_AVAILABLE,
      );
    });

    it('should return UP_TO_DATE if git remote hash matches', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'url' } },
      ]);
      mockGit.listRemote.mockResolvedValue('hash\tHEAD');
      mockGit.revparse.mockResolvedValue('hash');

      const ext = {
        path: '/path',
        installMetadata: { type: 'git', source: 'url' },
      } as unknown as GeminiCLIExtension;
      expect(await checkForExtensionUpdate(ext, mockExtensionManager)).toBe(
        ExtensionUpdateState.UP_TO_DATE,
      );
    });

    it('should return NOT_UPDATABLE if local extension config cannot be loaded', async () => {
      vi.mocked(mockExtensionManager.loadExtensionConfig).mockImplementation(
        async () => {
          throw new Error('Config not found');
        },
      );

      const ext = {
        name: 'local-ext',
        version: '1.0.0',
        path: '/path/to/installed/ext',
        installMetadata: { type: 'local', source: '/path/to/source/ext' },
      } as unknown as GeminiCLIExtension;

      expect(await checkForExtensionUpdate(ext, mockExtensionManager)).toBe(
        ExtensionUpdateState.NOT_UPDATABLE,
      );
    });

    it('should check migratedTo source if present and return UPDATE_AVAILABLE', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'new-url' } },
      ]);
      mockGit.listRemote.mockResolvedValue('hash\tHEAD');
      mockGit.revparse.mockResolvedValue('hash');

      const ext = {
        path: '/path',
        migratedTo: 'new-url',
        installMetadata: { type: 'git', source: 'old-url' },
      } as unknown as GeminiCLIExtension;
      expect(await checkForExtensionUpdate(ext, mockExtensionManager)).toBe(
        ExtensionUpdateState.UPDATE_AVAILABLE,
      );
    });

    it('should return UPDATE_AVAILABLE if github release tag differs', async () => {
      vi.mocked(fetchReleaseFromGithub).mockResolvedValue({ tag_name: 'v2.0.0' } as any);

      const ext = {
        installMetadata: { 
          type: 'github-release', 
          source: 'owner/repo', 
          releaseTag: 'v1.0.0' 
        },
      } as unknown as GeminiCLIExtension;

      expect(await checkForExtensionUpdate(ext, mockExtensionManager)).toBe(
        ExtensionUpdateState.UPDATE_AVAILABLE,
      );
    });
  });
});
