/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { selectModel } from './modelSelection.js';
import { DEFAULT_GEMINI_MODEL } from '@google/gemini-cli-core';
import type { CliArgs } from './config.js';
import type { Settings } from './settings.js';

describe('selectModel', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean environment for each test
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('CLI invalid -> logs failure and uses default', () => {
    const argv: CliArgs = { model: 'invalid-model-name' } as CliArgs;
    const settings: Settings = {};
    const { model, logs, hadFailure } = selectModel(argv, settings);

    expect(hadFailure).toBe(true);
    expect(model).toBe(DEFAULT_GEMINI_MODEL);
    expect(logs).toEqual(
      expect.arrayContaining([
        'Loading --model "invalid-model-name" failed, not a valid model name.',
        `Using model ${DEFAULT_GEMINI_MODEL}`,
      ]),
    );
  });

  it('settings valid -> picks settings, no failure logs', () => {
    const argv: CliArgs = {} as CliArgs;
    const settings: Settings = { model: 'gemini-2.5-pro' };
    const { model, logs, hadFailure } = selectModel(argv, settings);

    expect(hadFailure).toBe(false);
    expect(model).toBe('gemini-2.5-pro');
    expect(logs).toContain('Using model gemini-2.5-pro');
    expect(logs.find((l) => l.includes('failed'))).toBeUndefined();
  });

  it('env invalid (no CLI/settings) -> logs failure and uses default', () => {
    process.env.GEMINI_MODEL = 'gemini-2.5-flashsss';
    const argv: CliArgs = {} as CliArgs;
    const settings: Settings = {};
    const { model, logs, hadFailure } = selectModel(argv, settings);

    expect(hadFailure).toBe(true);
    expect(model).toBe(DEFAULT_GEMINI_MODEL);
    expect(logs).toEqual(
      expect.arrayContaining([
        'Loading $GEMINI_MODEL "gemini-2.5-flashsss" failed, not a valid model name.',
        `Using model ${DEFAULT_GEMINI_MODEL}`,
      ]),
    );
  });

  it('all empty -> uses default, no failure logs', () => {
    const argv: CliArgs = {} as CliArgs;
    const settings: Settings = {};
    const { model, logs, hadFailure } = selectModel(argv, settings);

    expect(hadFailure).toBe(false);
    expect(model).toBe(DEFAULT_GEMINI_MODEL);
    expect(logs).toEqual(
      expect.arrayContaining([`Using model ${DEFAULT_GEMINI_MODEL}`]),
    );
    expect(logs.find((l) => l.includes('failed'))).toBeUndefined();
  });

  it('precedence: CLI valid wins over settings/env', () => {
    process.env.GEMINI_MODEL = 'gemini-1.5-flash'; // sollte ignoriert werden
    const argv: CliArgs = { model: 'gemini-1.5-pro' } as CliArgs;
    const settings: Settings = { model: 'gemini-2.5-pro' };
    const { model, hadFailure } = selectModel(argv, settings);

    expect(hadFailure).toBe(false);
    expect(model).toBe('gemini-1.5-pro');
  });
});
