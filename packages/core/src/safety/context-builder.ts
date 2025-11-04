/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SafetyCheckInput, ConversationTurn } from './protocol.js';
import type { Config } from '../config/config.js';

/**
 * Builds context objects for safety checkers, ensuring sensitive data is filtered.
 */
export class ContextBuilder {
  // List of config keys that should never be sent to checkers
  private static readonly SENSITIVE_CONFIG_KEYS = [
    'api_key',
    'apiKey',
    'secret',
    'token',
    'password',
    'credential',
    'private_key',
    'privateKey',
  ];

  constructor(
    private readonly config: Config,
    private readonly conversationHistory: ConversationTurn[] = [],
  ) {}

  /**
   * Builds the full context object with all available data.
   */
  buildFullContext(): SafetyCheckInput['context'] {
    return {
      environment: {
        cwd: process.cwd(),
        workspaces: this.config
          .getWorkspaceContext()
          .getDirectories() as string[],
      },
      config: this.filterSensitiveConfig(),
      history: {
        turns: this.conversationHistory,
      },
    };
  }

  /**
   * Builds a minimal context with only the specified keys.
   */
  buildMinimalContext(
    requiredKeys: Array<keyof SafetyCheckInput['context']>,
  ): SafetyCheckInput['context'] {
    const fullContext = this.buildFullContext();
    const minimalContext: Partial<SafetyCheckInput['context']> = {};

    for (const key of requiredKeys) {
      if (key in fullContext) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (minimalContext as any)[key] = fullContext[key];
      }
    }

    return minimalContext as SafetyCheckInput['context'];
  }

  /**
   * Filters out sensitive keys from the config object recursively.
   */
  private filterSensitiveConfig(): Record<string, unknown> {
    // Cast to unknown first because Config has specific types, but we want to treat it generically
    return this.filterValue(this.config as unknown) as Record<string, unknown>;
  }

  private filterValue(value: unknown): unknown {
    if (typeof value === 'function') {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.filterValue(item));
    }

    if (value !== null && typeof value === 'object') {
      const filtered: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (this.isSensitiveKey(key)) {
          continue;
        }
        const filteredVal = this.filterValue(val);
        if (filteredVal !== undefined) {
          filtered[key] = filteredVal;
        }
      }
      return filtered;
    }

    return value;
  }

  private isSensitiveKey(key: string): boolean {
    const keyLower = key.toLowerCase();
    return ContextBuilder.SENSITIVE_CONFIG_KEYS.some((sensitive) =>
      keyLower.includes(sensitive.toLowerCase()),
    );
  }
}
