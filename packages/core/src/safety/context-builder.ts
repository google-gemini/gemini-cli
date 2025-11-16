/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SafetyCheckInput, ConversationTurn } from './protocol.js';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Builds context objects for safety checkers, ensuring sensitive data is filtered.
 */
export class ContextBuilder {
  constructor(
    private readonly config: Config,
    private readonly conversationHistory: ConversationTurn[] = [],
  ) {}

  /**
   * Builds the full context object with all available data.
   */
  buildFullContext(): SafetyCheckInput['context'] {
    debugLogger.debug(`[ContextBuilder] buildFullContext called. History is: ${JSON.stringify(this.conversationHistory)}`);
    //TODO: Conversation history is does not contain the user prompt. We need to add it.
    const history = [...this.conversationHistory];
    const currentQuestion = this.config.getQuestion();
    if (currentQuestion && history.length === 0) {
      history.push({
        user: {
          text: currentQuestion,
        },
        model: {},
      });
    }

    return {
      environment: {
        cwd: process.cwd(),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        workspaces: this.config
          .getWorkspaceContext()
          .getDirectories() as string[],
      },
      history: {
        turns: history,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
        (minimalContext as any)[key] = fullContext[key];
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return minimalContext as SafetyCheckInput['context'];
  }
}
