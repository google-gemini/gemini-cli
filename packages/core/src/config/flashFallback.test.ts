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

  // These tests do not actually test fallback. isInFallbackMode() only returns true,
  // when setFallbackMode is marked as true. This is to decouple setting a model
  // with the fallback mechanism. This will be necessary we introduce more
  // intelligent model routing.
  describe('setModel', () => {
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
      expect(newConfig.isInFallbackMode()).toBe(false);
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

  describe('isInFallbackMode', () => {
    it('should start as false for new session', () => {
      expect(config.isInFallbackMode()).toBe(false);
    });

    it('should remain false if no model switch occurs', () => {
      // Perform other operations that don't involve model switching
      expect(config.isInFallbackMode()).toBe(false);
    });

    it('should persist switched state throughout session', () => {
      config.setModel(DEFAULT_GEMINI_FLASH_MODEL);
      // Setting state for fallback mode as is expected of clients
      config.setFallbackMode(true);
      expect(config.isInFallbackMode()).toBe(true);

      // Should remain true even after getting model
      config.getModel();
      expect(config.isInFallbackMode()).toBe(true);
    });
  });
});
