/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ExperimentManager } from './experimentManager.js';
import { ExperimentFlags } from '../code_assist/experiments/flagNames.js';

describe('ExperimentManager', () => {
  const baseOptions = {
    experimentalSettings: {},
    experimentalCliArgs: {},
  };

  describe('getExperimentValue', () => {
    it('should return default value when no overrides are present', () => {
      const manager = new ExperimentManager(baseOptions);
      // USER_CACHING default is false
      expect(manager.getExperimentValue(ExperimentFlags.USER_CACHING)).toBe(
        false,
      );
    });

    it('should prioritize CLI arguments over all else', () => {
      const manager = new ExperimentManager({
        ...baseOptions,
        experimentalCliArgs: { 'user-caching': true },
        experimentalSettings: { 'user-caching': false },
        experiments: {
          flags: {
            [ExperimentFlags.USER_CACHING]: { boolValue: false },
          },
          experimentIds: [],
        },
      });
      expect(manager.getExperimentValue(ExperimentFlags.USER_CACHING)).toBe(
        true,
      );
    });

    it('should prioritize local settings over remote experiments', () => {
      const manager = new ExperimentManager({
        ...baseOptions,
        experimentalSettings: { 'user-caching': true },
        experiments: {
          flags: {
            [ExperimentFlags.USER_CACHING]: { boolValue: false },
          },
          experimentIds: [],
        },
      });
      expect(manager.getExperimentValue(ExperimentFlags.USER_CACHING)).toBe(
        true,
      );
    });

    it('should use remote experiment if no local override', () => {
      const manager = new ExperimentManager({
        ...baseOptions,
        experiments: {
          flags: {
            [ExperimentFlags.USER_CACHING]: { boolValue: true },
          },
          experimentIds: [],
        },
      });
      expect(manager.getExperimentValue(ExperimentFlags.USER_CACHING)).toBe(
        true,
      );
    });

    it('should handle nested settings correctly', () => {
      const manager = new ExperimentManager({
        ...baseOptions,
        experimentalSettings: {
          toolOutputMasking: {
            enabled: false,
          },
        },
      });
      expect(
        manager.getExperimentValue(ExperimentFlags.ENABLE_TOOL_OUTPUT_MASKING),
      ).toBe(false);
    });

    it('should validate values using Zod schema', () => {
      const manager = new ExperimentManager({
        ...baseOptions,
        experimentalSettings: {
          'classifier-threshold': 'not-a-number',
        },
      });
      // CLASSIFIER_THRESHOLD default is 0.5
      expect(
        manager.getExperimentValue(ExperimentFlags.CLASSIFIER_THRESHOLD),
      ).toBe(0.5);
    });

    it('should parse numeric strings from remote flags if metadata type is number', () => {
      const manager = new ExperimentManager({
        ...baseOptions,
        experiments: {
          flags: {
            [ExperimentFlags.CLASSIFIER_THRESHOLD]: { stringValue: '0.8' },
          },
          experimentIds: [],
        },
      });
      expect(
        manager.getExperimentValue(ExperimentFlags.CLASSIFIER_THRESHOLD),
      ).toBe(0.8);
    });
  });

  describe('convenience getters', () => {
    it('isPlanEnabled should resolve correctly', () => {
      const manager = new ExperimentManager({
        ...baseOptions,
        experimentalSettings: { plan: true },
      });
      expect(manager.isPlanEnabled()).toBe(true);
    });

    it('isAgentsEnabled should resolve correctly', () => {
      const manager = new ExperimentManager({
        ...baseOptions,
        experimentalSettings: { enableAgents: true },
      });
      expect(manager.isAgentsEnabled()).toBe(true);
    });
  });
});
