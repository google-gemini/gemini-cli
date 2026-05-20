/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Config } from './config.js';
import { DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_FLASH_MODEL } from './models.js';
import { logFlashFallback } from '../telemetry/loggers.js';
import { FlashFallbackEvent } from '../telemetry/types.js';

import fs from 'node:fs';

vi.mock('node:fs');
vi.mock('../telemetry/loggers.js', () => ({
  logFlashFallback: vi.fn(),
  logRipgrepFallback: vi.fn(),
}));

describe('Flash Model Fallback Configuration', () => {
  let config: Config;

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
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

  describe('activateFallbackMode', () => {
    it('should set model to fallback and log event', () => {
      config.activateFallbackMode(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.getModel()).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      expect(logFlashFallback).toHaveBeenCalledWith(
        config,
        expect.any(FlashFallbackEvent),
      );
    });

    it('should set fallback override when failedModel is provided and register runtime override', () => {
      config.activateFallbackMode(
        DEFAULT_GEMINI_FLASH_MODEL,
        DEFAULT_GEMINI_MODEL,
      );
      expect(config.getModel()).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      expect(config.getFallbackOverride(DEFAULT_GEMINI_MODEL)).toBe(
        DEFAULT_GEMINI_FLASH_MODEL,
      );

      // Verify it registers the runtime model override with ModelConfigService
      expect(
        config
          .getModelConfigService()
          .getResolvedConfig({ model: DEFAULT_GEMINI_MODEL }).model,
      ).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    });

    it('should flatten override chains when a model that was previously a target fails', () => {
      // 1. Initial fallback: A -> B
      config.activateFallbackMode('model-B', 'model-A');
      expect(config.getFallbackOverride('model-A')).toBe('model-B');
      expect(
        config.getModelConfigService().getResolvedConfig({ model: 'model-A' })
          .model,
      ).toBe('model-B');

      // 2. Chained fallback: B fails, fallback to C
      // This should update A -> C as well.
      config.activateFallbackMode('model-C', 'model-B');

      expect(config.getFallbackOverride('model-A')).toBe('model-C');
      expect(config.getFallbackOverride('model-B')).toBe('model-C');

      expect(
        config.getModelConfigService().getResolvedConfig({ model: 'model-A' })
          .model,
      ).toBe('model-C');
      expect(
        config.getModelConfigService().getResolvedConfig({ model: 'model-B' })
          .model,
      ).toBe('model-C');
    });

    it('should not reset availability service if model has not changed', () => {
      const resetSpy = vi.spyOn(config.getModelAvailabilityService(), 'reset');
      const currentModel = config.getActiveModel();

      config.activateFallbackMode(currentModel);

      expect(resetSpy).not.toHaveBeenCalled();
    });
  });
});
