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
  });
});
