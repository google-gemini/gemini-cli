/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Storage, debugLogger } from '@google/gemini-cli-core';
import { PersistentState } from './persistentState.js';

vi.mock('@google/gemini-cli-core', () => ({
  Storage: {
    getGlobalGeminiDir: vi.fn(),
  },
  debugLogger: {
    warn: vi.fn(),
  },
}));

describe('PersistentState filesystem behavior', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
    vi.resetAllMocks();
  });

  it('publishes valid state and keeps the previous snapshot as a backup', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-persistent-state-'),
    );
    temporaryDirectories.push(directory);
    vi.mocked(Storage.getGlobalGeminiDir).mockReturnValue(directory);

    const state = new PersistentState();
    state.set('tipsShown', 1);
    state.set('tipsShown', 2);
    expect(
      JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8')),
    ).toEqual({ tipsShown: 2 });
    expect(
      JSON.parse(
        fs.readFileSync(path.join(directory, 'state.json.bak'), 'utf8'),
      ),
    ).toEqual({ tipsShown: 1 });
  });

  it('preserves corrupt state and restores the valid backup', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-persistent-state-'),
    );
    temporaryDirectories.push(directory);
    vi.mocked(Storage.getGlobalGeminiDir).mockReturnValue(directory);
    fs.writeFileSync(path.join(directory, 'state.json'), '{"tipsShown":');
    fs.writeFileSync(
      path.join(directory, 'state.json.bak'),
      JSON.stringify({ tipsShown: 3 }),
    );

    const state = new PersistentState();

    expect(state.get('tipsShown')).toBe(3);
    expect(fs.existsSync(path.join(directory, 'state.json.corrupt'))).toBe(
      true,
    );
    expect(debugLogger.warn).toHaveBeenCalled();
  });
});
