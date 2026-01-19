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

/**
 * Valid sources for hook execution
 */
export type HookSource = 'project' | 'user' | 'system' | 'extension';

/**
 * Array of valid hook source values for runtime validation
 */
const VALID_HOOK_SOURCES: HookSource[] = [
  'project',
  'user',
  'system',
  'extension',
];

/**
 * Safely extract and validate hook source from input
 * Returns 'project' as default if the value is invalid or missing
 */
export function getHookSource(input: Record<string, unknown>): HookSource {
  const source = input['hook_source'];
  if (
    typeof source === 'string' &&
    VALID_HOOK_SOURCES.includes(source as HookSource)
  ) {
    return source as HookSource;
  }
  return 'project';
}

export enum ApprovalMode {
  DEFAULT = 'default',
  AUTO_EDIT = 'autoEdit',
  YOLO = 'yolo',
  PLAN = 'plan',
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
   * A unique name for the policy rule, useful for identification and debugging.
   */
  name?: string;

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
   * Approval modes this rule applies to.
   * If undefined or empty, it applies to all modes.
   */
  modes?: ApprovalMode[];

  /**
   * If true, allows command redirection even if the policy engine would normally
   * downgrade ALLOW to ASK_USER for redirected commands.
   * Only applies when decision is ALLOW.
   */
  allowRedirection?: boolean;

  /**
   * Effect of the rule's source.
   * e.g. "my-policies.toml", "Settings (MCP Trusted)", etc.
   */
  source?: string;
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

  /**
   * Approval modes this rule applies to.
   * If undefined or empty, it applies to all modes.
   */
  modes?: ApprovalMode[];
}

export interface HookExecutionContext {
  eventName: string;
  hookSource?: HookSource;
  trustedFolder?: boolean;
}

/**
 * Rule for applying safety checkers to hook executions.
 * Similar to SafetyCheckerRule but with hook-specific matching criteria.
 */
export interface HookCheckerRule {
  /**
   * The name of the hook event this rule applies to.
   * If undefined, the rule applies to all hook events.
   */
  eventName?: string;

  /**
   * The source of hooks this rule applies to.
   * If undefined, the rule applies to all hook sources.
   */
  hookSource?: HookSource;

  /**
   * Priority of this checker. Higher numbers run first.
   * Default is 0.
   */
  priority?: number;

  /**
   * Specifies an external or built-in safety checker to execute for
   * additional validation of a hook execution.
   */
  checker: SafetyCheckerConfig;
}

export interface PolicyEngineConfig {
  /**
   * List of policy rules to apply.
   */
  rules?: PolicyRule[];

  /**
   * List of safety checkers to apply to tool calls.
   */
  checkers?: SafetyCheckerRule[];

  /**
   * List of safety checkers to apply to hook executions.
   */
  hookCheckers?: HookCheckerRule[];

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

  /**
   * Whether to allow hooks to execute.
   * When false, all hooks are denied.
   * Defaults to true.
   */
  allowHooks?: boolean;

  /**
   * Current approval mode.
   * Used to filter rules that have specific 'modes' defined.
   */
  approvalMode?: ApprovalMode;
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
