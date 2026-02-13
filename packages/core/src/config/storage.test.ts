/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.unmock('./storage.js');
vi.unmock('./projectRegistry.js');
vi.unmock('./storageMigration.js');
import * as os from 'node:os';
import * as path from 'node:path';

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
});
