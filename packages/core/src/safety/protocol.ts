/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionCall } from '@google/genai';

/**
 * Represents a single turn in the conversation between the user and the model.
 * This provides semantic context for why a tool call might be happening.
 */
export interface ConversationTurn {
  user: {
    text: string;
  };
  model: {
    text?: string;
    toolCalls?: FunctionCall[];
  };
}

/**
 * The data structure passed from the CLI to a safety checker process via stdin.
 */
export interface SafetyCheckInput {
  /**
   * The semantic version of the protocol (e.g., "1.0.0"). This allows
   * for introducing breaking changes in the future while maintaining
   * support for older checkers.
   */
  protocolVersion: '1.0.0';

  /**
   * The specific tool call that is being validated.
   */
  toolCall: FunctionCall;

  /**
   * A container for all contextual information from the CLI's internal state.
   * By grouping data into categories, we can easily add new context in the
   * future without creating a flat, unmanageable object.
   */
  context: {
    /**
     * Information about the user's file system and execution environment.
     */
    environment: {
      cwd: string;
      workspaces: string[]; // A list of user-configured workspace roots
    };

    /**
     * A selection of non-sensitive configuration variables that may be
     * relevant to the checker. The policy engine is responsible for
     * populating this, ensuring no secrets are leaked.
     */
    config?: Record<string, unknown>;

    /**
     * The recent history of the conversation. This can be used by checkers
     * that need to understand the intent behind a tool call.
     */
    history?: {
      turns: ConversationTurn[];
    };
  };
}

/**
 * The data structure returned by a safety checker process via stdout.
 */
export interface SafetyCheckResult {
  /**
   * Whether the tool call is allowed to proceed.
   */
  allowed: boolean;
  /**
   * If not allowed, a message explaining why the tool call was blocked.
   * This will be shown to the user.
   */
  reason?: string;
}
