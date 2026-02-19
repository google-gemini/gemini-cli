/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { Config } from './config.js';
import { ExperimentFlags } from '../code_assist/experiments/flagNames.js';

describe('Config getExperimentValue', () => {
  const sessionId = 'test-session';
  const targetDir = process.cwd();
  const cwd = process.cwd();
  const model = 'gemini-pro';

  it('should prioritize CLI argument over others', () => {
    const config = new Config({
      sessionId,
      targetDir,
      cwd,
      model,
      experimentalCliArgs: { 'enable-preview': true },
      experimentalSettings: { 'enable-preview': false },
      experiments: {
        flags: {
          [ExperimentFlags.ENABLE_PREVIEW]: { boolValue: false },
        },
        experimentIds: [],
      },
    });

    expect(config.getExperimentValue(ExperimentFlags.ENABLE_PREVIEW)).toBe(
      true,
    );
  });

  it('should prioritize local setting over remote experiment', () => {
    const config = new Config({
      sessionId,
      targetDir: process.cwd(),
      cwd: process.cwd(),
      model,
      experimentalSettings: { 'enable-preview': true },
      experiments: {
        flags: {
          [ExperimentFlags.ENABLE_PREVIEW]: { boolValue: false },
        },
        experimentIds: [],
      },
    });

    expect(config.getExperimentValue(ExperimentFlags.ENABLE_PREVIEW)).toBe(
      true,
    );
  });

  it('should use remote experiment if no local override', () => {
    const config = new Config({
      sessionId,
      targetDir: process.cwd(),
      cwd: process.cwd(),
      model,
      experiments: {
        flags: {
          [ExperimentFlags.ENABLE_PREVIEW]: { boolValue: true },
        },
        experimentIds: [],
      },
    });

    expect(config.getExperimentValue(ExperimentFlags.ENABLE_PREVIEW)).toBe(
      true,
    );
  });

  it('should use default value if nothing else is set', () => {
    const config = new Config({
      sessionId,
      targetDir: process.cwd(),
      cwd: process.cwd(),
      model,
    });

    // Default for ENABLE_PREVIEW is false
    expect(config.getExperimentValue(ExperimentFlags.ENABLE_PREVIEW)).toBe(
      false,
    );
  });

  it('should handle numeric values correctly', () => {
    const config = new Config({
      sessionId,
      targetDir: process.cwd(),
      cwd: process.cwd(),
      model,
      experimentalCliArgs: { 'classifier-threshold': 0.8 },
    });

    expect(
      config.getExperimentValue<number>(ExperimentFlags.CLASSIFIER_THRESHOLD),
    ).toBe(0.8);
  });

  it('should handle string representation of numbers from remote', () => {
    const config = new Config({
      sessionId,
      targetDir: process.cwd(),
      cwd: process.cwd(),
      model,
      experiments: {
        flags: {
          [ExperimentFlags.CLASSIFIER_THRESHOLD]: { stringValue: '0.7' },
        },
        experimentIds: [],
      },
    });

    expect(
      config.getExperimentValue<number>(ExperimentFlags.CLASSIFIER_THRESHOLD),
    ).toBe(0.7);
  });
});
