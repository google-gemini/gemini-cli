/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import {
  isWorkspaceTrusted,
  resetTrustedFoldersForTesting,
  TrustLevel,
  getTrustedFoldersPath,
} from './trustedFolders.js';
import type { Settings } from './settings.js';

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof fs>();
  return {
    ...actualFs,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    realpathSync: vi.fn(),
  };
});

describe('isWorkspaceTrusted with Symlinks', () => {
  const mockSettings: Settings = {
    security: {
      folderTrust: {
        enabled: true,
      },
    },
  };

  beforeEach(() => {
    resetTrustedFoldersForTesting();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should trust a folder even if CWD is a symlink and rule is realpath', () => {
    const symlinkPath = '/var/folders/project';
    const realPath = '/private/var/folders/project';

    vi.spyOn(process, 'cwd').mockReturnValue(symlinkPath);

    // Mock fs.existsSync to return true for trust config and both paths
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p === getTrustedFoldersPath()) return true;
      if (p === symlinkPath) return true;
      if (p === realPath) return true;
      return false;
    });

    // Mock realpathSync to resolve symlink to realpath
    vi.mocked(fs.realpathSync).mockImplementation((p) => {
      if (p === symlinkPath) return realPath;
      if (p === realPath) return realPath;
      return p as string;
    });

    // Rule is saved with realpath
    const mockRules = {
      [realPath]: TrustLevel.TRUST_FOLDER,
    };
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === getTrustedFoldersPath()) return JSON.stringify(mockRules);
      return '{}';
    });

    // Should be trusted because both resolve to the same realpath
    expect(isWorkspaceTrusted(mockSettings).isTrusted).toBe(true);
  });

  it('should trust a folder even if CWD is realpath and rule is a symlink', () => {
    const symlinkPath = '/var/folders/project';
    const realPath = '/private/var/folders/project';

    vi.spyOn(process, 'cwd').mockReturnValue(realPath);

    // Mock fs.existsSync
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p === getTrustedFoldersPath()) return true;
      if (p === symlinkPath) return true;
      if (p === realPath) return true;
      return false;
    });

    // Mock realpathSync
    vi.mocked(fs.realpathSync).mockImplementation((p) => {
      if (p === symlinkPath) return realPath;
      if (p === realPath) return realPath;
      return p as string;
    });

    // Rule is saved with symlink path
    const mockRules = {
      [symlinkPath]: TrustLevel.TRUST_FOLDER,
    };
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === getTrustedFoldersPath()) return JSON.stringify(mockRules);
      return '{}';
    });

    // Should be trusted because both resolve to the same realpath
    expect(isWorkspaceTrusted(mockSettings).isTrusted).toBe(true);
  });
});
