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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    VALID_HOOK_SOURCES.includes(source as HookSource)
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
  CONSECA = 'conseca',
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
   * Use '*' to match all tools.
   */
  toolName: string;

  /**
   * The name of the subagent this rule applies to.
   * If undefined, the rule applies regardless of whether it's the main agent or a subagent.
   */
  subagent?: string;

  /**
   * Identifies the MCP server this rule applies to.
   * Enables precise rule matching against `serverName` metadata instead
   * of parsing composite string names.
   */
  mcpName?: string;

  /**
   * Pattern to match against tool arguments.
   * Can be used for more fine-grained control.
   */
  argsPattern?: RegExp;

  /**
   * Metadata annotations provided by the tool (e.g. readOnlyHint).
   * All keys and values in this record must match the tool's annotations.
   */
  toolAnnotations?: Record<string, unknown>;

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
   * If true, this rule only applies to interactive environments.
   * If false, this rule only applies to non-interactive environments.
   * If undefined, it applies to both interactive and non-interactive environments.
   */
  interactive?: boolean;

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

  /**
   * Optional message to display when this rule results in a DENY decision.
   * This message will be returned to the model/user.
   */
  denyMessage?: string;
}

export interface SafetyCheckerRule {
  /**
   * The name of the tool this rule applies to.
   * Use '*' to match all tools.
   */
  toolName: string;

  /**
   * Identifies the MCP server this rule applies to.
   */
  mcpName?: string;

  /**
   * Pattern to match against tool arguments.
   * Can be used for more fine-grained control.
   */
  argsPattern?: RegExp;

  /**
   * Metadata annotations provided by the tool (e.g. readOnlyHint).
   * All keys and values in this record must match the tool's annotations.
   */
  toolAnnotations?: Record<string, unknown>;

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

  /**
   * Source of the rule.
   * e.g. "my-policies.toml", "Workspace: project.toml", etc.
   */
  source?: string;
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
   * Whether to ignore "Always Allow" rules.
   */
  disableAlwaysAllow?: boolean;

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

  /**
   * Whether tool sandboxing is enabled.
   */
  toolSandboxEnabled?: boolean;
  /**
   * List of tools approved by the sandbox policy for the current mode.
   */
  sandboxApprovedTools?: string[];
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
  // User provided policies that will replace the USER level policies in ~/.gemini/policies
  policyPaths?: string[];
  // Admin provided policies that will supplement the ADMIN level policies
  adminPolicyPaths?: string[];
  workspacePoliciesDir?: string;
  disableAlwaysAllow?: boolean;
}

export interface CheckResult {
  decision: PolicyDecision;
  rule?: PolicyRule;
}

/**
 * Priority for subagent tools (registered dynamically).
 * Effective priority matching Tier 1 (Default) read-only tools.
 */
export const PRIORITY_SUBAGENT_TOOL = 1.05;

/**
 * The fractional priority of "Always allow" rules (e.g., 950/1000).
 * Higher fraction within a tier wins.
 */
export const ALWAYS_ALLOW_PRIORITY_FRACTION = 950;

/**
 * The fractional priority offset for "Always allow" rules (e.g., 0.95).
 * This ensures consistency between in-memory rules and persisted rules.
 */
export const ALWAYS_ALLOW_PRIORITY_OFFSET =
  ALWAYS_ALLOW_PRIORITY_FRACTION / 1000;

/**
 * Priority for the YOLO "allow all" rule.
 * Matches the raw priority used in yolo.toml.
 */
export const PRIORITY_YOLO_ALLOW_ALL = 998;
