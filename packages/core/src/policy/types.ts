/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SafetyCheckInput } from '../safety/protocol.js';

export enum PolicyDecision {
  ALLOW = 'allow',
  DENY = 'deny',
  ASK_USER = 'ask_user',
}

export enum ApprovalMode {
  DEFAULT = 'default',
  AUTO_EDIT = 'autoEdit',
  YOLO = 'yolo',
}

/**
 * Configuration for the built-in allowed-path checker.
 */
export interface AllowedPathConfig {
  /**
   * Explicitly include argument keys to be checked as paths.
   */
  included_args?: string[];

  /**
   * Explicitly exclude argument keys from being checked as paths.
   */
  excluded_args?: string[];
}

/**
 * Base interface for external checkers.
 */
export interface ExternalCheckerConfig {
  type: 'external';
  name: string;
  config?: unknown;
  required_context?: Array<keyof SafetyCheckInput['context']>;
}

export enum InProcessCheckerType {
  ALLOWED_PATH = 'allowed-path',
}

/**
 * Base interface for in-process checkers.
 */
export interface InProcessCheckerConfig {
  type: 'in-process';
  name: InProcessCheckerType;
  config?: AllowedPathConfig;
  required_context?: Array<keyof SafetyCheckInput['context']>;
}

/**
 * A discriminated union for all safety checker configurations.
 */
export type SafetyCheckerConfig =
  | ExternalCheckerConfig
  | InProcessCheckerConfig;

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

export interface SafetyCheckerRule {
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
   * Priority of this checker. Higher numbers run first.
   * Default is 0.
   */
  priority?: number;

  /**
   * Specifies an external or built-in safety checker to execute for
   * additional validation of a tool call.
   */
  checker: SafetyCheckerConfig;
}

export interface PolicyEngineConfig {
  /**
   * List of policy rules to apply.
   */
  rules?: PolicyRule[];

  /**
   * List of safety checkers to apply.
   */
  checkers?: SafetyCheckerRule[];

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

export interface PolicySettings {
  mcp?: {
    excluded?: string[];
    allowed?: string[];
  };
  tools?: {
    exclude?: string[];
    allowed?: string[];
  };
  mcpServers?: Record<string, { trust?: boolean }>;
}
