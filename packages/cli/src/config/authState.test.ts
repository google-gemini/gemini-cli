/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Storage } from '@google/gemini-cli-core';
import { loadAuthState, saveAuthState } from './authState.js';

describe('authState', () => {
  let tempDir: string;
  let authStatePath: string;
  let settingsPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-auth-state-'));
    authStatePath = path.join(tempDir, '.gemini', 'auth-state.json');
    settingsPath = path.join(tempDir, '.gemini', 'settings.json');

    vi.spyOn(Storage, 'getAuthStatePath').mockReturnValue(authStatePath);
    vi.spyOn(Storage, 'getGlobalSettingsPath').mockReturnValue(settingsPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes auth state to auth-state.json', () => {
    saveAuthState('oauth');

    const saved = JSON.parse(fs.readFileSync(authStatePath, 'utf-8')) as {
      selectedType?: string;
    };
    expect(saved).toEqual({ selectedType: 'oauth' });
  });

  it('falls back to settings.json when auth-state is missing', () => {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      `{
        "security": { "auth": { "selectedType": "oauth" } }
      }`,
      'utf-8',
    );

    expect(loadAuthState()).toEqual({ selectedType: 'oauth' });
  });

  it('migrates legacy settings selectedType to auth-state.json on first load', () => {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ security: { auth: { selectedType: 'oauth' } } }),
      'utf-8',
    );

    loadAuthState();

    const migrated = JSON.parse(fs.readFileSync(authStatePath, 'utf-8')) as {
      selectedType?: string;
    };
    expect(migrated.selectedType).toBe('oauth');
  });

  it('keeps existing users authenticated after migration even without settings.json', () => {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ security: { auth: { selectedType: 'oauth' } } }),
      'utf-8',
    );

    expect(loadAuthState()).toEqual({ selectedType: 'oauth' });
    fs.rmSync(settingsPath, { force: true });

    expect(loadAuthState()).toEqual({ selectedType: 'oauth' });
  });
});
