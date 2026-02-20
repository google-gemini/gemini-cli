/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FunctionCall } from '@google/genai';
import {
  PolicyDecision,
  type PolicyEngineConfig,
  type PolicyRule,
  type SafetyCheckerRule,
  type HookCheckerRule,
  ApprovalMode,
  type CheckResult,
} from './types.js';
import { stableStringify } from './stable-stringify.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { CheckerRunner } from '../safety/checker-runner.js';
import { SafetyCheckDecision } from '../safety/protocol.js';
import {
  SHELL_TOOL_NAMES,
  initializeShellParsers,
  splitCommands,
  hasRedirection,
} from '../utils/shell-utils.js';
import { getToolAliases } from '../tools/tool-names.js';

function isWildcardPattern(name: string): boolean {
  return name.endsWith('__*');
}

function getWildcardPrefix(pattern: string): string {
  return pattern.slice(0, -3);
}

function matchesWildcard(pattern: string, toolName: string): boolean {
  if (!isWildcardPattern(pattern)) {
    return false;
  }
  const prefix = getWildcardPrefix(pattern);
  return toolName.startsWith(prefix + '__');
}

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
    if (isWildcardPattern(rule.toolName)) {
      const prefix = getWildcardPrefix(rule.toolName);
      if (serverName !== undefined) {
        // Robust check: if serverName is provided, it MUST match the prefix exactly.
        // This prevents "malicious-server" from spoofing "trusted-server" by naming itself "trusted-server__malicious".
        if (serverName !== prefix) {
          return false;
        }
      }
      // Always verify the prefix, even if serverName matched
      if (!toolCall.name || !matchesWildcard(rule.toolName, toolCall.name)) {
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

export class PolicyEngine {
  private rules: PolicyRule[];
  private checkers: SafetyCheckerRule[];
  private hookCheckers: HookCheckerRule[];
  private readonly defaultDecision: PolicyDecision;
  private readonly nonInteractive: boolean;
  private readonly checkerRunner?: CheckerRunner;
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

  private shouldDowngradeForRedirection(
    command: string,
    allowRedirection?: boolean,
  ): boolean {
    return (
      !allowRedirection &&
      hasRedirection(command) &&
      this.approvalMode !== ApprovalMode.AUTO_EDIT &&
      this.approvalMode !== ApprovalMode.YOLO
    );
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
  ): Promise<CheckResult> {
    if (!command) {
      return {
        decision: this.applyNonInteractiveMode(ruleDecision),
        rule,
      };
    }

    await initializeShellParsers();
    const subCommands = splitCommands(command);

    if (subCommands.length === 0) {
      // If the matched rule says DENY, we should respect it immediately even if parsing fails.
      if (ruleDecision === PolicyDecision.DENY) {
        return { decision: PolicyDecision.DENY, rule };
      }

      // In YOLO mode, we should proceed anyway even if we can't parse the command.
      if (this.approvalMode === ApprovalMode.YOLO) {
        return {
          decision: PolicyDecision.ALLOW,
          rule,
        };
      }

      debugLogger.debug(
        `[PolicyEngine.check] Command parsing failed for: ${command}. Falling back to ASK_USER.`,
      );

      // Parsing logic failed, we can't trust it. Force ASK_USER (or DENY).
      // We return the rule that matched so the evaluation loop terminates.
      return {
        decision: this.applyNonInteractiveMode(PolicyDecision.ASK_USER),
        rule,
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

      // Check for redirection on the full command string
      if (this.shouldDowngradeForRedirection(command, allowRedirection)) {
        debugLogger.debug(
          `[PolicyEngine.check] Downgrading ALLOW to ASK_USER for redirected command: ${command}`,
        );
        aggregateDecision = PolicyDecision.ASK_USER;
        responsibleRule = undefined; // Inherent policy
      }

      for (const rawSubCmd of subCommands) {
        const subCmd = rawSubCmd.trim();
        // Prevent infinite recursion for the root command
        if (subCmd === command) {
          if (this.shouldDowngradeForRedirection(subCmd, allowRedirection)) {
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

        // If any part is DENIED, the whole command is DENY
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
          this.shouldDowngradeForRedirection(subCmd, allowRedirection)
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
  ): Promise<CheckResult> {
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

    const toolName = toolCall.name;

    if (toolName && SHELL_TOOL_NAMES.includes(toolName)) {
      isShellCommand = true;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const args = toolCall.args as { command?: string; dir_path?: string };
      command = args?.command;
      shellDirPath = args?.dir_path;
    }

    // Find the first matching rule (already sorted by priority)
    let matchedRule: PolicyRule | undefined;
    let decision: PolicyDecision | undefined;

    // For tools with a server name, we want to try matching both the
    // original name and the fully qualified name (server__tool).
    // We also want to check legacy aliases for the tool name.
    const toolNamesToTry = toolCall.name ? getToolAliases(toolCall.name) : [];

    const toolCallsToTry: FunctionCall[] = [];
    for (const name of toolNamesToTry) {
      toolCallsToTry.push({ ...toolCall, name });
      if (serverName && !name.includes('__')) {
        toolCallsToTry.push({
          ...toolCall,
          name: `${serverName}__${name}`,
        });
      }
    }

    for (const rule of this.rules) {
      const match = toolCallsToTry.some((tc) =>
        ruleMatches(rule, tc, stringifiedArgs, serverName, this.approvalMode),
      );

      if (match) {
        debugLogger.debug(
          `[PolicyEngine.check] MATCHED rule: toolName=${rule.toolName}, decision=${rule.decision}, priority=${rule.priority}, argsPattern=${rule.argsPattern?.source || 'none'}`,
        );

        if (isShellCommand && toolName) {
          const shellResult = await this.checkShellCommand(
            toolName,
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
        } else {
          decision = this.applyNonInteractiveMode(rule.decision);
          matchedRule = rule;
          break;
        }
      }
    }

    // Default if no rule matched
    if (decision === undefined) {
      debugLogger.debug(
        `[PolicyEngine.check] NO MATCH - using default decision: ${this.defaultDecision}`,
      );
      if (toolName && SHELL_TOOL_NAMES.includes(toolName)) {
        const shellResult = await this.checkShellCommand(
          toolName,
          command,
          this.defaultDecision,
          serverName,
          shellDirPath,
        );
        decision = shellResult.decision;
        matchedRule = shellResult.rule;
      } else {
        decision = this.applyNonInteractiveMode(this.defaultDecision);
      }
    }

    // Safety checks
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
                `[PolicyEngine.check] Safety checker '${checkerRule.checker.name}' denied execution: ${result.reason}`,
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
              `[PolicyEngine.check] Safety checker '${checkerRule.checker.name}' threw an error:`,
              error,
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
   * Remove rules matching a specific tier (priority band).
   */
  removeRulesByTier(tier: number): void {
    this.rules = this.rules.filter(
      (rule) => Math.floor(rule.priority ?? 0) !== tier,
    );
  }

  /**
   * Remove checkers matching a specific tier (priority band).
   */
  removeCheckersByTier(tier: number): void {
    this.checkers = this.checkers.filter(
      (checker) => Math.floor(checker.priority ?? 0) !== tier,
    );
  }

  /**
   * Remove rules for a specific tool.
   * If source is provided, only rules matching that source are removed.
   */
  removeRulesForTool(toolName: string, source?: string): void {
    this.rules = this.rules.filter(
      (rule) =>
        rule.toolName !== toolName ||
        (source !== undefined && rule.source !== source),
    );
  }

  /**
   * Get all current rules.
   */
  getRules(): readonly PolicyRule[] {
    return this.rules;
  }

  /**
   * Check if a rule for a specific tool already exists.
   * If ignoreDynamic is true, it only returns true if a rule exists that was NOT added by AgentRegistry.
   */
  hasRuleForTool(toolName: string, ignoreDynamic = false): boolean {
    return this.rules.some(
      (rule) =>
        rule.toolName === toolName &&
        (!ignoreDynamic || rule.source !== 'AgentRegistry (Dynamic)'),
    );
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
   * Get tools that are effectively denied by the current rules.
   * This takes into account:
   * 1. Global rules (no argsPattern)
   * 2. Priority order (higher priority wins)
   * 3. Non-interactive mode (ASK_USER becomes DENY)
   */
  getExcludedTools(): Set<string> {
    const excludedTools = new Set<string>();
    const processedTools = new Set<string>();
    let globalVerdict: PolicyDecision | undefined;

    for (const rule of this.rules) {
      if (rule.argsPattern) {
        if (rule.toolName && rule.decision !== PolicyDecision.DENY) {
          processedTools.add(rule.toolName);
        }
        continue;
      }

      // Check if rule applies to current approval mode
      if (rule.modes && rule.modes.length > 0) {
        if (!rule.modes.includes(this.approvalMode)) {
          continue;
        }
      }

      // Handle Global Rules
      if (!rule.toolName) {
        if (globalVerdict === undefined) {
          globalVerdict = rule.decision;
          if (globalVerdict !== PolicyDecision.DENY) {
            // Global ALLOW/ASK found.
            // Since rules are sorted by priority, this overrides any lower-priority rules.
            // We can stop processing because nothing else will be excluded.
            break;
          }
          // If Global DENY, we continue to find specific tools to add to excluded set
        }
        continue;
      }

      const toolName = rule.toolName;

      // Check if already processed (exact match)
      if (processedTools.has(toolName)) {
        continue;
      }

      // Check if covered by a processed wildcard
      let coveredByWildcard = false;
      for (const processed of processedTools) {
        if (
          isWildcardPattern(processed) &&
          matchesWildcard(processed, toolName)
        ) {
          // It's covered by a higher-priority wildcard rule.
          // If that wildcard rule resulted in exclusion, this tool should also be excluded.
          if (excludedTools.has(processed)) {
            excludedTools.add(toolName);
          }
          coveredByWildcard = true;
          break;
        }
      }
      if (coveredByWildcard) {
        continue;
      }

      processedTools.add(toolName);

      // Determine decision
      let decision: PolicyDecision;
      if (globalVerdict !== undefined) {
        decision = globalVerdict;
      } else {
        decision = rule.decision;
      }

      if (decision === PolicyDecision.DENY) {
        excludedTools.add(toolName);
      }
    }
    return excludedTools;
  }

  private applyNonInteractiveMode(decision: PolicyDecision): PolicyDecision {
    // In non-interactive mode, ASK_USER becomes DENY
    if (this.nonInteractive && decision === PolicyDecision.ASK_USER) {
      return PolicyDecision.DENY;
    }
    return decision;
  }
}
