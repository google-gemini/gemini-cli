/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InProcessChecker } from '../built-in.js';
import type { SafetyCheckInput, SafetyCheckResult } from '../protocol.js';
import { SafetyCheckDecision } from '../protocol.js';
import type { GeminiClient } from '../../core/client.js';

export class ConsecaSafetyChecker implements InProcessChecker {
  private static instance: ConsecaSafetyChecker;
  private currentPolicy: string | null = null;
  private activeUserPrompt: string | null = null;
  private client: GeminiClient | null = null;

  private constructor() {}

  static getInstance(): ConsecaSafetyChecker {
    if (!ConsecaSafetyChecker.instance) {
      ConsecaSafetyChecker.instance = new ConsecaSafetyChecker();
    }
    return ConsecaSafetyChecker.instance;
  }

  setClient(client: GeminiClient): void {
    this.client = client;
  }

  async check(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    // Stub implementation for Phase 1
    return {
      decision: SafetyCheckDecision.ALLOW,
    };
  }

  // Helper methods for testing state (Phase 1)
  getCurrentPolicy(): string | null {
    return this.currentPolicy;
  }

  getActiveUserPrompt(): string | null {
    return this.activeUserPrompt;
  }
}
