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
} from '../../telemetry/index.js';
import type { Config } from '../../config/config.js';

import { generatePolicy } from './policy_generator.js';
import { enforcePolicy } from './policy_enforcer.js';
import type { SecurityPolicy } from './types.js';

export class ConsecaSafetyChecker implements InProcessChecker {
  private static instance: ConsecaSafetyChecker;
  private currentPolicy: SecurityPolicy | null = null;
  private activeUserPrompt: string | null = null;
  // TODO: Inject or retrieve Config/Client/Tools
  private config: Config | null = null;

  private constructor() {}

  static getInstance(): ConsecaSafetyChecker {
    if (!ConsecaSafetyChecker.instance) {
      ConsecaSafetyChecker.instance = new ConsecaSafetyChecker();
    }
    return ConsecaSafetyChecker.instance;
  }

  setConfig(config: Config): void {
    this.config = config;
  }

  async check(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    const userPrompt = this.extractUserPrompt(input);
    // TODO: Retrieve real trusted content (tool definitions)
    const trustedContent = 'Mock Tool Definitions';

    if (userPrompt) {
      await this.getPolicy(userPrompt, trustedContent);
    }

    if (this.currentPolicy) {
      return enforcePolicy(this.currentPolicy, input.toolCall);
    }

    return {
      decision: SafetyCheckDecision.ALLOW,
    };
  }

  async getPolicy(userPrompt: string, trustedContent: string): Promise<SecurityPolicy> {
    if (this.activeUserPrompt === userPrompt && this.currentPolicy) {
      return this.currentPolicy;
    }

    const policy = await generatePolicy(userPrompt, trustedContent);
    this.currentPolicy = policy;
    this.activeUserPrompt = userPrompt;

    if (this.config) {
      logConsecaPolicyGeneration(
        this.config,
        new ConsecaPolicyGenerationEvent(userPrompt, trustedContent, JSON.stringify(policy)),
      );
    }

    return policy;
  }

  private extractUserPrompt(input: SafetyCheckInput): string | null {
    if (
      input.context.history &&
      input.context.history.turns.length > 0
    ) {
      const lastTurn =
        input.context.history.turns[input.context.history.turns.length - 1];
      return lastTurn.user.text;
    }
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
