/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum PolicyDecision {
  ALLOW = 'allow',
  DENY = 'deny',
  ASK_USER = 'ask_user',
}

export interface PolicyRule {
  /**
   * The name of the tool this rule applies to.
   * If undefined, the rule applies to all tools.
   */
  toolName?: string;

  /**
   * Pattern to match against tool arguments.
   * Can be used for more fine-grained control.
   */
  argsPattern?: RegExp;

  /**
   * The decision to make when this rule matches.
   */
  decision: PolicyDecision;

  /**
   * Priority of this rule. Higher numbers take precedence.
   * Default is 0.
   */
  priority?: number;
}

export interface PolicyEngineConfig {
  /**
   * List of policy rules to apply.
   */
  rules?: PolicyRule[];

  /**
   * Default decision when no rules match.
   * Defaults to ASK_USER.
   */
  defaultDecision?: PolicyDecision;

  /**
   * Whether to allow tools in non-interactive mode.
   * When true, ASK_USER decisions become DENY.
   */
  nonInteractive?: boolean;
}
