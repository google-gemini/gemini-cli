/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GoalExtractionResult } from './goalExtractionService.js';
import type { Config } from '../config/config.js';

export interface PromptDecision {
  shouldPrompt: boolean;
  reason: string;
  fallbackToBasicCompression?: boolean;
}

export interface SelectionResult {
  selectedGoal: string | null;
  shouldProceed: boolean;
  timedOut?: boolean;
}

/**
 * Handles the deliberate compression flow including opt-out logic
 */
export class DeliberateCompressionHandler {
  /**
   * Determines if user should be prompted for goal selection
   */
  async shouldPromptUser(
    extractionResult: GoalExtractionResult,
    config: Config,
    isSafetyValve: boolean,
  ): Promise<PromptDecision> {
    // Safety valve: bypass user prompt
    if (isSafetyValve) {
      return {
        shouldPrompt: false,
        reason: 'safety_valve',
        fallbackToBasicCompression: true,
      };
    }

    // Check if extraction timed out
    if (extractionResult.error === 'timeout') {
      return {
        shouldPrompt: false,
        reason: 'extraction_timeout',
        fallbackToBasicCompression: true,
      };
    }

    // Check if no goals were found
    if (extractionResult.goals.length === 0) {
      return {
        shouldPrompt: false,
        reason: 'no_goals',
        fallbackToBasicCompression: true,
      };
    }

    // Check if auto-skip is enabled
    const autoSkip = await config.getDeliberateCompressionAutoSkip();
    if (autoSkip) {
      return {
        shouldPrompt: false,
        reason: 'auto_skip_enabled',
        fallbackToBasicCompression: true,
      };
    }

    // All checks passed - prompt the user
    return {
      shouldPrompt: true,
      reason: 'goals_found',
    };
  }

  /**
   * Handles the user's goal selection
   */
  handleUserSelection(
    selectedGoal: string | null,
    timedOut: boolean = false,
  ): SelectionResult {
    return {
      selectedGoal,
      shouldProceed: true,
      timedOut,
    };
  }
}
