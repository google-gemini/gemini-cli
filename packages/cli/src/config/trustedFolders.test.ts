/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Mock 'os' first.
import * as osActual from 'os';
vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof osActual>();
  return {
    ...actualOs,
    homedir: vi.fn(() => '/mock/home/user'),
    platform: vi.fn(() => 'linux'),
  };
});

// Mock './trustedFolders.js' to ensure it uses the mocked 'os.homedir()' for its internal constants.
vi.mock('./trustedFolders.js', async (importActual) => {
  const originalModule =
    await importActual<typeof import('./trustedFolders.js')>();
  return {
    __esModule: true,
    ...originalModule,
  };
});

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mocked,
  type Mock,
} from 'vitest';
import * as fs from 'fs';
import stripJsonComments from 'strip-json-comments';
import * as path from 'path';

import {
  loadTrustedFolders,
  USER_TRUSTED_FOLDERS_PATH,
  getSystemTrustedFoldersPath,
  TrustLevel,
  isCurrentDirectoryTrusted,
} from './trustedFolders.js';
import { SettingScope } from './settings.js';

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof fs>();
  return {
    ...actualFs,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock('strip-json-comments', () => ({
  default: vi.fn((content) => content),
}));

describe('Trusted Folders Loading', () => {
  let mockFsExistsSync: Mocked<typeof fs.existsSync>;
  let mockStripJsonComments: Mocked<typeof stripJsonComments>;
  let mockFsWriteFileSync: Mocked<typeof fs.writeFileSync>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockFsExistsSync = vi.mocked(fs.existsSync);
    mockStripJsonComments = vi.mocked(stripJsonComments);
    mockFsWriteFileSync = vi.mocked(fs.writeFileSync);
    vi.mocked(osActual.homedir).mockReturnValue('/mock/home/user');
    (mockStripJsonComments as unknown as Mock).mockImplementation(
      (jsonString: string) => jsonString,
    );
    (mockFsExistsSync as Mock).mockReturnValue(false);
    (fs.readFileSync as Mock).mockReturnValue('{}');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load empty rules if no files exist', () => {
    const { rules, errors } = loadTrustedFolders();
    expect(rules).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('should load system rules if only system file exists', () => {
    const systemPath = getSystemTrustedFoldersPath();
    (mockFsExistsSync as Mock).mockImplementation((p) => p === systemPath);
    const systemContent = {
      '/system/folder': TrustLevel.TRUST_PARENT,
    };
    (fs.readFileSync as Mock).mockImplementation((p) => {
      if (p === systemPath) return JSON.stringify(systemContent);
      return '{}';
    });

    const { rules, errors } = loadTrustedFolders();
    expect(rules).toEqual([
      { path: '/system/folder', trustLevel: TrustLevel.TRUST_PARENT },
    ]);
    expect(errors).toEqual([]);
  });

  it('should load user rules if only user file exists', () => {
    const userPath = USER_TRUSTED_FOLDERS_PATH;
    (mockFsExistsSync as Mock).mockImplementation((p) => p === userPath);
    const userContent = {
      '/user/folder': TrustLevel.TRUST_FOLDER,
    };
    (fs.readFileSync as Mock).mockImplementation((p) => {
      if (p === userPath) return JSON.stringify(userContent);
      return '{}';
    });

    const { rules, errors } = loadTrustedFolders();
    expect(rules).toEqual([
      { path: '/user/folder', trustLevel: TrustLevel.TRUST_FOLDER },
    ]);
    expect(errors).toEqual([]);
  });

  it('should merge system and user rules, with system taking precedence', () => {
    const systemPath = getSystemTrustedFoldersPath();
    const userPath = USER_TRUSTED_FOLDERS_PATH;
    (mockFsExistsSync as Mock).mockImplementation(
      (p) => p === systemPath || p === userPath,
    );

    const systemContent = {
      '/shared/folder': TrustLevel.DO_NOT_TRUST,
      '/system/folder': TrustLevel.TRUST_PARENT,
    };
    const userContent = {
      '/shared/folder': TrustLevel.TRUST_FOLDER, // This should be overridden
      '/user/folder': TrustLevel.TRUST_FOLDER,
    };

    (fs.readFileSync as Mock).mockImplementation((p) => {
      if (p === systemPath) return JSON.stringify(systemContent);
      if (p === userPath) return JSON.stringify(userContent);
      return '{}';
    });

    const { rules, errors } = loadTrustedFolders();
    expect(errors).toEqual([]);
    expect(rules).toHaveLength(3);
    expect(rules).toEqual(
      expect.arrayContaining([
        { path: '/shared/folder', trustLevel: TrustLevel.DO_NOT_TRUST },
        { path: '/system/folder', trustLevel: TrustLevel.TRUST_PARENT },
        { path: '/user/folder', trustLevel: TrustLevel.TRUST_FOLDER },
      ]),
    );
  });

  it('should handle JSON parsing errors gracefully', () => {
    const systemPath = getSystemTrustedFoldersPath();
    (mockFsExistsSync as Mock).mockImplementation((p) => p === systemPath);
    (fs.readFileSync as Mock).mockImplementation((p) => {
      if (p === systemPath) return 'invalid json';
      return '{}';
    });

    const { rules, errors } = loadTrustedFolders();
    expect(rules).toEqual([]);
    expect(errors.length).toBe(1);
    expect(errors[0].path).toBe(systemPath);
    expect(errors[0].message).toContain('Unexpected token');
  });

  it('setValue should update the user config and save it', () => {
    const loadedFolders = loadTrustedFolders();
    loadedFolders.setValue(
      SettingScope.User,
      '/new/path',
      TrustLevel.TRUST_FOLDER,
    );

    expect(loadedFolders.user.config['/new/path']).toBe(
      TrustLevel.TRUST_FOLDER,
    );
    expect(mockFsWriteFileSync).toHaveBeenCalledWith(
      USER_TRUSTED_FOLDERS_PATH,
      JSON.stringify({ '/new/path': TrustLevel.TRUST_FOLDER }, null, 2),
      'utf-8',
    );
  });

  it('setValue should update the system config and save it', () => {
    const loadedFolders = loadTrustedFolders();
    loadedFolders.setValue(
      SettingScope.System,
      '/new/system/path',
      TrustLevel.DO_NOT_TRUST,
    );

    expect(loadedFolders.system.config['/new/system/path']).toBe(
      TrustLevel.DO_NOT_TRUST,
    );
    expect(mockFsWriteFileSync).toHaveBeenCalledWith(
      getSystemTrustedFoldersPath(),
      JSON.stringify({ '/new/system/path': TrustLevel.DO_NOT_TRUST }, null, 2),
      'utf-8',
    );
  });
});

describe('isCurrentDirectoryTrusted', () => {
  let mockCwd: string;
  const mockRules: Record<string, TrustLevel> = {};

  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockImplementation(() => mockCwd);
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p === USER_TRUSTED_FOLDERS_PATH) {
        return JSON.stringify(mockRules);
      }
      return '{}';
    });
    vi.spyOn(fs, 'existsSync').mockImplementation(
      (p) => p === USER_TRUSTED_FOLDERS_PATH,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clear the object
    Object.keys(mockRules).forEach((key) => delete mockRules[key]);
  });

  it('should return true for a directly trusted folder', () => {
    mockCwd = '/home/user/projectA';
    mockRules['/home/user/projectA'] = TrustLevel.TRUST_FOLDER;
    expect(isCurrentDirectoryTrusted()).toBe(true);
  });

  it('should return true for a child of a trusted folder', () => {
    mockCwd = '/home/user/projectA/src';
    mockRules['/home/user/projectA'] = TrustLevel.TRUST_FOLDER;
    expect(isCurrentDirectoryTrusted()).toBe(true);
  });

  it('should return true for a child of a trusted parent folder', () => {
    mockCwd = '/home/user/projectB';
    mockRules['/home/user/projectB/somefile.txt'] = TrustLevel.TRUST_PARENT;
    expect(isCurrentDirectoryTrusted()).toBe(true);
  });

  it('should return false for a directly untrusted folder', () => {
    mockCwd = '/home/user/untrusted';
    mockRules['/home/user/untrusted'] = TrustLevel.DO_NOT_TRUST;
    expect(isCurrentDirectoryTrusted()).toBe(false);
  });

  it('should return undefined for a child of an untrusted folder', () => {
    mockCwd = '/home/user/untrusted/src';
    mockRules['/home/user/untrusted'] = TrustLevel.DO_NOT_TRUST;
    expect(isCurrentDirectoryTrusted()).toBeUndefined();
  });

  it('should return undefined when no rules match', () => {
    mockCwd = '/home/user/other';
    mockRules['/home/user/projectA'] = TrustLevel.TRUST_FOLDER;
    mockRules['/home/user/untrusted'] = TrustLevel.DO_NOT_TRUST;
    expect(isCurrentDirectoryTrusted()).toBeUndefined();
  });

  it('should prioritize trust over distrust', () => {
    mockCwd = '/home/user/projectA/untrusted';
    mockRules['/home/user/projectA'] = TrustLevel.TRUST_FOLDER;
    mockRules['/home/user/projectA/untrusted'] = TrustLevel.DO_NOT_TRUST;
    expect(isCurrentDirectoryTrusted()).toBe(true);
  });

  it('should handle path normalization', () => {
    mockCwd = '/home/user/projectA';
    mockRules[`/home/user/../user/${path.basename('/home/user/projectA')}`] =
      TrustLevel.TRUST_FOLDER;
    expect(isCurrentDirectoryTrusted()).toBe(true);
  });
});
