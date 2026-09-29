/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Storage } from '@google/gemini-cli-core';
import { PersistentState } from './persistentState.js';

describe('PersistentState Recovery & Atomic Persist', () => {
  let tempDir: string;
  let stateFilePath: string;
  let backupFilePath: string;
  let corruptFilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-state-test-'));
    stateFilePath = path.join(tempDir, 'state.json');
    backupFilePath = path.join(tempDir, 'state.json.bak');
    corruptFilePath = path.join(tempDir, 'state.json.corrupt');

    vi.spyOn(Storage, 'getGlobalGeminiDir').mockReturnValue(tempDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('recovers state from .bak file when state.json is truncated mid-write', () => {
    const backupData = {
      terminalSetupPromptShown: true,
      tipsShown: 8,
      startupWarningCounts: { 'home-directory': 2 },
    };
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');

    // Simulate truncated file from interrupted/crash write
    fs.writeFileSync(
      stateFilePath,
      '{\n  "terminalSetupPromptShown": true,\n  "tips',
      'utf-8',
    );

    const persistentState = new PersistentState();

    // Must recover terminalSetupPromptShown: true from backup instead of returning undefined
    expect(persistentState.get('terminalSetupPromptShown')).toBe(true);
    expect(persistentState.get('tipsShown')).toBe(8);
  });

  it('preserves corrupt state.json as .corrupt when JSON parsing fails', () => {
    fs.writeFileSync(
      stateFilePath,
      '{\n  "corruptedJson": true,\n  "unterminated',
      'utf-8',
    );

    const persistentState = new PersistentState();
    persistentState.get('tipsShown');

    // Corrupt copy must be preserved for debugging/recovery rather than silently dropped
    expect(fs.existsSync(corruptFilePath)).toBe(true);
  });

  it('does not wipe prior state on subsequent set() after recovering from backup', () => {
    const backupData = {
      terminalSetupPromptShown: true,
      defaultBannerShownCount: { 'banner-v1': 3 },
    };
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
    fs.writeFileSync(stateFilePath, '{\n  "corrupt', 'utf-8');

    const persistentState = new PersistentState();
    persistentState.set('tipsShown', 1);

    // Prior values from backup should be preserved in state.json, not obliterated
    const savedContent = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
    expect(savedContent).toMatchObject({
      terminalSetupPromptShown: true,
      defaultBannerShownCount: { 'banner-v1': 3 },
      tipsShown: 1,
    });
  });
});
