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
  let mockStripJsonComments: Mocked<typeof stripJsonComments>;
  let mockFsWriteFileSync: Mocked<typeof fs.writeFileSync>;

  beforeEach(() => {
    resetTrustedFoldersForTesting();
    vi.resetAllMocks();
    mockStripJsonComments = vi.mocked(stripJsonComments);
    mockFsWriteFileSync = vi.mocked(fs.writeFileSync);
    vi.mocked(osActual.homedir).mockReturnValue('/mock/home/user');
    (mockStripJsonComments as unknown as Mock).mockImplementation(
      (jsonString: string) => jsonString,
    );
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.realpathSync).mockImplementation((p: fs.PathLike) =>
      p.toString(),
    );
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
      vi.mocked(fs.existsSync).mockImplementation(
        (p: fs.PathLike) => p.toString() === getTrustedFoldersPath(),
      );
      vi.mocked(fs.readFileSync).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p.toString() === getTrustedFoldersPath())
            return JSON.stringify(config);
          return '{}';
        },
      );

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
      expect(folders.isPathTrusted('/secret/bankaccounts.json')).toBe(false);
      expect(folders.isPathTrusted('/secret/mine/privatekey.pem')).toBe(false);
      expect(folders.isPathTrusted('/user/someotherfolder')).toBe(undefined);
    });

    it('prioritizes the longest matching path (precedence)', () => {
      const { folders } = setup({
        config: {
          '/a': TrustLevel.TRUST_FOLDER,
          '/a/b': TrustLevel.DO_NOT_TRUST,
          '/a/b/c': TrustLevel.TRUST_FOLDER,
          '/parent/trustme': TrustLevel.TRUST_PARENT, // effective path is /parent
          '/parent/trustme/butnotthis': TrustLevel.DO_NOT_TRUST,
        },
      });

      // /a/b/c/d matches /a (len 2), /a/b (len 4), /a/b/c (len 6).
      // /a/b/c wins (TRUST_FOLDER).
      expect(folders.isPathTrusted('/a/b/c/d')).toBe(true);

      // /a/b/x matches /a (len 2), /a/b (len 4).
      // /a/b wins (DO_NOT_TRUST).
      expect(folders.isPathTrusted('/a/b/x')).toBe(false);

      // /a/x matches /a (len 2).
      // /a wins (TRUST_FOLDER).
      expect(folders.isPathTrusted('/a/x')).toBe(true);

      // Overlap with TRUST_PARENT
      // /parent/trustme/butnotthis/file matches:
      // - /parent/trustme (len 15, TRUST_PARENT -> effective /parent)
      // - /parent/trustme/butnotthis (len 26, DO_NOT_TRUST)
      // /parent/trustme/butnotthis wins.
      expect(folders.isPathTrusted('/parent/trustme/butnotthis/file')).toBe(
        false,
      );

      // /parent/other matches /parent/trustme (len 15, effective /parent)
      expect(folders.isPathTrusted('/parent/other')).toBe(true);
    });
  });

  it('should load user rules if only user file exists', () => {
    const userPath = getTrustedFoldersPath();
    vi.mocked(fs.existsSync).mockImplementation(
      (p: fs.PathLike) => p.toString() === userPath,
    );
    const userContent = {
      '/user/folder': TrustLevel.TRUST_FOLDER,
    };
    vi.mocked(fs.readFileSync).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p.toString() === userPath) return JSON.stringify(userContent);
        return '{}';
      },
    );

    const { rules, errors } = loadTrustedFolders();
    expect(rules).toEqual([
      { path: '/user/folder', trustLevel: TrustLevel.TRUST_FOLDER },
    ]);
    expect(errors).toEqual([]);
  });

  it('should handle JSON parsing errors gracefully', () => {
    const userPath = getTrustedFoldersPath();
    vi.mocked(fs.existsSync).mockImplementation(
      (p: fs.PathLike) => p.toString() === userPath,
    );
    vi.mocked(fs.readFileSync).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p.toString() === userPath) return 'invalid json';
        return '{}';
      },
    );

    const { rules, errors } = loadTrustedFolders();
    expect(rules).toEqual([]);
    expect(errors.length).toBe(1);
    expect(errors[0].path).toBe(userPath);
    expect(errors[0].message).toContain('Unexpected token');
  });

  it('should use GEMINI_CLI_TRUSTED_FOLDERS_PATH env var if set', () => {
    const customPath = '/custom/path/to/trusted_folders.json';
    process.env['GEMINI_CLI_TRUSTED_FOLDERS_PATH'] = customPath;

    vi.mocked(fs.existsSync).mockImplementation(
      (p: fs.PathLike) => p.toString() === customPath,
    );
    const userContent = {
      '/user/folder/from/env': TrustLevel.TRUST_FOLDER,
    };
    vi.mocked(fs.readFileSync).mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p.toString() === customPath) return JSON.stringify(userContent);
        return '{}';
      },
    );

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
    vi.spyOn(fs, 'readFileSync').mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p.toString() === getTrustedFoldersPath()) {
          return JSON.stringify(mockRules);
        }
        return '{}';
      },
    );
    vi.spyOn(fs, 'existsSync').mockImplementation(
      (p: fs.PathLike) => p.toString() === getTrustedFoldersPath(),
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
    vi.spyOn(fs, 'readFileSync').mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p.toString() === getTrustedFoldersPath()) {
          return '{"foo": "bar",}'; // Malformed JSON with trailing comma
        }
        return '{}';
      },
    );
    expect(() => isWorkspaceTrusted(mockSettings)).toThrow(FatalConfigError);
    expect(() => isWorkspaceTrusted(mockSettings)).toThrow(
      /Please fix the configuration file/,
    );
  });

  it('should throw a fatal error if the config is not a JSON object', () => {
    mockCwd = '/home/user/projectA';
    vi.spyOn(fs, 'readFileSync').mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p.toString() === getTrustedFoldersPath()) {
          return 'null';
        }
        return '{}';
      },
    );
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

  it('should return false for a child of an untrusted folder', () => {
    mockCwd = '/home/user/untrusted/src';
    mockRules['/home/user/untrusted'] = TrustLevel.DO_NOT_TRUST;
    expect(isWorkspaceTrusted(mockSettings).isTrusted).toBe(false);
  });

  it('should return undefined when no rules match', () => {
    mockCwd = '/home/user/other';
    mockRules['/home/user/projectA'] = TrustLevel.TRUST_FOLDER;
    mockRules['/home/user/untrusted'] = TrustLevel.DO_NOT_TRUST;
    expect(isWorkspaceTrusted(mockSettings).isTrusted).toBeUndefined();
  });

  it('should prioritize specific distrust over parent trust', () => {
    mockCwd = '/home/user/projectA/untrusted';
    mockRules['/home/user/projectA'] = TrustLevel.TRUST_FOLDER;
    mockRules['/home/user/projectA/untrusted'] = TrustLevel.DO_NOT_TRUST;
    expect(isWorkspaceTrusted(mockSettings)).toEqual({
      isTrusted: false,
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
  const mockCwd = '/home/user/projectA';

  beforeEach(() => {
    resetTrustedFoldersForTesting();
    vi.spyOn(process, 'cwd').mockImplementation(() => mockCwd);
    vi.spyOn(fs, 'realpathSync').mockImplementation((p: fs.PathLike) =>
      p.toString(),
    );
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) =>
      p.toString().endsWith('trustedFolders.json') ? false : true,
    );
  });

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
    vi.spyOn(fs, 'existsSync').mockImplementation((p) =>
      p === getTrustedFoldersPath() || p === mockCwd ? true : false,
    );
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p === getTrustedFoldersPath()) {
        return JSON.stringify({ [mockCwd]: TrustLevel.TRUST_FOLDER });
      }
      return '{}';
    });
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
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{}');
    vi.spyOn(fs, 'realpathSync').mockImplementation((p: fs.PathLike) =>
      p.toString(),
    );
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
    vi.spyOn(fs, 'realpathSync').mockImplementation((p: fs.PathLike) =>
      p.toString(),
    );
    vi.spyOn(fs, 'readFileSync').mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p.toString() === getTrustedFoldersPath()) {
          return JSON.stringify(mockRules);
        }
        return '{}';
      },
    );
    vi.spyOn(fs, 'existsSync').mockImplementation(
      (p: fs.PathLike) =>
        p.toString() === getTrustedFoldersPath() || p.toString() === mockCwd,
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

describe('Trusted Folders realpath caching', () => {
  beforeEach(() => {
    resetTrustedFoldersForTesting();
    vi.resetAllMocks();
    vi.spyOn(fs, 'realpathSync').mockImplementation((p: fs.PathLike) =>
      p.toString(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should only call fs.realpathSync once for the same path', () => {
    const mockPath = '/some/path';
    const mockRealPath = '/real/path';

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const realpathSpy = vi
      .spyOn(fs, 'realpathSync')
      .mockReturnValue(mockRealPath);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        [mockPath]: TrustLevel.TRUST_FOLDER,
        '/another/path': TrustLevel.TRUST_FOLDER,
      }),
    );

    const folders = loadTrustedFolders();

    // Call isPathTrusted multiple times with the same path
    folders.isPathTrusted(mockPath);
    folders.isPathTrusted(mockPath);
    folders.isPathTrusted(mockPath);

    // fs.realpathSync should only be called once for mockPath (at the start of isPathTrusted)
    // And once for each rule in the config (if they are different)

    // Let's check calls for mockPath
    const mockPathCalls = realpathSpy.mock.calls.filter(
      (call) => call[0] === mockPath,
    );

    expect(mockPathCalls.length).toBe(1);
  });

  it('should cache results for rule paths in the loop', () => {
    const rulePath = '/rule/path';
    const locationPath = '/location/path';

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const realpathSpy = vi
      .spyOn(fs, 'realpathSync')
      .mockImplementation((p: fs.PathLike) => p.toString()); // identity for simplicity
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        [rulePath]: TrustLevel.TRUST_FOLDER,
      }),
    );

    const folders = loadTrustedFolders();

    // First call
    folders.isPathTrusted(locationPath);
    const firstCallCount = realpathSpy.mock.calls.length;
    expect(firstCallCount).toBe(2); // locationPath and rulePath

    // Second call with same location and same config
    folders.isPathTrusted(locationPath);
    const secondCallCount = realpathSpy.mock.calls.length;

    // Should still be 2 because both were cached
    expect(secondCallCount).toBe(2);
  });
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
    vi.spyOn(fs, 'realpathSync').mockImplementation((p: fs.PathLike) =>
      p.toString(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should trust a folder even if CWD is a symlink and rule is realpath', () => {
    const symlinkPath = '/var/folders/project';
    const realPath = '/private/var/folders/project';

    vi.spyOn(process, 'cwd').mockReturnValue(symlinkPath);

    // Mock fs.existsSync to return true for trust config and both paths
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const pathStr = p.toString();
      if (pathStr === getTrustedFoldersPath()) return true;
      if (pathStr === symlinkPath) return true;
      if (pathStr === realPath) return true;
      return false;
    });

    // Mock realpathSync to resolve symlink to realpath
    vi.spyOn(fs, 'realpathSync').mockImplementation((p: fs.PathLike) => {
      const pathStr = p.toString();
      if (pathStr === symlinkPath) return realPath;
      if (pathStr === realPath) return realPath;
      return pathStr;
    });

    // Rule is saved with realpath
    const mockRules = {
      [realPath]: TrustLevel.TRUST_FOLDER,
    };
    vi.spyOn(fs, 'readFileSync').mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p.toString() === getTrustedFoldersPath())
          return JSON.stringify(mockRules);
        return '{}';
      },
    );

    // Should be trusted because both resolve to the same realpath
    expect(isWorkspaceTrusted(mockSettings).isTrusted).toBe(true);
  });

  it('should trust a folder even if CWD is realpath and rule is a symlink', () => {
    const symlinkPath = '/var/folders/project';
    const realPath = '/private/var/folders/project';

    vi.spyOn(process, 'cwd').mockReturnValue(realPath);

    // Mock fs.existsSync
    vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
      const pathStr = p.toString();
      if (pathStr === getTrustedFoldersPath()) return true;
      if (pathStr === symlinkPath) return true;
      if (pathStr === realPath) return true;
      return false;
    });

    // Mock realpathSync
    vi.spyOn(fs, 'realpathSync').mockImplementation((p: fs.PathLike) => {
      const pathStr = p.toString();
      if (pathStr === symlinkPath) return realPath;
      if (pathStr === realPath) return realPath;
      return pathStr;
    });

    // Rule is saved with symlink path
    const mockRules = {
      [symlinkPath]: TrustLevel.TRUST_FOLDER,
    };
    vi.spyOn(fs, 'readFileSync').mockImplementation(
      (p: fs.PathOrFileDescriptor) => {
        if (p.toString() === getTrustedFoldersPath())
          return JSON.stringify(mockRules);
        return '{}';
      },
    );

    // Should be trusted because both resolve to the same realpath
    expect(isWorkspaceTrusted(mockSettings).isTrusted).toBe(true);
  });
});
