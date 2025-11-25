/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiChat } from '../core/geminiChat.js';
import type { Config } from '../config/config.js';
import {
  GoalExtractionService,
  type GoalExtractionResult,
} from './goalExtractionService.js';
import { DeliberateCompressionHandler } from './deliberateCompressionHandler.js';
import type { CompressionOptions } from './chatCompressionService.js';

export interface DeliberateCompressionPrepareResult {
  shouldPromptUser: boolean;
  extractedGoals?: string[];
  skipReason?: string;
  useBasicCompression?: boolean;
  selectedGoal?: string;
}

/**
 * Orchestrates the deliberate compression flow, integrating goal extraction,
 * user prompting, and compression configuration.
 */
export class DeliberateCompressionOrchestrator {
  private readonly goalExtractor: GoalExtractionService;
  private readonly compressionHandler: DeliberateCompressionHandler;

  constructor() {
    this.goalExtractor = new GoalExtractionService();
    this.compressionHandler = new DeliberateCompressionHandler();
  }

  /**
   * Prepares for deliberate compression by extracting goals and determining
   * if user should be prompted
   */
  async prepareDeliberateCompression(
    chat: GeminiChat,
    config: Config,
    model: string,
    promptId: string,
    isSafetyValve: boolean,
  ): Promise<DeliberateCompressionPrepareResult> {
    // Check if deliberate compression is enabled
    const isEnabled = await config.isDeliberateCompressionEnabled();

    if (!isEnabled) {
      return {
        shouldPromptUser: false,
        skipReason: 'disabled',
        useBasicCompression: true,
      };
    }

    // Extract goals from conversation history
    const history = chat.getHistory(true);
    const contentGenerator = config.getContentGenerator();

    let extractionResult: GoalExtractionResult;

    try {
      extractionResult = await this.goalExtractor.extractGoals(
        history,
        contentGenerator,
        model,
        promptId,
      );
    } catch (_error) {
      // If extraction fails, fall back to basic compression
      return {
        shouldPromptUser: false,
        skipReason: 'extraction_failed',
        useBasicCompression: true,
      };
    }

    // Determine if user should be prompted
    const promptDecision = await this.compressionHandler.shouldPromptUser(
      extractionResult,
      config,
      isSafetyValve,
    );

    if (!promptDecision.shouldPrompt) {
      return {
        shouldPromptUser: false,
        skipReason: promptDecision.reason,
        useBasicCompression: promptDecision.fallbackToBasicCompression,
      };
    }

    // User should be prompted - return extracted goals
    return {
      shouldPromptUser: true,
      extractedGoals: extractionResult.goals,
    };
  }

  /**
   * Creates compression options based on user's goal selection
   */
  createCompressionOptions(selectedGoal: string | null): CompressionOptions {
    if (selectedGoal) {
      // User selected a goal - use deliberate compression
      return {
        userGoal: selectedGoal,
        preserveStrategy: 'since-last-prompt',
      };
    } else {
      // User skipped - use basic percentage-based compression
      return {
        preserveStrategy: 'percentage',
      };
    }
  }

  /**
   * Convenience method to get the complete flow result after user selection
   */
  completeFlow(
    prepareResult: DeliberateCompressionPrepareResult,
    userSelection: string | null,
  ): {
    compressionOptions: CompressionOptions;
    goalWasSelected: boolean;
  } {
    const compressionOptions = this.createCompressionOptions(userSelection);

    return {
      compressionOptions,
      goalWasSelected: !!userSelection,
    };
  }
}
