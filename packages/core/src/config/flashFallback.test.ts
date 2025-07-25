/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Config } from './config.js';
import { DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_FLASH_MODEL } from './models.js';

describe('Flash Model Fallback Configuration', () => {
  let config: Config;

  beforeEach(() => {
    config = new Config({
      sessionId: 'test-session',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: DEFAULT_GEMINI_MODEL,
    });

    // Initialize contentGeneratorConfig for testing
    (
      config as unknown as { contentGeneratorConfig: unknown }
    ).contentGeneratorConfig = {
      model: DEFAULT_GEMINI_MODEL,
      authType: 'oauth-personal',
    };
  });

  describe('setModel', () => {
    it('should update the model and mark as switched during session', () => {
      expect(config.getModel()).toBe(DEFAULT_GEMINI_MODEL);
      expect(config.isModelSwitchedDuringSession()).toBe(false);

      config.setModel(DEFAULT_GEMINI_FLASH_MODEL);

      expect(config.getModel()).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.isModelSwitchedDuringSession()).toBe(true);
    });

    it('should handle multiple model switches during session', () => {
      config.setModel(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.isModelSwitchedDuringSession()).toBe(true);

      config.setModel('gemini-1.5-pro');
      expect(config.getModel()).toBe('gemini-1.5-pro');
      expect(config.isModelSwitchedDuringSession()).toBe(true);
    });

    it('should only mark as switched if contentGeneratorConfig exists', () => {
      // Create config without initializing contentGeneratorConfig
      const newConfig = new Config({
        sessionId: 'test-session-2',
        targetDir: '/test',
        debugMode: false,
        cwd: '/test',
        model: DEFAULT_GEMINI_MODEL,
      });

      // Should not crash when contentGeneratorConfig is undefined
      newConfig.setModel(DEFAULT_GEMINI_FLASH_MODEL);
      expect(newConfig.isModelSwitchedDuringSession()).toBe(false);
    });
  });

  describe('getModel', () => {
    it('should return contentGeneratorConfig model if available', () => {
      // Simulate initialized content generator config
      config.setModel(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.getModel()).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    });

    it('should fall back to initial model if contentGeneratorConfig is not available', () => {
      // Test with fresh config where contentGeneratorConfig might not be set
      const newConfig = new Config({
        sessionId: 'test-session-2',
        targetDir: '/test',
        debugMode: false,
        cwd: '/test',
        model: 'custom-model',
      });

      expect(newConfig.getModel()).toBe('custom-model');
    });
  });

  describe('isModelSwitchedDuringSession', () => {
    it('should start as false for new session', () => {
      expect(config.isModelSwitchedDuringSession()).toBe(false);
    });

    it('should remain false if no model switch occurs', () => {
      // Perform other operations that don't involve model switching
      expect(config.isModelSwitchedDuringSession()).toBe(false);
    });

    it('should persist switched state throughout session', () => {
      config.setModel(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.isModelSwitchedDuringSession()).toBe(true);

      // Should remain true even after getting model
      config.getModel();
      expect(config.isModelSwitchedDuringSession()).toBe(true);
    });
  });

  describe('resetModelToDefault', () => {
    it('should reset model to default and clear session switch flag', () => {
      // Switch to Flash first
      config.setModel(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.getModel()).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.isModelSwitchedDuringSession()).toBe(true);

      // Reset to default
      config.resetModelToDefault();

      // Should be back to default with flag cleared
      expect(config.getModel()).toBe(DEFAULT_GEMINI_MODEL);
      expect(config.isModelSwitchedDuringSession()).toBe(false);
    });

    it('should handle case where contentGeneratorConfig is not initialized', () => {
      // Create config without initializing contentGeneratorConfig
      const newConfig = new Config({
        sessionId: 'test-session-2',
        targetDir: '/test',
        debugMode: false,
        cwd: '/test',
        model: DEFAULT_GEMINI_MODEL,
      });

      // Should not crash when contentGeneratorConfig is undefined
      expect(() => newConfig.resetModelToDefault()).not.toThrow();
      expect(newConfig.isModelSwitchedDuringSession()).toBe(false);
    });
  });
});
