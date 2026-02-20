/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { Config } from './config.js';
import { ExperimentFlags } from '../code_assist/experiments/flagNames.js';

describe('Config CLI Override', () => {
  const sessionId = 'test-session';
  const targetDir = process.cwd();
  const cwd = process.cwd();
  const model = 'gemini-pro';

  it('should prioritize CLI argument over local setting', () => {
    const config = new Config({
      sessionId,
      targetDir,
      cwd,
      model,
      debugMode: false,
      experimentalCliArgs: { 'enable-numerical-routing': true },
      experimentalSettings: { 'enable-numerical-routing': false },
    });

    expect(config.isNumericalRoutingEnabled()).toBe(true);
  });

  it('should prioritize CLI argument over remote experiment', () => {
    const config = new Config({
      sessionId,
      targetDir,
      cwd,
      model,
      debugMode: false,
      experimentalCliArgs: { 'enable-numerical-routing': true },
      experiments: {
        flags: {
          [ExperimentFlags.ENABLE_NUMERICAL_ROUTING]: { boolValue: false },
        },
        experimentIds: [],
      },
    });

    expect(config.isNumericalRoutingEnabled()).toBe(true);
  });
});
