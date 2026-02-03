/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as osActual from 'node:os';
import {
  FatalConfigError,
  ideContextStore,
  AuthType,
} from '@google/gemini-cli-core';
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
import * as fs from 'node:fs';
import stripJsonComments from 'strip-json-comments';
import * as path from 'node:path';
import {
  loadTrustedFolders,
  getTrustedFoldersPath,
  TrustLevel,
  isWorkspaceTrusted,
  resetTrustedFoldersForTesting,
} from './trustedFolders.js';
import { loadEnvironment, getSettingsSchema } from './settings.js';
import { createMockSettings } from '../test-utils/settings.js';
import { validateAuthMethod } from './auth.js';
import type { Settings } from './settings.js';

vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof osActual>();
  return {
    ...actualOs,
    homedir: vi.fn(() => '/mock/home/user'),
    platform: vi.fn(() => 'linux'),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: () => '/mock/home/user',
  };
});
vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof fs>();
  return {
    ...actualFs,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    realpathSync: vi.fn().mockImplementation((p) => p),
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
    resetTrustedFoldersForTesting();
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

  describe('isPathTrusted', () => {
    function setup({ config = {} as Record<string, TrustLevel> } = {}) {
      (mockFsExistsSync as Mock).mockImplementation(
        (p) => p === getTrustedFoldersPath(),
      );
      (fs.readFileSync as Mock).mockImplementation((p) => {
        if (p === getTrustedFoldersPath()) return JSON.stringify(config);
        return '{}';
      });

      const folders = loadTrustedFolders();

      return { folders };
    }

    it('provides a method to determine if a path is trusted', () => {
      const { folders } = setup({
        config: {
          './myfolder': TrustLevel.TRUST_FOLDER,
          '/trustedparent/trustme': TrustLevel.TRUST_PARENT,
          '/user/folder': TrustLevel.TRUST_FOLDER,
          '/secret': TrustLevel.DO_NOT_TRUST,
          '/secret/publickeys': TrustLevel.TRUST_FOLDER,
        },
      });
      expect(folders.isPathTrusted('/secret')).toBe(false);
      expect(folders.isPathTrusted('/user/folder')).toBe(true);
      expect(folders.isPathTrusted('/secret/publickeys/public.pem')).toBe(true);
      expect(folders.isPathTrusted('/user/folder/harhar')).toBe(true);
      expect(folders.isPathTrusted('myfolder/somefile.jpg')).toBe(true);
      expect(folders.isPathTrusted('/trustedparent/someotherfolder')).toBe(
        true,
      );
      expect(folders.isPathTrusted('/trustedparent/trustme')).toBe(true);

      // No explicit rule covers this file
      expect(folders.isPathTrusted('/secret/bankaccounts.json')).toBe(
        undefined,
      );
      expect(folders.isPathTrusted('/secret/mine/privatekey.pem')).toBe(
        undefined,
      );
      expect(folders.isPathTrusted('/user/someotherfolder')).toBe(undefined);
    });
  });

  it('should load user rules if only user file exists', () => {
    const userPath = getTrustedFoldersPath();
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

  it('should handle JSON parsing errors gracefully', () => {
    const userPath = getTrustedFoldersPath();
    (mockFsExistsSync as Mock).mockImplementation((p) => p === userPath);
    (fs.readFileSync as Mock).mockImplementation((p) => {
      if (p === userPath) return 'invalid json';
      return '{}';
    });

    const { rules, errors } = loadTrustedFolders();
    expect(rules).toEqual([]);
    expect(errors.length).toBe(1);
    expect(errors[0].path).toBe(userPath);
    expect(errors[0].message).toContain('Unexpected token');
  });

  it('should use GEMINI_CLI_TRUSTED_FOLDERS_PATH env var if set', () => {
    const customPath = '/custom/path/to/trusted_folders.json';
    process.env['GEMINI_CLI_TRUSTED_FOLDERS_PATH'] = customPath;

    (mockFsExistsSync as Mock).mockImplementation((p) => p === customPath);
    const userContent = {
      '/user/folder/from/env': TrustLevel.TRUST_FOLDER,
    };
    (fs.readFileSync as Mock).mockImplementation((p) => {
      if (p === customPath) return JSON.stringify(userContent);
      return '{}';
    });

    const { rules, errors } = loadTrustedFolders();
    expect(rules).toEqual([
      {
        path: '/user/folder/from/env',
        trustLevel: TrustLevel.TRUST_FOLDER,
      },
    ]);
    expect(errors).toEqual([]);

    delete process.env['GEMINI_CLI_TRUSTED_FOLDERS_PATH'];
  });

  it('setValue should update the user config and save it', () => {
    const loadedFolders = loadTrustedFolders();
    loadedFolders.setValue('/new/path', TrustLevel.TRUST_FOLDER);

    expect(loadedFolders.user.config['/new/path']).toBe(
      TrustLevel.TRUST_FOLDER,
    );
    expect(mockFsWriteFileSync).toHaveBeenCalledWith(
      getTrustedFoldersPath(),
      JSON.stringify({ '/new/path': TrustLevel.TRUST_FOLDER }, null, 2),
      { encoding: 'utf-8', mode: 0o600 },
    );
  });
});

describe('isWorkspaceTrusted', () => {
  let mockCwd: string;
  const mockRules: Record<string, TrustLevel> = {};
  const mockSettings: Settings = {
    security: {
      folderTrust: {
        enabled: true,
      },
    },
  };

  beforeEach(() => {
    resetTrustedFoldersForTesting();
    vi.spyOn(process, 'cwd').mockImplementation(() => mockCwd);
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p === getTrustedFoldersPath()) {
        return JSON.stringify(mockRules);
      }
      return '{}';
    });
    vi.spyOn(fs, 'existsSync').mockImplementation(
      (p) => p === getTrustedFoldersPath(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clear the object
    Object.keys(mockRules).forEach((key) => delete mockRules[key]);
  });

  it('should throw a fatal error if the config is malformed', () => {
    mockCwd = '/home/user/projectA';
    // This mock needs to be specific to this test to override the one in beforeEach
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p === getTrustedFoldersPath()) {
        return '{"foo": "bar",}'; // Malformed JSON with trailing comma
      }
      return '{}';
    });
    expect(() => isWorkspaceTrusted(mockSettings)).toThrow(FatalConfigError);
    expect(() => isWorkspaceTrusted(mockSettings)).toThrow(
      /Please fix the configuration file/,
    );
  });

  it('should throw a fatal error if the config is not a JSON object', () => {
    mockCwd = '/home/user/projectA';
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p === getTrustedFoldersPath()) {
        return 'null';
      }
      return '{}';
    });
    expect(() => isWorkspaceTrusted(mockSettings)).toThrow(FatalConfigError);
    expect(() => isWorkspaceTrusted(mockSettings)).toThrow(
      /not a valid JSON object/,
    );
  });

  it('should return true for a directly trusted folder', () => {
    mockCwd = '/home/user/projectA';
    mockRules['/home/user/projectA'] = TrustLevel.TRUST_FOLDER;
    expect(isWorkspaceTrusted(mockSettings)).toEqual({
      isTrusted: true,
      source: 'file',
    });
  });

  it('should return true for a child of a trusted folder', () => {
    mockCwd = '/home/user/projectA/src';
    mockRules['/home/user/projectA'] = TrustLevel.TRUST_FOLDER;
    expect(isWorkspaceTrusted(mockSettings)).toEqual({
      isTrusted: true,
      source: 'file',
    });
  });

  it('should return true for a child of a trusted parent folder', () => {
    mockCwd = '/home/user/projectB';
    mockRules['/home/user/projectB/somefile.txt'] = TrustLevel.TRUST_PARENT;
    expect(isWorkspaceTrusted(mockSettings)).toEqual({
      isTrusted: true,
      source: 'file',
    });
  });

  it('should return false for a directly untrusted folder', () => {
    mockCwd = '/home/user/untrusted';
    mockRules['/home/user/untrusted'] = TrustLevel.DO_NOT_TRUST;
    expect(isWorkspaceTrusted(mockSettings)).toEqual({
      isTrusted: false,
      source: 'file',
    });
  });

  it('should return undefined for a child of an untrusted folder', () => {
    mockCwd = '/home/user/untrusted/src';
    mockRules['/home/user/untrusted'] = TrustLevel.DO_NOT_TRUST;
    expect(isWorkspaceTrusted(mockSettings).isTrusted).toBeUndefined();
  });

  it('should return undefined when no rules match', () => {
    mockCwd = '/home/user/other';
    mockRules['/home/user/projectA'] = TrustLevel.TRUST_FOLDER;
    mockRules['/home/user/untrusted'] = TrustLevel.DO_NOT_TRUST;
    expect(isWorkspaceTrusted(mockSettings).isTrusted).toBeUndefined();
  });

  it('should prioritize trust over distrust', () => {
    mockCwd = '/home/user/projectA/untrusted';
    mockRules['/home/user/projectA'] = TrustLevel.TRUST_FOLDER;
    mockRules['/home/user/projectA/untrusted'] = TrustLevel.DO_NOT_TRUST;
    expect(isWorkspaceTrusted(mockSettings)).toEqual({
      isTrusted: true,
      source: 'file',
    });
  });

  it('should use workspaceDir instead of process.cwd() when provided', () => {
    mockCwd = '/home/user/untrusted';
    const workspaceDir = '/home/user/projectA';
    mockRules['/home/user/projectA'] = TrustLevel.TRUST_FOLDER;
    mockRules['/home/user/untrusted'] = TrustLevel.DO_NOT_TRUST;

    // process.cwd() is untrusted, but workspaceDir is trusted
    expect(isWorkspaceTrusted(mockSettings, workspaceDir)).toEqual({
      isTrusted: true,
      source: 'file',
    });
  });

  it('should handle path normalization', () => {
    mockCwd = '/home/user/projectA';
    mockRules[`/home/user/../user/${path.basename('/home/user/projectA')}`] =
      TrustLevel.TRUST_FOLDER;
    expect(isWorkspaceTrusted(mockSettings)).toEqual({
      isTrusted: true,
      source: 'file',
    });
  });
});

describe('isWorkspaceTrusted with IDE override', () => {
  afterEach(() => {
    vi.clearAllMocks();
    ideContextStore.clear();
    resetTrustedFoldersForTesting();
  });

  const mockSettings: Settings = {
    security: {
      folderTrust: {
        enabled: true,
      },
    },
  };

  it('should return true when ideTrust is true, ignoring config', () => {
    ideContextStore.set({ workspaceState: { isTrusted: true } });
    // Even if config says don't trust, ideTrust should win.
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ [process.cwd()]: TrustLevel.DO_NOT_TRUST }),
    );
    expect(isWorkspaceTrusted(mockSettings)).toEqual({
      isTrusted: true,
      source: 'ide',
    });
  });

  it('should return false when ideTrust is false, ignoring config', () => {
    ideContextStore.set({ workspaceState: { isTrusted: false } });
    // Even if config says trust, ideTrust should win.
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ [process.cwd()]: TrustLevel.TRUST_FOLDER }),
    );
    expect(isWorkspaceTrusted(mockSettings)).toEqual({
      isTrusted: false,
      source: 'ide',
    });
  });

  it('should fall back to config when ideTrust is undefined', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ [process.cwd()]: TrustLevel.TRUST_FOLDER }),
    );
    expect(isWorkspaceTrusted(mockSettings)).toEqual({
      isTrusted: true,
      source: 'file',
    });
  });

  it('should always return true if folderTrust setting is disabled', () => {
    const settings: Settings = {
      security: {
        folderTrust: {
          enabled: false,
        },
      },
    };
    ideContextStore.set({ workspaceState: { isTrusted: false } });
    expect(isWorkspaceTrusted(settings)).toEqual({
      isTrusted: true,
      source: undefined,
    });
  });
});

describe('Trusted Folders Caching', () => {
  beforeEach(() => {
    resetTrustedFoldersForTesting();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should cache the loaded folders object', () => {
    const readSpy = vi.spyOn(fs, 'readFileSync');

    // First call should read the file
    loadTrustedFolders();
    expect(readSpy).toHaveBeenCalledTimes(1);

    // Second call should use the cache
    loadTrustedFolders();
    expect(readSpy).toHaveBeenCalledTimes(1);

    // Resetting should clear the cache
    resetTrustedFoldersForTesting();

    // Third call should read the file again
    loadTrustedFolders();
    expect(readSpy).toHaveBeenCalledTimes(2);
  });
});

describe('invalid trust levels', () => {
  const mockCwd = '/user/folder';
  const mockRules: Record<string, TrustLevel> = {};

  beforeEach(() => {
    resetTrustedFoldersForTesting();
    vi.spyOn(process, 'cwd').mockImplementation(() => mockCwd);
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p === getTrustedFoldersPath()) {
        return JSON.stringify(mockRules);
      }
      return '{}';
    });
    vi.spyOn(fs, 'existsSync').mockImplementation(
      (p) => p === getTrustedFoldersPath(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clear the object
    Object.keys(mockRules).forEach((key) => delete mockRules[key]);
  });

  it('should create a comprehensive error message for invalid trust level', () => {
    mockRules[mockCwd] = 'INVALID_TRUST_LEVEL' as TrustLevel;

    const { errors } = loadTrustedFolders();
    const possibleValues = Object.values(TrustLevel).join(', ');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe(
      `Invalid trust level "INVALID_TRUST_LEVEL" for path "${mockCwd}". Possible values are: ${possibleValues}.`,
    );
  });

  it('should throw a fatal error for invalid trust level', () => {
    const mockSettings: Settings = {
      security: {
        folderTrust: {
          enabled: true,
        },
      },
    };
    mockRules[mockCwd] = 'INVALID_TRUST_LEVEL' as TrustLevel;

    expect(() => isWorkspaceTrusted(mockSettings)).toThrow(FatalConfigError);
  });
});

describe('Verification: Auth and Trust Interaction', () => {
  let mockCwd: string;
  const mockRules: Record<string, TrustLevel> = {};

  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', '');
    resetTrustedFoldersForTesting();
    vi.spyOn(process, 'cwd').mockImplementation(() => mockCwd);
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p === getTrustedFoldersPath()) {
        return JSON.stringify(mockRules);
      }
      if (p === path.resolve(mockCwd, '.env')) {
        return 'GEMINI_API_KEY=shhh-secret';
      }
      return '{}';
    });
    vi.spyOn(fs, 'existsSync').mockImplementation(
      (p) =>
        p === getTrustedFoldersPath() || p === path.resolve(mockCwd, '.env'),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.keys(mockRules).forEach((key) => delete mockRules[key]);
  });

  it('should verify loadEnvironment returns early and validateAuthMethod fails when untrusted', () => {
    // 1. Mock untrusted workspace
    mockCwd = '/home/user/untrusted';
    mockRules[mockCwd] = TrustLevel.DO_NOT_TRUST;

    // 2. Load environment (should return early)
    const settings = createMockSettings({
      security: { folderTrust: { enabled: true } },
    });
    loadEnvironment(settings.merged, mockCwd);

    // 3. Verify env var NOT loaded
    expect(process.env['GEMINI_API_KEY']).toBe('');

    // 4. Verify validateAuthMethod fails
    const result = validateAuthMethod(AuthType.USE_GEMINI);
    expect(result).toContain(
      'you must specify the GEMINI_API_KEY environment variable',
    );
  });

  it('should identify if sandbox flag is available in Settings', () => {
    const schema = getSettingsSchema();
    expect(schema.tools.properties).toBeDefined();
    expect('sandbox' in schema.tools.properties).toBe(true);
  });
});
