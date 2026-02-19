/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest';

vi.unmock('./storage.js');
vi.unmock('./projectRegistry.js');
vi.unmock('./storageMigration.js');

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
  };
});

import { Storage } from './storage.js';
import { GEMINI_DIR, homedir } from '../utils/paths.js';
import { ProjectRegistry } from './projectRegistry.js';
import { StorageMigration } from './storageMigration.js';

const PROJECT_SLUG = 'project-slug';

vi.mock('./projectRegistry.js');
vi.mock('./storageMigration.js');

describe('Storage – initialize', () => {
  const projectRoot = '/tmp/project';
  let storage: Storage;

  beforeEach(() => {
    ProjectRegistry.prototype.initialize = vi.fn().mockResolvedValue(undefined);
    ProjectRegistry.prototype.getShortId = vi
      .fn()
      .mockReturnValue(PROJECT_SLUG);
    storage = new Storage(projectRoot);
    vi.clearAllMocks();

    // Mock StorageMigration.migrateDirectory
    vi.mocked(StorageMigration.migrateDirectory).mockResolvedValue(undefined);
  });

  it('sets up the registry and performs migration if `getProjectTempDir` is called', async () => {
    await storage.initialize();
    expect(storage.getProjectTempDir()).toBe(
      path.join(os.homedir(), GEMINI_DIR, 'tmp', PROJECT_SLUG),
    );

    // Verify registry initialization
    expect(ProjectRegistry).toHaveBeenCalled();
    expect(vi.mocked(ProjectRegistry).prototype.initialize).toHaveBeenCalled();
    expect(
      vi.mocked(ProjectRegistry).prototype.getShortId,
    ).toHaveBeenCalledWith(projectRoot);

    // Verify migration calls
    const shortId = 'project-slug';
    // We can't easily get the hash here without repeating logic, but we can verify it's called twice
    expect(StorageMigration.migrateDirectory).toHaveBeenCalledTimes(2);

    // Verify identifier is set by checking a path
    expect(storage.getProjectTempDir()).toContain(shortId);
  });
});

vi.mock('../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths.js')>();
  return {
    ...actual,
    homedir: vi.fn(actual.homedir),
  };
});

describe('Storage – getGlobalSettingsPath', () => {
  it('returns path to ~/.gemini/settings.json', () => {
    const expected = path.join(os.homedir(), GEMINI_DIR, 'settings.json');
    expect(Storage.getGlobalSettingsPath()).toBe(expected);
  });
});

describe('Storage - Security', () => {
  it('falls back to tmp for gemini but returns empty for agents if the home directory cannot be determined', () => {
    vi.mocked(homedir).mockReturnValue('');

    // .gemini falls back for backward compatibility
    expect(Storage.getGlobalGeminiDir()).toBe(
      path.join(os.tmpdir(), GEMINI_DIR),
    );

    // .agents returns empty to avoid insecure fallback WITHOUT throwing error
    expect(Storage.getGlobalAgentsDir()).toBe('');

    vi.mocked(homedir).mockReturnValue(os.homedir());
  });
});

describe('Storage – additional helpers', () => {
  const projectRoot = '/tmp/project';
  const storage = new Storage(projectRoot);

  it('getWorkspaceSettingsPath returns project/.gemini/settings.json', () => {
    const expected = path.join(projectRoot, GEMINI_DIR, 'settings.json');
    expect(storage.getWorkspaceSettingsPath()).toBe(expected);
  });

  it('getUserCommandsDir returns ~/.gemini/commands', () => {
    const expected = path.join(os.homedir(), GEMINI_DIR, 'commands');
    expect(Storage.getUserCommandsDir()).toBe(expected);
  });

  it('getProjectCommandsDir returns project/.gemini/commands', () => {
    const expected = path.join(projectRoot, GEMINI_DIR, 'commands');
    expect(storage.getProjectCommandsDir()).toBe(expected);
  });

  it('getUserSkillsDir returns ~/.gemini/skills', () => {
    const expected = path.join(os.homedir(), GEMINI_DIR, 'skills');
    expect(Storage.getUserSkillsDir()).toBe(expected);
  });

  it('getProjectSkillsDir returns project/.gemini/skills', () => {
    const expected = path.join(projectRoot, GEMINI_DIR, 'skills');
    expect(storage.getProjectSkillsDir()).toBe(expected);
  });

  it('getUserAgentsDir returns ~/.gemini/agents', () => {
    const expected = path.join(os.homedir(), GEMINI_DIR, 'agents');
    expect(Storage.getUserAgentsDir()).toBe(expected);
  });

  it('getProjectAgentsDir returns project/.gemini/agents', () => {
    const expected = path.join(projectRoot, GEMINI_DIR, 'agents');
    expect(storage.getProjectAgentsDir()).toBe(expected);
  });

  it('getMcpOAuthTokensPath returns ~/.gemini/mcp-oauth-tokens.json', () => {
    const expected = path.join(
      os.homedir(),
      GEMINI_DIR,
      'mcp-oauth-tokens.json',
    );
    expect(Storage.getMcpOAuthTokensPath()).toBe(expected);
  });

  it('getGlobalBinDir returns ~/.gemini/tmp/bin', () => {
    const expected = path.join(os.homedir(), GEMINI_DIR, 'tmp', 'bin');
    expect(Storage.getGlobalBinDir()).toBe(expected);
  });

  it('getProjectTempPlansDir returns ~/.gemini/tmp/<identifier>/plans when no sessionId is provided', async () => {
    await storage.initialize();
    const tempDir = storage.getProjectTempDir();
    const expected = path.join(tempDir, 'plans');
    expect(storage.getProjectTempPlansDir()).toBe(expected);
  });

  it('getProjectTempPlansDir returns ~/.gemini/tmp/<identifier>/<sessionId>/plans when sessionId is provided', async () => {
    const sessionId = 'test-session-id';
    const storageWithSession = new Storage(projectRoot, sessionId);
    ProjectRegistry.prototype.getShortId = vi
      .fn()
      .mockReturnValue(PROJECT_SLUG);
    await storageWithSession.initialize();
    const tempDir = storageWithSession.getProjectTempDir();
    const expected = path.join(tempDir, sessionId, 'plans');
    expect(storageWithSession.getProjectTempPlansDir()).toBe(expected);
  });

  describe('Session and JSON Loading', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    it('listProjectChatFiles returns sorted sessions from chats directory', async () => {
      const readdirSpy = vi
        .spyOn(fs.promises, 'readdir')
        /* eslint-disable @typescript-eslint/no-explicit-any */
        .mockResolvedValue([
          'session-1.json',
          'session-2.json',
          'not-a-session.txt',
        ] as any);

      const statSpy = vi
        .spyOn(fs.promises, 'stat')
        .mockImplementation(async (p: any) => {
          if (p.toString().endsWith('session-1.json')) {
            return {
              mtime: new Date('2026-02-01'),
              mtimeMs: 1000,
            } as any;
          }
          return {
            mtime: new Date('2026-02-02'),
            mtimeMs: 2000,
          } as any;
        });
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const sessions = await storage.listProjectChatFiles();

      expect(readdirSpy).toHaveBeenCalledWith(expect.stringContaining('chats'));
      expect(sessions).toHaveLength(2);
      // Sorted by mtime desc
      expect(sessions[0].filePath).toBe(path.join('chats', 'session-2.json'));
      expect(sessions[1].filePath).toBe(path.join('chats', 'session-1.json'));
      expect(sessions[0].lastUpdated).toBe(
        new Date('2026-02-02').toISOString(),
      );

      readdirSpy.mockRestore();
      statSpy.mockRestore();
    });

    it('loadProjectTempFile loads and parses JSON from relative path', async () => {
      const readFileSpy = vi
        .spyOn(fs.promises, 'readFile')
        .mockResolvedValue(JSON.stringify({ hello: 'world' }));

      const result = await storage.loadProjectTempFile<{ hello: string }>(
        'some/file.json',
      );

      expect(readFileSpy).toHaveBeenCalledWith(
        expect.stringContaining(path.join(PROJECT_SLUG, 'some/file.json')),
        'utf8',
      );
      expect(result).toEqual({ hello: 'world' });

      readFileSpy.mockRestore();
    });

    it('loadProjectTempFile returns null if file does not exist', async () => {
      const error = new Error('File not found');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code = 'ENOENT';
      const readFileSpy = vi
        .spyOn(fs.promises, 'readFile')
        .mockRejectedValue(error);

      const result = await storage.loadProjectTempFile('missing.json');

      expect(result).toBeNull();

      readFileSpy.mockRestore();
    });
  });
});

describe('Storage - System Paths', () => {
  const originalEnv = process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] = originalEnv;
    } else {
      delete process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
    }
  });

  it('getSystemSettingsPath returns correct path based on platform (default)', () => {
    delete process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];

    const platform = os.platform();
    const result = Storage.getSystemSettingsPath();

    if (platform === 'darwin') {
      expect(result).toBe(
        '/Library/Application Support/GeminiCli/settings.json',
      );
    } else if (platform === 'win32') {
      expect(result).toBe('C:\\ProgramData\\gemini-cli\\settings.json');
    } else {
      expect(result).toBe('/etc/gemini-cli/settings.json');
    }
  });

  it('getSystemSettingsPath follows GEMINI_CLI_SYSTEM_SETTINGS_PATH if set', () => {
    const customPath = '/custom/path/settings.json';
    process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] = customPath;
    expect(Storage.getSystemSettingsPath()).toBe(customPath);
  });

  it('getSystemPoliciesDir returns correct path based on platform and ignores env var', () => {
    process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] =
      '/custom/path/settings.json';
    const platform = os.platform();
    const result = Storage.getSystemPoliciesDir();

    expect(result).not.toContain('/custom/path');

    if (platform === 'darwin') {
      expect(result).toBe('/Library/Application Support/GeminiCli/policies');
    } else if (platform === 'win32') {
      expect(result).toBe('C:\\ProgramData\\gemini-cli\\policies');
    } else {
      expect(result).toBe('/etc/gemini-cli/policies');
    }
  });
});
