/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';

import * as os from 'node:os';
import { Storage } from './storage.js';
import { GEMINI_DIR } from '../utils/paths.js';

const homedir = os.homedir();
const MOCK_GLOBAL_GEMINI_DIR = path.join(homedir, GEMINI_DIR);

describe('Storage – getGlobalSettingsPath no XDG', () => {
  it('returns path in homedir', () => {
    const expected = MOCK_GLOBAL_GEMINI_DIR;
    expect(Storage.getCacheDir()).toBe(expected);
    expect(Storage.getConfigDir()).toBe(expected);
    expect(Storage.getDataDir()).toBe(expected);
    expect(Storage.getStateDir()).toBe(expected);
  });

  it('returns path to $HOME/gemini/settings.json', () => {
    const expected = path.join(MOCK_GLOBAL_GEMINI_DIR, 'settings.json');
    expect(Storage.getGlobalSettingsPath()).toBe(expected);
  });
});

describe('Storage – additional helpers, no xdg env var', () => {
  const projectRoot = '/tmp/project';
  const storage = new Storage(projectRoot);

  it('getWorkspaceSettingsPath returns project/.gemini/settings.json', () => {
    const expected = path.join(projectRoot, GEMINI_DIR, 'settings.json');
    expect(storage.getWorkspaceSettingsPath()).toBe(expected);
  });

  it('getUserCommandsDir returns ~/.gemini/commands', () => {
    const expected = path.join(MOCK_GLOBAL_GEMINI_DIR, 'commands');
    expect(Storage.getUserCommandsDir()).toBe(expected);
  });

  it('getProjectCommandsDir returns project/.gemini/commands', () => {
    const expected = path.join(projectRoot, GEMINI_DIR, 'commands');
    expect(storage.getProjectCommandsDir()).toBe(expected);
  });

  it('getMcpOAuthTokensPath returns ~/.gemini/mcp-oauth-tokens.json', () => {
    const expected = path.join(MOCK_GLOBAL_GEMINI_DIR, 'mcp-oauth-tokens.json');
    expect(Storage.getMcpOAuthTokensPath()).toBe(expected);
  });

  it('getGlobalBinDir returns ~/.gemini/bin', () => {
    const expected = path.join(MOCK_GLOBAL_GEMINI_DIR, 'bin');
    expect(Storage.getGlobalBinDir()).toBe(expected);
  });
});
