/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InProcessChecker } from '../built-in.js';
import type { SafetyCheckInput, SafetyCheckResult } from '../protocol.js';
import { SafetyCheckDecision } from '../protocol.js';

import {
  logConsecaPolicyGeneration,
  ConsecaPolicyGenerationEvent,
  logConsecaVerdict,
  ConsecaVerdictEvent,
} from '../../telemetry/index.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { Config } from '../../config/config.js';

import { generatePolicy } from './policy-generator.js';
import { enforcePolicy } from './policy-enforcer.js';
import type { SecurityPolicy } from './types.js';

export class ConsecaSafetyChecker implements InProcessChecker {
  private static instance: ConsecaSafetyChecker | undefined;
  private currentPolicy: SecurityPolicy | null = null;
  private activeUserPrompt: string | null = null;
  private config: Config | null = null;

  /**
   * Private constructor to enforce singleton pattern.
   * Use `getInstance()` to access the instance.
   */
  private constructor() {}

  static getInstance(): ConsecaSafetyChecker {
    if (!ConsecaSafetyChecker.instance) {
      ConsecaSafetyChecker.instance = new ConsecaSafetyChecker();
    }
    return ConsecaSafetyChecker.instance;
  }

  /**
   * Resets the singleton instance. Use only in tests.
   */
  static resetInstance(): void {
    ConsecaSafetyChecker.instance = undefined;
  }

  setConfig(config: Config): void {
    this.config = config;
  }

  async check(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    debugLogger.debug(
      `[Conseca] check called. History is: ${JSON.stringify(input.context.history)}`,
    );

    if (!this.config) {
      debugLogger.debug('[Conseca] check failed: Config not initialized');
      return {
        decision: SafetyCheckDecision.ALLOW,
        reason: 'Config not initialized',
      };
    }

    if (!this.config.enableConseca) {
      debugLogger.debug('[Conseca] check skipped: Conseca is not enabled.');
      return {
        decision: SafetyCheckDecision.ALLOW,
        reason: 'Conseca is disabled',
      };
    }

    const userPrompt = this.extractUserPrompt(input);
    let trustedContent = '';

    const toolRegistry = this.config.getToolRegistry();
    if (toolRegistry) {
      const tools = toolRegistry.getFunctionDeclarations();
      trustedContent = JSON.stringify(tools, null, 2);
    }

    if (userPrompt) {
      await this.getPolicy(userPrompt, trustedContent, this.config);
    } else {
      debugLogger.debug(
        `[Conseca] Skipping policy generation because userPrompt is null`,
      );
    }

    let result: SafetyCheckResult;

    if (!this.currentPolicy) {
      result = {
        decision: SafetyCheckDecision.ALLOW, // Fallback if no policy generated yet
        reason: 'No security policy generated.',
        error: 'No security policy generated.',
      };
    } else {
      result = await enforcePolicy(
        this.currentPolicy,
        input.toolCall,
        this.config,
      );
    }

    logConsecaVerdict(
      this.config,
      new ConsecaVerdictEvent(
        userPrompt || '',
        JSON.stringify(this.currentPolicy || {}),
        JSON.stringify(input.toolCall),
        result.decision,
        result.reason || '',
        'error' in result ? result.error : undefined,
      ),
    );

    return result;
  }

  async getPolicy(
    userPrompt: string,
    trustedContent: string,
    config: Config,
  ): Promise<SecurityPolicy> {
    if (this.activeUserPrompt === userPrompt && this.currentPolicy) {
      return this.currentPolicy;
    }

    const { policy, error } = await generatePolicy(
      userPrompt,
      trustedContent,
      config,
    );
    this.currentPolicy = policy;
    this.activeUserPrompt = userPrompt;

    logConsecaPolicyGeneration(
      config,
      new ConsecaPolicyGenerationEvent(
        userPrompt,
        trustedContent,
        JSON.stringify(policy),
        error,
      ),
    );

    return policy;
  }

  private extractUserPrompt(input: SafetyCheckInput): string | null {
    const prompt = input.context.history?.turns.at(-1)?.user.text;
    if (prompt) {
      return prompt;
    }
    debugLogger.debug(`[Conseca] extractUserPrompt failed.`);
    return null;
  }

  // Helper methods for testing state
  getCurrentPolicy(): SecurityPolicy | null {
    return this.currentPolicy;
  }

  getActiveUserPrompt(): string | null {
    return this.activeUserPrompt;
  }
}
