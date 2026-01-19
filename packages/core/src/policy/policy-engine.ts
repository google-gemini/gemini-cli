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
  hasRedirection,
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
   * Check if a shell command is allowed.
   */
  private async checkShellCommand(
    toolName: string,
    command: string | undefined,
    ruleDecision: PolicyDecision,
    serverName: string | undefined,
    dir_path: string | undefined,
    allowRedirection?: boolean,
    rule?: PolicyRule,
  ): Promise<{ decision: PolicyDecision; rule?: PolicyRule }> {
    if (!command) {
      return {
        decision: this.applyNonInteractiveMode(ruleDecision),
        rule,
      };
    }

    await initializeShellParsers();
    const subCommands = splitCommands(command);

    if (subCommands.length === 0) {
      debugLogger.debug(
        `[PolicyEngine.check] Command parsing failed for: ${command}. Falling back to ASK_USER.`,
      );
      // Parsing logic failed, we can't trust it. Force ASK_USER (or DENY).
      // We don't blame a specific rule here, unless the input rule was stricter.
      return {
        decision: this.applyNonInteractiveMode(PolicyDecision.ASK_USER),
        rule: undefined,
      };
    }

    // If there are multiple parts, or if we just want to validate the single part against DENY rules
    if (subCommands.length > 0) {
      debugLogger.debug(
        `[PolicyEngine.check] Validating shell command: ${subCommands.length} parts`,
      );

      if (ruleDecision === PolicyDecision.DENY) {
        return { decision: PolicyDecision.DENY, rule };
      }

      // Start optimistically. If all parts are ALLOW, the whole is ALLOW.
      // We will downgrade if any part is ASK_USER or DENY.
      let aggregateDecision = PolicyDecision.ALLOW;
      let responsibleRule: PolicyRule | undefined;

      for (const rawSubCmd of subCommands) {
        const subCmd = rawSubCmd.trim();
        // Prevent infinite recursion for the root command
        if (subCmd === command) {
          if (!allowRedirection && hasRedirection(subCmd)) {
            debugLogger.debug(
              `[PolicyEngine.check] Downgrading ALLOW to ASK_USER for redirected command: ${subCmd}`,
            );
            // Redirection always downgrades ALLOW to ASK_USER
            if (aggregateDecision === PolicyDecision.ALLOW) {
              aggregateDecision = PolicyDecision.ASK_USER;
              responsibleRule = undefined; // Inherent policy
            }
          } else {
            // Atomic command matching the rule.
            if (
              ruleDecision === PolicyDecision.ASK_USER &&
              aggregateDecision === PolicyDecision.ALLOW
            ) {
              aggregateDecision = PolicyDecision.ASK_USER;
              responsibleRule = rule;
            }
          }
          continue;
        }

        const subResult = await this.check(
          { name: toolName, args: { command: subCmd, dir_path } },
          serverName,
        );

        // subResult.decision is already filtered through applyNonInteractiveMode by this.check()
        const subDecision = subResult.decision;

        // If any part is DENIED, the whole command is DENIED
        if (subDecision === PolicyDecision.DENY) {
          return {
            decision: PolicyDecision.DENY,
            rule: subResult.rule,
          };
        }

        // If any part requires ASK_USER, the whole command requires ASK_USER
        if (subDecision === PolicyDecision.ASK_USER) {
          aggregateDecision = PolicyDecision.ASK_USER;
          if (!responsibleRule) {
            responsibleRule = subResult.rule;
          }
        }

        // Check for redirection in allowed sub-commands
        if (
          subDecision === PolicyDecision.ALLOW &&
          !allowRedirection &&
          hasRedirection(subCmd)
        ) {
          debugLogger.debug(
            `[PolicyEngine.check] Downgrading ALLOW to ASK_USER for redirected command: ${subCmd}`,
          );
          if (aggregateDecision === PolicyDecision.ALLOW) {
            aggregateDecision = PolicyDecision.ASK_USER;
            responsibleRule = undefined;
          }
        }
      }
      return {
        decision: this.applyNonInteractiveMode(aggregateDecision),
        // If we stayed at ALLOW, we return the original rule (if any).
        // If we downgraded, we return the responsible rule (or undefined if implicit).
        rule: aggregateDecision === ruleDecision ? rule : responsibleRule,
      };
    }

    return {
      decision: this.applyNonInteractiveMode(ruleDecision),
      rule,
    };
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
    let isShellCommand = false;
    let command: string | undefined;
    let shellDirPath: string | undefined;

    if (toolCall.name && SHELL_TOOL_NAMES.includes(toolCall.name)) {
      isShellCommand = true;
      const args = toolCall.args as { command?: string; dir_path?: string };
      command = args?.command;
      shellDirPath = args?.dir_path;
    }

    // Find the first matching rule (already sorted by priority)
    let matchedRule: PolicyRule | undefined;
    let decision: PolicyDecision | undefined;

    // For tools with a server name, we want to try matching both the
    // original name and the fully qualified name (server__tool).
    const toolCallsToTry: FunctionCall[] = [toolCall];
    if (serverName && toolCall.name && !toolCall.name.includes('__')) {
      toolCallsToTry.push({
        ...toolCall,
        name: `${serverName}__${toolCall.name}`,
      });
    }

    for (const rule of this.rules) {
      const match = toolCallsToTry.some((tc) =>
        ruleMatches(rule, tc, stringifiedArgs, serverName, this.approvalMode),
      );

      if (match) {
        debugLogger.debug(
          `[PolicyEngine.check] MATCHED rule: toolName=${rule.toolName}, decision=${rule.decision}, priority=${rule.priority}, argsPattern=${rule.argsPattern?.source || 'none'}`,
        );

        if (isShellCommand) {
          const shellResult = await this.checkShellCommand(
            toolCall.name!,
            command,
            rule.decision,
            serverName,
            shellDirPath,
            rule.allowRedirection,
            rule,
          );
          decision = shellResult.decision;
          if (shellResult.rule) {
            matchedRule = shellResult.rule;
            break;
          }
          // If no rule returned (e.g. downgraded to default ASK_USER due to redirection),
          // we might still want to blame the matched rule?
          // No, test says we should return undefined rule if implicit.
          matchedRule = shellResult.rule;
          break;
        } else {
          decision = this.applyNonInteractiveMode(rule.decision);
          matchedRule = rule;
          break;
        }
      }
    }

    if (!decision) {
      // No matching rule found, use default decision
      debugLogger.debug(
        `[PolicyEngine.check] NO MATCH - using default decision: ${this.defaultDecision}`,
      );
      decision = this.applyNonInteractiveMode(this.defaultDecision);

      // If it's a shell command and we fell back to default, we MUST still verify subcommands!
      // This is critical for security: "git commit && git push" where "git push" is DENY but "git commit" has no rule.
      if (isShellCommand && decision !== PolicyDecision.DENY) {
        const shellResult = await this.checkShellCommand(
          toolCall.name!,
          command,
          decision, // default decision
          serverName,
          shellDirPath,
          false, // no rule, so no allowRedirection
          undefined, // no rule
        );
        decision = shellResult.decision;
        matchedRule = shellResult.rule;
      }
    }

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
              decision = PolicyDecision.ASK_USER;
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
      decision: this.applyNonInteractiveMode(decision),
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
