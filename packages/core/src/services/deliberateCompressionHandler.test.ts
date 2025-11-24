/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeliberateCompressionHandler } from './deliberateCompressionHandler.js';
import type { GoalExtractionResult } from './goalExtractionService.js';
import type { Config } from '../config/config.js';

describe('DeliberateCompressionHandler', () => {
  let handler: DeliberateCompressionHandler;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getDeliberateCompressionEnabled: vi.fn().mockResolvedValue(true),
      getDeliberateCompressionAutoSkip: vi.fn().mockResolvedValue(false),
    } as unknown as Config;

    handler = new DeliberateCompressionHandler();
  });

  describe('shouldPromptUser', () => {
    it('should prompt when goals found and auto-skip disabled', async () => {
      const extractionResult: GoalExtractionResult = {
        goals: ['Implementing auth'],
        confidence: 'high',
      };

      const result = await handler.shouldPromptUser(
        extractionResult,
        mockConfig,
        false, // not safety valve
      );

      expect(result.shouldPrompt).toBe(true);
      expect(result.reason).toBe('goals_found');
    });

    it('should not prompt when no goals found', async () => {
      const extractionResult: GoalExtractionResult = {
        goals: [],
        confidence: 'none',
      };

      const result = await handler.shouldPromptUser(
        extractionResult,
        mockConfig,
        false,
      );

      expect(result.shouldPrompt).toBe(false);
      expect(result.reason).toBe('no_goals');
      expect(result.fallbackToBasicCompression).toBe(true);
    });

    it('should not prompt when auto-skip is enabled', async () => {
      vi.mocked(mockConfig.getDeliberateCompressionAutoSkip).mockResolvedValue(
        true,
      );

      const extractionResult: GoalExtractionResult = {
        goals: ['Implementing auth'],
        confidence: 'high',
      };

      const result = await handler.shouldPromptUser(
        extractionResult,
        mockConfig,
        false,
      );

      expect(result.shouldPrompt).toBe(false);
      expect(result.reason).toBe('auto_skip_enabled');
      expect(result.fallbackToBasicCompression).toBe(true);
    });

    it('should not prompt when safety valve triggers', async () => {
      const extractionResult: GoalExtractionResult = {
        goals: ['Implementing auth'],
        confidence: 'high',
      };

      const result = await handler.shouldPromptUser(
        extractionResult,
        mockConfig,
        true, // safety valve
      );

      expect(result.shouldPrompt).toBe(false);
      expect(result.reason).toBe('safety_valve');
      expect(result.fallbackToBasicCompression).toBe(true);
    });

    it('should not prompt when extraction timeout occurs', async () => {
      const extractionResult: GoalExtractionResult = {
        goals: [],
        confidence: 'none',
        error: 'timeout',
      };

      const result = await handler.shouldPromptUser(
        extractionResult,
        mockConfig,
        false,
      );

      expect(result.shouldPrompt).toBe(false);
      expect(result.reason).toBe('extraction_timeout');
      expect(result.fallbackToBasicCompression).toBe(true);
    });
  });

  describe('handleUserSelection', () => {
    it('should return selected goal when user chooses one', () => {
      const result = handler.handleUserSelection('Implementing OAuth');

      expect(result.selectedGoal).toBe('Implementing OAuth');
      expect(result.shouldProceed).toBe(true);
    });

    it('should return null goal when user skips', () => {
      const result = handler.handleUserSelection(null);

      expect(result.selectedGoal).toBeNull();
      expect(result.shouldProceed).toBe(true);
    });

    it('should handle timeout during user prompt', () => {
      const result = handler.handleUserSelection(null, true);

      expect(result.selectedGoal).toBeNull();
      expect(result.shouldProceed).toBe(true);
      expect(result.timedOut).toBe(true);
    });
  });
});
