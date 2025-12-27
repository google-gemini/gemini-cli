/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FunctionCall } from '@google/genai';
import {
  PolicyDecision,
  type PolicyEngineConfig,
  type PolicyRule,
  type SafetyCheckerRule,
  type HookCheckerRule,
  type HookExecutionContext,
  getHookSource,
  ApprovalMode,
} from './types.js';
import { stableStringify } from './stable-stringify.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { CheckerRunner } from '../safety/checker-runner.js';
import { SafetyCheckDecision } from '../safety/protocol.js';
import type { HookExecutionRequest } from '../confirmation-bus/types.js';
import {
  SHELL_TOOL_NAMES,
  initializeShellParsers,
  splitCommands,
} from '../utils/shell-utils.js';

function ruleMatches(
  rule: PolicyRule | SafetyCheckerRule,
  toolCall: FunctionCall,
  stringifiedArgs: string | undefined,
  serverName: string | undefined,
  currentApprovalMode: ApprovalMode,
): boolean {
  // Check if rule applies to current approval mode
  if (rule.modes && rule.modes.length > 0) {
    if (!rule.modes.includes(currentApprovalMode)) {
      return false;
    }
  }

  // Check tool name if specified
  if (rule.toolName) {
    // Support wildcard patterns: "serverName__*" matches "serverName__anyTool"
    if (rule.toolName.endsWith('__*')) {
      const prefix = rule.toolName.slice(0, -3); // Remove "__*"
      if (serverName !== undefined) {
        // Robust check: if serverName is provided, it MUST match the prefix exactly.
        // This prevents "malicious-server" from spoofing "trusted-server" by naming itself "trusted-server__malicious".
        if (serverName !== prefix) {
          return false;
        }
      }
      // Always verify the prefix, even if serverName matched
      if (!toolCall.name || !toolCall.name.startsWith(prefix + '__')) {
        return false;
      }
    } else if (toolCall.name !== rule.toolName) {
      return false;
    }
  }

  // Check args pattern if specified
  if (rule.argsPattern) {
    // If rule has an args pattern but tool has no args, no match
    if (!toolCall.args) {
      return false;
    }
    // Use stable JSON stringification with sorted keys to ensure consistent matching
    if (
      stringifiedArgs === undefined ||
      !rule.argsPattern.test(stringifiedArgs)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a hook checker rule matches a hook execution context.
 */
function hookCheckerMatches(
  rule: HookCheckerRule,
  context: HookExecutionContext,
): boolean {
  // Check event name if specified
  if (rule.eventName && rule.eventName !== context.eventName) {
    return false;
  }

  // Check hook source if specified
  if (rule.hookSource && rule.hookSource !== context.hookSource) {
    return false;
  }

  return true;
}

export class PolicyEngine {
  private rules: PolicyRule[];
  private checkers: SafetyCheckerRule[];
  private hookCheckers: HookCheckerRule[];
  private readonly defaultDecision: PolicyDecision;
  private readonly nonInteractive: boolean;
  private readonly checkerRunner?: CheckerRunner;
  private readonly allowHooks: boolean;
  private approvalMode: ApprovalMode;

  constructor(config: PolicyEngineConfig = {}, checkerRunner?: CheckerRunner) {
    this.rules = (config.rules ?? []).sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    this.checkers = (config.checkers ?? []).sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    this.hookCheckers = (config.hookCheckers ?? []).sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    this.defaultDecision = config.defaultDecision ?? PolicyDecision.ASK_USER;
    this.nonInteractive = config.nonInteractive ?? false;
    this.checkerRunner = checkerRunner;
    this.allowHooks = config.allowHooks ?? true;
    this.approvalMode = config.approvalMode ?? ApprovalMode.DEFAULT;
  }

  /**
   * Update the current approval mode.
   */
  setApprovalMode(mode: ApprovalMode): void {
    this.approvalMode = mode;
  }

  /**
   * Get the current approval mode.
   */
  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  /**
   * Check if a tool call is allowed based on the configured policies.
   * Returns the decision and the matching rule (if any).
   */
  async check(
    toolCall: FunctionCall,
    serverName: string | undefined,
  ): Promise<{
    decision: PolicyDecision;
    rule?: PolicyRule;
  }> {
    let stringifiedArgs: string | undefined;
    // Compute stringified args once before the loop
    if (
      toolCall.args &&
      (this.rules.some((rule) => rule.argsPattern) ||
        this.checkers.some((checker) => checker.argsPattern))
    ) {
      stringifiedArgs = stableStringify(toolCall.args);
    }

    debugLogger.debug(
      `[PolicyEngine.check] toolCall.name: ${toolCall.name}, stringifiedArgs: ${stringifiedArgs}`,
    );

    // Check for shell commands upfront to handle splitting
    let subCommands: string[] | undefined;
    let isShellCommand = false;
    let command: string | undefined;

    if (toolCall.name && SHELL_TOOL_NAMES.includes(toolCall.name)) {
      isShellCommand = true;
      command = (toolCall.args as { command?: string })?.command;
      if (command) {
        // Initialize parser if needed (lazy load)
        await initializeShellParsers();
        subCommands = splitCommands(command);

        if (subCommands.length === 0) {
          // Parsing failed or empty command -> Unsafe to rely on prefix matching
          debugLogger.debug(
            `[PolicyEngine.check] Command parsing failed for: ${command}. Falling back to default/safe decision.`,
          );
          // If parsing fails, we cannot safely decompose the command.
          // We force an ASK_USER decision (or DENY in non-interactive) regardless of rules,
          // because we can't guarantee a rule matches the *actual* executed logic if we can't parse it.
          // Using defaultDecision might be too lenient if default is ALLOW (though it shouldn't be).
          // Safest is ASK_USER.
          return {
            decision: this.applyNonInteractiveMode(PolicyDecision.ASK_USER),
            rule: undefined,
          };
        }
      }
    }

    let matchedRule: PolicyRule | undefined;
    let decision: PolicyDecision | undefined;

    for (const rule of this.rules) {
      if (
        ruleMatches(
          rule,
          toolCall,
          stringifiedArgs,
          serverName,
          this.approvalMode,
        )
      ) {
        debugLogger.debug(
          `[PolicyEngine.check] MATCHED rule: toolName=${rule.toolName}, decision=${rule.decision}, priority=${rule.priority}, argsPattern=${rule.argsPattern?.source || 'none'}`,
        );

        matchedRule = rule;
        decision = rule.decision;
        break;
      }
    }

    if (!decision) {
      // No matching rule found
      debugLogger.debug(
        `[PolicyEngine.check] NO MATCH - using default decision: ${this.defaultDecision}`,
      );
      decision = this.defaultDecision;
    }

    if (isShellCommand && decision !== PolicyDecision.DENY) {
      // For shell commands, if we are not already denying, we must verify ALL subcommands.
      // We check subcommands if there's more than one (meaning decomposition happened).
      // If subsCommands is set (length > 0), we check them.
      if (subCommands && subCommands.length > 1) {
        debugLogger.debug(
          `[PolicyEngine.check] Compound command detected: ${subCommands.length} parts`,
        );
        let aggregateDecision: PolicyDecision = decision;
        // We need to check if *any* subcommand fails the check.
        // This ensures that "git log" matches the "git log" rule,
        // and "rm -rf /" matches (or doesn't match) its own rules.

        for (const subCmd of subCommands) {
          // Prevent infinite recursion if the subcommand is identical to the original command.
          // This happens when splitCommands returns the root command along with its children.
          // We use trimmed comparison to be robust against whitespace differences.
          if (command && subCmd.trim() === command.trim()) {
            debugLogger.debug(
              `[PolicyEngine.check] Skipping recursion for self-referential command: "${subCmd.trim()}" vs original: "${command.trim()}"`,
            );
            continue;
          }

          const subCall = {
            name: toolCall.name,
            args: { command: subCmd },
          };
          const subResult = await this.check(subCall, serverName);

          if (subResult.decision === PolicyDecision.DENY) {
            aggregateDecision = PolicyDecision.DENY;
            matchedRule = subResult.rule ?? matchedRule; // Blame the rule that denied it
            break;
          } else if (subResult.decision === PolicyDecision.ASK_USER) {
            // Downgrade ALLOW to ASK_USER, but keep DENY if already denied
            if (aggregateDecision === PolicyDecision.ALLOW) {
              aggregateDecision = PolicyDecision.ASK_USER;
              matchedRule = subResult.rule ?? undefined; // If explicit rule, use it, else undefined
            } else if (
              aggregateDecision === PolicyDecision.ASK_USER &&
              subResult.rule !== undefined &&
              matchedRule === undefined
            ) {
              // If already ASK_USER (e.g., from default), and this subcommand has a specific ASK_USER rule,
              // and no specific rule has been blamed yet, then blame this specific rule.
              matchedRule = subResult.rule;
            }
          }
        }
        decision = aggregateDecision;
      }
    }

    // Apply non-interactive mode constraint to the final decision
    decision = this.applyNonInteractiveMode(decision);

    // If decision is not DENY, run safety checkers
    if (decision !== PolicyDecision.DENY && this.checkerRunner) {
      for (const checkerRule of this.checkers) {
        if (
          ruleMatches(
            checkerRule,
            toolCall,
            stringifiedArgs,
            serverName,
            this.approvalMode,
          )
        ) {
          debugLogger.debug(
            `[PolicyEngine.check] Running safety checker: ${checkerRule.checker.name}`,
          );
          try {
            const result = await this.checkerRunner.runChecker(
              toolCall,
              checkerRule.checker,
            );

            if (result.decision === SafetyCheckDecision.DENY) {
              debugLogger.debug(
                `[PolicyEngine.check] Safety checker denied: ${result.reason}`,
              );
              return {
                decision: PolicyDecision.DENY,
                rule: matchedRule,
              };
            } else if (result.decision === SafetyCheckDecision.ASK_USER) {
              debugLogger.debug(
                `[PolicyEngine.check] Safety checker requested ASK_USER: ${result.reason}`,
              );
              decision = this.applyNonInteractiveMode(PolicyDecision.ASK_USER);
            }
          } catch (error) {
            debugLogger.debug(
              `[PolicyEngine.check] Safety checker failed: ${error}`,
            );
            return {
              decision: PolicyDecision.DENY,
              rule: matchedRule,
            };
          }
        }
      }
    }

    return {
      decision,
      rule: matchedRule,
    };
  }

  /**
   * Add a new rule to the policy engine.
   */
  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
    // Re-sort rules by priority
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  addChecker(checker: SafetyCheckerRule): void {
    this.checkers.push(checker);
    this.checkers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Remove rules for a specific tool.
   */
  removeRulesForTool(toolName: string): void {
    this.rules = this.rules.filter((rule) => rule.toolName !== toolName);
  }

  /**
   * Get all current rules.
   */
  getRules(): readonly PolicyRule[] {
    return this.rules;
  }

  getCheckers(): readonly SafetyCheckerRule[] {
    return this.checkers;
  }

  /**
   * Add a new hook checker to the policy engine.
   */
  addHookChecker(checker: HookCheckerRule): void {
    this.hookCheckers.push(checker);
    this.hookCheckers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Get all current hook checkers.
   */
  getHookCheckers(): readonly HookCheckerRule[] {
    return this.hookCheckers;
  }

  /**
   * Check if a hook execution is allowed based on the configured policies.
   * Runs hook-specific safety checkers if configured.
   */
  async checkHook(
    request: HookExecutionRequest | HookExecutionContext,
  ): Promise<PolicyDecision> {
    // If hooks are globally disabled, deny all hook executions
    if (!this.allowHooks) {
      return PolicyDecision.DENY;
    }

    const context: HookExecutionContext =
      'input' in request
        ? {
            eventName: request.eventName,
            hookSource: getHookSource(request.input),
            trustedFolder:
              typeof request.input['trusted_folder'] === 'boolean'
                ? request.input['trusted_folder']
                : undefined,
          }
        : request;

    // In untrusted folders, deny project-level hooks
    if (context.trustedFolder === false && context.hookSource === 'project') {
      return PolicyDecision.DENY;
    }

    // Run hook-specific safety checkers if configured
    if (this.checkerRunner && this.hookCheckers.length > 0) {
      for (const checkerRule of this.hookCheckers) {
        if (hookCheckerMatches(checkerRule, context)) {
          debugLogger.debug(
            `[PolicyEngine.checkHook] Running hook checker: ${checkerRule.checker.name} for event: ${context.eventName}`,
          );
          try {
            // Create a synthetic function call for the checker runner
            // This allows reusing the existing checker infrastructure
            const syntheticCall = {
              name: `hook:${context.eventName}`,
              args: {
                hookSource: context.hookSource,
                trustedFolder: context.trustedFolder,
              },
            };

            const result = await this.checkerRunner.runChecker(
              syntheticCall,
              checkerRule.checker,
            );

            if (result.decision === SafetyCheckDecision.DENY) {
              debugLogger.debug(
                `[PolicyEngine.checkHook] Hook checker denied: ${result.reason}`,
              );
              return PolicyDecision.DENY;
            } else if (result.decision === SafetyCheckDecision.ASK_USER) {
              debugLogger.debug(
                `[PolicyEngine.checkHook] Hook checker requested ASK_USER: ${result.reason}`,
              );
              // For hooks, ASK_USER is treated as DENY in non-interactive mode
              return this.applyNonInteractiveMode(PolicyDecision.ASK_USER);
            }
          } catch (error) {
            debugLogger.debug(
              `[PolicyEngine.checkHook] Hook checker failed: ${error}`,
            );
            return PolicyDecision.DENY;
          }
        }
      }
    }

    // Default: Allow hooks
    return PolicyDecision.ALLOW;
  }

  private applyNonInteractiveMode(decision: PolicyDecision): PolicyDecision {
    // In non-interactive mode, ASK_USER becomes DENY
    if (this.nonInteractive && decision === PolicyDecision.ASK_USER) {
      return PolicyDecision.DENY;
    }
    return decision;
  }
}
