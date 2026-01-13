/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    platform: vi.fn(),
  };
});

import { Storage } from './storage.js';
import { GEMINI_DIR } from '../utils/paths.js';

describe('Storage – getGlobalSettingsPath', () => {
  it('returns path to ~/.gemini/settings.json', () => {
    const expected = path.join(os.homedir(), GEMINI_DIR, 'settings.json');
    expect(Storage.getGlobalSettingsPath()).toBe(expected);
  });
});

describe('Storage – getSystemSettingsPath', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('respects GEMINI_CLI_SYSTEM_SETTINGS_PATH env var', () => {
    process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] = '/custom/path.json';
    expect(Storage.getSystemSettingsPath()).toBe('/custom/path.json');
  });

  it('checks multiple paths on Darwin and returns first existing one', () => {
    (os.platform as Mock).mockReturnValue('darwin');
    (fs.existsSync as Mock).mockImplementation((p: string) => {
      return p === '/etc/gemini-cli/settings.json';
    });

    // Should skip /Library/... and find /etc/gemini-cli/...
    expect(Storage.getSystemSettingsPath()).toBe('/etc/gemini-cli/settings.json');
  });

  it('checks multiple paths on Linux and returns first existing one', () => {
    (os.platform as Mock).mockReturnValue('linux');
    (fs.existsSync as Mock).mockImplementation((p: string) => {
      return p === '/etc/.gemini/settings.json';
    });

    // Should skip /etc/gemini-cli/... and find /etc/.gemini/...
    expect(Storage.getSystemSettingsPath()).toBe('/etc/.gemini/settings.json');
  });

  it('returns default path on Darwin if none exist', () => {
    (os.platform as Mock).mockReturnValue('darwin');
    (fs.existsSync as Mock).mockReturnValue(false);

    expect(Storage.getSystemSettingsPath()).toBe(
      '/Library/Application Support/GeminiCli/settings.json',
    );
  });

  it('returns default path on Win32', () => {
    (os.platform as Mock).mockReturnValue('win32');
    expect(Storage.getSystemSettingsPath()).toBe(
      'C:\\ProgramData\\gemini-cli\\settings.json',
    );
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
});
