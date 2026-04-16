/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { DefaultMemoryProvider } from './defaultMemoryProvider.js';
import type { MemoryProvider } from './memoryProvider.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Orchestrates the memory subsystem for a single GeminiClient. The service
 * owns a `DefaultMemoryProvider` and exposes a stable lifecycle surface
 * (`onSessionStart`, `getSystemInstructions`, `getTurnContext`,
 * `onTurnComplete`, `onSessionEnd`) so that GeminiClient can stay agnostic
 * of the underlying implementation. Each lifecycle call is wrapped in a
 * try/catch so a buggy provider can never crash a turn.
 *
 * The methods return `Promise`s for callsite consistency even though the
 * current provider is synchronous; this keeps the boundary stable should
 * the provider ever need to do asynchronous work.
 */
export class MemoryService {
  private readonly provider: MemoryProvider = new DefaultMemoryProvider();

  constructor(private readonly config: Config) {}

  async onSessionStart(sessionId: string): Promise<void> {
    try {
      this.provider.onSessionStart(this.config, sessionId);
    } catch (error) {
      debugLogger.warn(
        `[MemoryService] Provider "${this.provider.id}" threw during onSessionStart:`,
        error,
      );
    }
  }

  async getSystemInstructions(): Promise<string> {
    try {
      return this.provider.getSystemInstructions();
    } catch (error) {
      debugLogger.warn(
        `[MemoryService] Provider "${this.provider.id}" threw during getSystemInstructions:`,
        error,
      );
      return '';
    }
  }

  async getTurnContext(query: string): Promise<string> {
    try {
      return this.provider.getTurnContext(query);
    } catch (error) {
      debugLogger.warn(
        `[MemoryService] Provider "${this.provider.id}" threw during getTurnContext:`,
        error,
      );
      return '';
    }
  }

  onTurnComplete(userMessage: string, assistantMessage: string): void {
    try {
      this.provider.onTurnComplete(userMessage, assistantMessage);
    } catch (error) {
      debugLogger.warn(
        `[MemoryService] Provider "${this.provider.id}" threw during onTurnComplete:`,
        error,
      );
    }
  }

  async onSessionEnd(): Promise<void> {
    try {
      this.provider.onSessionEnd();
    } catch (error) {
      debugLogger.warn(
        `[MemoryService] Provider "${this.provider.id}" threw during onSessionEnd:`,
        error,
      );
    }
  }
}
