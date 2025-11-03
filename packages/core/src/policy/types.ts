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
   * Additional directories to allow beyond the default CWD and workspaces.
   */
  additional_allowed_paths?: string[];

  /**
   * If true, follow symlinks when validating paths. Default: false for security.
   */
  follow_symlinks?: boolean;
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

/**
 * Base interface for in-process checkers.
 */
export interface InProcessCheckerConfig {
  type: 'in-process';
  name: 'allowed-path'; // For now, only 'allowed-path' is in-process
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

  /**
   * Specifies an external or built-in safety checker to execute for
   * additional validation of a tool call.
   */
  safety_checker?: SafetyCheckerConfig;
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
