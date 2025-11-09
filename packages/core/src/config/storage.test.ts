/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';

const MOCK_GLOBAL_GEMINI_DIR = '/mock/user/home/.gemini';
const MOCK_CACHE_DIR = '/mock/user/home/.cache/gemini';
const MOCK_CONFIG_DIR = '/mock/user/home/.config/gemini';
const MOCK_DATA_DIR = '/mock/user/home/.local/share/gemini';

vi.mock('./storage.js', () => {
  class MockStorage {
    private readonly targetDir: string;

    constructor(targetDir: string) {
      this.targetDir = targetDir;
    }

    static getGlobalGeminiDir = vi.fn(() => MOCK_GLOBAL_GEMINI_DIR);
    static getCacheDir = vi.fn(() => MOCK_CACHE_DIR);
    static getConfigDir = vi.fn(() => MOCK_CONFIG_DIR);
    static getDataDir = vi.fn(() => MOCK_DATA_DIR);
    static getMcpOAuthTokensPath = vi.fn(() =>
      path.join(MOCK_CONFIG_DIR, 'mcp-oauth-tokens.json'),
    );
    static getGlobalSettingsPath = vi.fn(() =>
      path.join(MOCK_CONFIG_DIR, 'settings.json'),
    );
    static getUserCommandsDir = vi.fn(() =>
      path.join(MOCK_CONFIG_DIR, 'commands'),
    );
    static getGlobalBinDir = vi.fn(() => path.join(MOCK_CONFIG_DIR, 'bin'));
    getGeminiDir = () => path.join(this.targetDir, '.gemini');
    getWorkspaceSettingsPath = () =>
      path.join(this.getGeminiDir(), 'settings.json');
    getProjectCommandsDir = () => path.join(this.getGeminiDir(), 'commands');
  }
  return { Storage: MockStorage };
});

vi.mock('../utils/paths.js', () => ({
  GEMINI_DIR: '.gemini',
}));

import { Storage } from './storage.js';
import { GEMINI_DIR } from '../utils/paths.js';

describe('Storage – getGlobalSettingsPath', () => {
  it('returns path to /mock/user/home/.config/gemini/settings.json', () => {
    const expected = path.join(MOCK_CONFIG_DIR, 'settings.json');
    expect(Storage.getGlobalSettingsPath()).toBe(expected);
  });
});

describe('Storage – additional helpers', () => {
  const projectRoot = '/tmp/project';
  const storage = new Storage(projectRoot);

  it('getWorkspaceSettingsPath returns project/.gemini/settings.json', () => {
    const expected = path.join(projectRoot, GEMINI_DIR, 'settings.json');
    expect(storage.getWorkspaceSettingsPath()).toBe(expected);
  });

  it('getUserCommandsDir returns ~/.config/gemini/commands', () => {
    const expected = path.join(MOCK_CONFIG_DIR, 'commands');
    expect(Storage.getUserCommandsDir()).toBe(expected);
  });

  it('getProjectCommandsDir returns project/.gemini/commands', () => {
    const expected = path.join(projectRoot, GEMINI_DIR, 'commands');
    expect(storage.getProjectCommandsDir()).toBe(expected);
  });

  it('getMcpOAuthTokensPath returns ~/.config/gemini/mcp-oauth-tokens.json', () => {
    const expected = path.join(MOCK_CONFIG_DIR, 'mcp-oauth-tokens.json');
    expect(Storage.getMcpOAuthTokensPath()).toBe(expected);
  });

  it('getGlobalBinDir returns ~/.config/gemini/bin', () => {
    const expected = path.join(MOCK_CONFIG_DIR, 'bin');
    expect(Storage.getGlobalBinDir()).toBe(expected);
  });
});
