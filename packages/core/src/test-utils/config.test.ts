/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG_PARAMETERS, makeFakeConfig } from './config.js';
import { Config } from '../config/config.js';

describe('test-utils config', () => {
  describe('DEFAULT_CONFIG_PARAMETERS', () => {
    it('should have usageStatisticsEnabled set to true', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.usageStatisticsEnabled).toBe(true);
    });

    it('should have debugMode set to false', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.debugMode).toBe(false);
    });

    it('should have sessionId set to test-session-id', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.sessionId).toBe('test-session-id');
    });

    it('should have proxy set to undefined', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.proxy).toBeUndefined();
    });

    it('should have model set to gemini-9001-super-duper', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.model).toBe('gemini-9001-super-duper');
    });

    it('should have targetDir set to /', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.targetDir).toBe('/');
    });

    it('should have cwd set to /', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.cwd).toBe('/');
    });

    it('should have all required parameters', () => {
      expect(DEFAULT_CONFIG_PARAMETERS).toHaveProperty(
        'usageStatisticsEnabled',
      );
      expect(DEFAULT_CONFIG_PARAMETERS).toHaveProperty('debugMode');
      expect(DEFAULT_CONFIG_PARAMETERS).toHaveProperty('sessionId');
      expect(DEFAULT_CONFIG_PARAMETERS).toHaveProperty('proxy');
      expect(DEFAULT_CONFIG_PARAMETERS).toHaveProperty('model');
      expect(DEFAULT_CONFIG_PARAMETERS).toHaveProperty('targetDir');
      expect(DEFAULT_CONFIG_PARAMETERS).toHaveProperty('cwd');
    });

    it('should be an object', () => {
      expect(typeof DEFAULT_CONFIG_PARAMETERS).toBe('object');
      expect(DEFAULT_CONFIG_PARAMETERS).not.toBeNull();
    });
  });

  describe('makeFakeConfig', () => {
    it('should create a Config instance', () => {
      const config = makeFakeConfig();

      expect(config).toBeInstanceOf(Config);
    });

    it('should use default parameters when called without arguments', () => {
      const config = makeFakeConfig();

      expect(config).toBeDefined();
      expect(config).toBeInstanceOf(Config);
    });

    it('should use default parameters when called with empty object', () => {
      const config = makeFakeConfig({});

      expect(config).toBeDefined();
      expect(config).toBeInstanceOf(Config);
    });

    it('should override usageStatisticsEnabled', () => {
      const config = makeFakeConfig({ usageStatisticsEnabled: false });

      expect(config).toBeDefined();
    });

    it('should override debugMode', () => {
      const config = makeFakeConfig({ debugMode: true });

      expect(config).toBeDefined();
    });

    it('should override sessionId', () => {
      const config = makeFakeConfig({ sessionId: 'custom-session-id' });

      expect(config).toBeDefined();
    });

    it('should override proxy', () => {
      const config = makeFakeConfig({ proxy: 'http://proxy.example.com' });

      expect(config).toBeDefined();
    });

    it('should override model', () => {
      const config = makeFakeConfig({ model: 'custom-model' });

      expect(config).toBeDefined();
    });

    it('should override targetDir', () => {
      const config = makeFakeConfig({ targetDir: '/custom/target' });

      expect(config).toBeDefined();
    });

    it('should override cwd', () => {
      const config = makeFakeConfig({ cwd: '/custom/cwd' });

      expect(config).toBeDefined();
    });

    it('should override multiple parameters', () => {
      const config = makeFakeConfig({
        debugMode: true,
        model: 'test-model',
        sessionId: 'test-123',
      });

      expect(config).toBeDefined();
      expect(config).toBeInstanceOf(Config);
    });

    it('should override all parameters', () => {
      const customParams = {
        usageStatisticsEnabled: false,
        debugMode: true,
        sessionId: 'override-session',
        proxy: 'http://custom-proxy.com',
        model: 'custom-gemini',
        targetDir: '/override/target',
        cwd: '/override/cwd',
      };

      const config = makeFakeConfig(customParams);

      expect(config).toBeDefined();
      expect(config).toBeInstanceOf(Config);
    });

    it('should merge defaults with overrides', () => {
      const config = makeFakeConfig({ model: 'override-model' });

      expect(config).toBeInstanceOf(Config);
    });

    it('should preserve default values for non-overridden parameters', () => {
      const config = makeFakeConfig({ debugMode: true });

      // Other parameters should still use defaults
      expect(config).toBeInstanceOf(Config);
    });
  });

  describe('parameter types', () => {
    it('should accept boolean for usageStatisticsEnabled', () => {
      expect(() =>
        makeFakeConfig({ usageStatisticsEnabled: true }),
      ).not.toThrow();
      expect(() =>
        makeFakeConfig({ usageStatisticsEnabled: false }),
      ).not.toThrow();
    });

    it('should accept boolean for debugMode', () => {
      expect(() => makeFakeConfig({ debugMode: true })).not.toThrow();
      expect(() => makeFakeConfig({ debugMode: false })).not.toThrow();
    });

    it('should accept string for sessionId', () => {
      expect(() => makeFakeConfig({ sessionId: 'any-string' })).not.toThrow();
    });

    it('should accept string or undefined for proxy', () => {
      expect(() => makeFakeConfig({ proxy: 'http://proxy' })).not.toThrow();
      expect(() => makeFakeConfig({ proxy: undefined })).not.toThrow();
    });

    it('should accept string for model', () => {
      expect(() => makeFakeConfig({ model: 'model-name' })).not.toThrow();
    });

    it('should accept string for targetDir', () => {
      expect(() => makeFakeConfig({ targetDir: '/path' })).not.toThrow();
    });

    it('should accept string for cwd', () => {
      expect(() => makeFakeConfig({ cwd: '/path' })).not.toThrow();
    });
  });

  describe('multiple instances', () => {
    it('should create independent config instances', () => {
      const config1 = makeFakeConfig({ sessionId: 'session-1' });
      const config2 = makeFakeConfig({ sessionId: 'session-2' });

      expect(config1).not.toBe(config2);
    });

    it('should not share state between instances', () => {
      const config1 = makeFakeConfig({ debugMode: true });
      const config2 = makeFakeConfig({ debugMode: false });

      expect(config1).toBeInstanceOf(Config);
      expect(config2).toBeInstanceOf(Config);
      expect(config1).not.toBe(config2);
    });

    it('should create multiple configs with same parameters', () => {
      const params = { model: 'test-model' };
      const config1 = makeFakeConfig(params);
      const config2 = makeFakeConfig(params);

      expect(config1).toBeInstanceOf(Config);
      expect(config2).toBeInstanceOf(Config);
      expect(config1).not.toBe(config2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string values', () => {
      const config = makeFakeConfig({
        sessionId: '',
        model: '',
        targetDir: '',
        cwd: '',
      });

      expect(config).toBeInstanceOf(Config);
    });

    it('should handle special characters in strings', () => {
      const config = makeFakeConfig({
        sessionId: 'session!@#$%',
        model: 'model-with-dashes',
        targetDir: '/path/with spaces',
      });

      expect(config).toBeInstanceOf(Config);
    });

    it('should handle absolute paths', () => {
      const config = makeFakeConfig({
        targetDir: '/absolute/path/to/target',
        cwd: '/absolute/path/to/cwd',
      });

      expect(config).toBeInstanceOf(Config);
    });

    it('should handle relative paths', () => {
      const config = makeFakeConfig({
        targetDir: './relative/path',
        cwd: '../parent/path',
      });

      expect(config).toBeInstanceOf(Config);
    });

    it('should handle proxy URLs', () => {
      const config = makeFakeConfig({
        proxy: 'http://user:pass@proxy.example.com:8080',
      });

      expect(config).toBeInstanceOf(Config);
    });

    it('should handle model names with version numbers', () => {
      const config = makeFakeConfig({
        model: 'gemini-1.5-pro-002',
      });

      expect(config).toBeInstanceOf(Config);
    });
  });

  describe('default values', () => {
    it('should use production-like test model by default', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.model).toContain('gemini');
    });

    it('should disable debug mode by default', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.debugMode).toBe(false);
    });

    it('should enable usage statistics by default', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.usageStatisticsEnabled).toBe(true);
    });

    it('should use root directory by default', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.targetDir).toBe('/');
      expect(DEFAULT_CONFIG_PARAMETERS.cwd).toBe('/');
    });

    it('should have no proxy by default', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.proxy).toBeUndefined();
    });

    it('should have test session ID by default', () => {
      expect(DEFAULT_CONFIG_PARAMETERS.sessionId).toContain('test');
    });
  });
});
