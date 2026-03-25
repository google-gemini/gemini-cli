/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FunctionCall } from '@google/genai';
import {
  SHELL_TOOL_NAMES,
  initializeShellParsers,
  splitCommands,
  hasRedirection,
  extractStringFromParseEntry,
} from '../utils/shell-utils.js';
import { parse as shellParse } from 'shell-quote';
import {
  PolicyDecision,
  type PolicyEngineConfig,
  type PolicyRule,
  type SafetyCheckerRule,
  type HookCheckerRule,
  ApprovalMode,
  type CheckResult,
  ALWAYS_ALLOW_PRIORITY_FRACTION,
} from './types.js';
import { stableStringify } from './stable-stringify.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { CheckerRunner } from '../safety/checker-runner.js';
import { SafetyCheckDecision } from '../safety/protocol.js';
import { getToolAliases } from '../tools/tool-names.js';
import {
  MCP_TOOL_PREFIX,
  isMcpToolAnnotation,
  parseMcpToolName,
  formatMcpToolName,
  isMcpToolName,
} from '../tools/mcp-tool.js';
import {
  type SandboxManager,
  NoopSandboxManager,
} from '../services/sandboxManager.js';

function isWildcardPattern(name: string): boolean {
  return name === '*' || name.includes('*');
}

/**
 * Checks if a tool call matches a wildcard pattern.
 * Supports global (*) and the explicit MCP (*mcp_serverName_**) format.
 */
function matchesWildcard(
  pattern: string,
  toolName: string,
  serverName: string | undefined,
): boolean {
  if (pattern === '*') {
    return true;
  }

  if (pattern === `${MCP_TOOL_PREFIX}*`) {
    return serverName !== undefined;
  }

  if (pattern.startsWith(MCP_TOOL_PREFIX) && pattern.endsWith('_*')) {
    const expectedServerName = pattern.slice(MCP_TOOL_PREFIX.length, -2);
    // 1. Must be an MCP tool call (has serverName)
    // 2. Server name must match
    // 3. Tool name must be properly qualified by that server
    if (serverName === undefined || serverName !== expectedServerName) {
      return false;
    }
    return toolName.startsWith(`${MCP_TOOL_PREFIX}${expectedServerName}_`);
  }

  // Not a recognized wildcard pattern, fallback to exact match just in case
  return toolName === pattern;
}

function ruleMatches(
  rule: PolicyRule | SafetyCheckerRule,
  toolCall: FunctionCall,
  stringifiedArgs: string | undefined,
  serverName: string | undefined,
  currentApprovalMode: ApprovalMode,
  nonInteractive: boolean,
  toolAnnotations?: Record<string, unknown>,
  subagent?: string,
): boolean {
  // Check if rule applies to current approval mode
  if (rule.modes && rule.modes.length > 0) {
    if (!rule.modes.includes(currentApprovalMode)) {
      return false;
    }
  }

  // Check subagent if specified (only for PolicyRule, SafetyCheckerRule doesn't have it)
  if ('subagent' in rule && rule.subagent !== undefined) {
    if (rule.subagent !== subagent) {
      return false;
    }
  }

  // Strictly enforce mcpName identity if the rule dictates it
  if (rule.mcpName !== undefined) {
    if (rule.mcpName === '*') {
      // Rule requires it to be ANY MCP tool
      if (serverName === undefined) return false;
    } else {
      // Rule requires it to be a specific MCP server
      if (serverName !== rule.mcpName) return false;
    }
  }

  // Check tool name if specified
  if (rule.toolName !== undefined) {
    // Support wildcard patterns: "mcp_serverName_*" matches "mcp_serverName_anyTool"
    if (rule.toolName === '*') {
      // Match all tools
    } else if (isWildcardPattern(rule.toolName)) {
      if (
        !toolCall.name ||
        !matchesWildcard(rule.toolName, toolCall.name, serverName)
      ) {
        return false;
      }
    } else if (toolCall.name !== rule.toolName) {
      // If names don't match exactly, check for MCP short/full name mismatches
      let mcpMatch = false;
      if (serverName && toolCall.name) {
        // Case 1: Rule uses short name + mcpName -> match FQN tool call
        if (rule.mcpName && !isMcpToolName(rule.toolName)) {
          if (
            toolCall.name === formatMcpToolName(rule.mcpName, rule.toolName)
          ) {
            mcpMatch = true;
          }
        }
        // Case 2: Rule uses FQN -> match short tool call (qualified by serverName)
        if (!mcpMatch && isMcpToolName(rule.toolName)) {
          if (rule.toolName === formatMcpToolName(serverName, toolCall.name)) {
            mcpMatch = true;
          }
        }
      }

      if (!mcpMatch) {
        return false;
      }
    }
  }

  // Check annotations if specified
  if (rule.toolAnnotations) {
    if (!toolAnnotations) {
      return false;
    }
    for (const [key, value] of Object.entries(rule.toolAnnotations)) {
      if (toolAnnotations[key] !== value) {
        return false;
      }
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

  // Check interactive if specified
  if ('interactive' in rule && rule.interactive !== undefined) {
    if (rule.interactive && nonInteractive) {
      return false;
    }
    if (!rule.interactive && !nonInteractive) {
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
  private readonly disableAlwaysAllow: boolean;
  private readonly checkerRunner?: CheckerRunner;
  private approvalMode: ApprovalMode;
  private readonly sandboxManager: SandboxManager;

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

    // Validate rules
    for (const rule of this.rules) {
      if (rule.toolName === undefined || rule.toolName === '') {
        throw new Error(
          `Invalid policy rule: toolName is required. Use '*' for all tools. Rule source: ${rule.source || 'unknown'}`,
        );
      }
      if (rule.mcpName === '') {
        throw new Error(
          `Invalid policy rule: mcpName is required if specified (cannot be empty). Rule source: ${rule.source || 'unknown'}`,
        );
      }
      if (rule.subagent === '') {
        throw new Error(
          `Invalid policy rule: subagent is required if specified (cannot be empty). Rule source: ${rule.source || 'unknown'}`,
        );
      }
    }

    // Validate checkers
    for (const checker of this.checkers) {
      if (checker.toolName === undefined || checker.toolName === '') {
        throw new Error(
          `Invalid safety checker rule: toolName is required. Use '*' for all tools. Checker source: ${checker.source || 'unknown'}`,
        );
      }
      if (checker.mcpName === '') {
        throw new Error(
          `Invalid safety checker rule: mcpName is required if specified (cannot be empty). Checker source: ${checker.source || 'unknown'}`,
        );
      }
    }

    this.defaultDecision = config.defaultDecision ?? PolicyDecision.ASK_USER;
    this.nonInteractive = config.nonInteractive ?? false;
    this.disableAlwaysAllow = config.disableAlwaysAllow ?? false;
    this.checkerRunner = checkerRunner;
    this.approvalMode = config.approvalMode ?? ApprovalMode.DEFAULT;
    this.sandboxManager = config.sandboxManager ?? new NoopSandboxManager();
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

  private isAlwaysAllowRule(rule: PolicyRule): boolean {
    return (
      rule.priority !== undefined &&
      Math.round((rule.priority % 1) * 1000) === ALWAYS_ALLOW_PRIORITY_FRACTION
    );
  }

  private shouldDowngradeForRedirection(
    command: string,
    allowRedirection?: boolean,
  ): boolean {
    if (allowRedirection) return false;
    if (!hasRedirection(command)) return false;

    // Do not downgrade (do not ask user) if sandboxing is enabled and in AUTO_EDIT or YOLO
    const sandboxEnabled = !(this.sandboxManager instanceof NoopSandboxManager);
    if (
      sandboxEnabled &&
      (this.approvalMode === ApprovalMode.AUTO_EDIT ||
        this.approvalMode === ApprovalMode.YOLO)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Check if a shell command is allowed.
   */
  private async applyShellHeuristics(
    command: string,
    decision: PolicyDecision,
  ): Promise<PolicyDecision> {
    await initializeShellParsers();
    try {
      const parsedObjArgs = shellParse(command);
      const parsedArgs = parsedObjArgs.map(extractStringFromParseEntry);

      if (this.sandboxManager.isDangerousCommand(parsedArgs)) {
        debugLogger.debug(
          `[PolicyEngine.check] Command evaluated as dangerous, forcing ASK_USER: ${command}`,
        );
        return PolicyDecision.ASK_USER;
      }

      if (
        this.sandboxManager.isKnownSafeCommand(parsedArgs) &&
        decision === PolicyDecision.ASK_USER
      ) {
        debugLogger.debug(
          `[PolicyEngine.check] Command evaluated as known safe, overriding ASK_USER to ALLOW: ${command}`,
        );
        return PolicyDecision.ALLOW;
      }
    } catch {
      // Ignore parsing errors
    }
    return decision;
  }

  private async checkShellCommand(
    toolName: string,
    command: string | undefined,
    ruleDecision: PolicyDecision,
    serverName: string | undefined,
    dir_path: string | undefined,
    allowRedirection?: boolean,
    rule?: PolicyRule,
    toolAnnotations?: Record<string, unknown>,
    subagent?: string,
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
          toolAnnotations,
          subagent,
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
    toolAnnotations?: Record<string, unknown>,
    subagent?: string,
  ): Promise<CheckResult> {
    // Case 1: Metadata injection is the primary and safest way to identify an MCP server.
    // If we have explicit `_serverName` metadata (usually injected by tool-registry for active tools), use it.
    if (!serverName && isMcpToolAnnotation(toolAnnotations)) {
      serverName = toolAnnotations._serverName;
    }

    // Case 2: Fallback for static FQN strings (e.g. from TOML policies or allowed/excluded settings strings).
    // These strings don't have active metadata objects associated with them during policy generation,
    // so we must extract the server name from the qualified `mcp_{server}_{tool}` format.
    if (!serverName && toolCall.name) {
      const parsed = parseMcpToolName(toolCall.name);
      if (parsed.serverName) {
        serverName = parsed.serverName;
      }
    }

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

    // We also want to check legacy aliases for the tool name.
    const toolNamesToTry = toolCall.name ? getToolAliases(toolCall.name) : [];

    const toolCallsToTry: FunctionCall[] = [];
    for (const name of toolNamesToTry) {
      toolCallsToTry.push({ ...toolCall, name });
    }

    for (const rule of this.rules) {
      if (this.disableAlwaysAllow && this.isAlwaysAllowRule(rule)) {
        continue;
      }

      const match = toolCallsToTry.some((tc) =>
        ruleMatches(
          rule,
          tc,
          stringifiedArgs,
          serverName,
          this.approvalMode,
          this.nonInteractive,
          toolAnnotations,
          subagent,
        ),
      );

      if (match) {
        debugLogger.debug(
          `[PolicyEngine.check] MATCHED rule: toolName=${rule.toolName}, decision=${rule.decision}, priority=${rule.priority}, argsPattern=${rule.argsPattern?.source || 'none'}`,
        );

        let ruleDecision = rule.decision;
        if (
          isShellCommand &&
          command &&
          !('commandPrefix' in rule) &&
          !rule.argsPattern
        ) {
          ruleDecision = await this.applyShellHeuristics(command, ruleDecision);
        }

        if (isShellCommand && toolName) {
          const shellResult = await this.checkShellCommand(
            toolName,
            command,
            ruleDecision,
            serverName,
            shellDirPath,
            rule.allowRedirection,
            rule,
            toolAnnotations,
            subagent,
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
      if (this.approvalMode === ApprovalMode.YOLO) {
        debugLogger.debug(
          `[PolicyEngine.check] NO MATCH in YOLO mode - using ALLOW`,
        );
        return {
          decision: PolicyDecision.ALLOW,
        };
      }

      debugLogger.debug(
        `[PolicyEngine.check] NO MATCH - using default decision: ${this.defaultDecision}`,
      );
      if (toolName && SHELL_TOOL_NAMES.includes(toolName)) {
        let heuristicDecision = this.defaultDecision;
        if (command) {
          heuristicDecision = await this.applyShellHeuristics(
            command,
            heuristicDecision,
          );
        }

        const shellResult = await this.checkShellCommand(
          toolName,
          command,
          heuristicDecision,
          serverName,
          shellDirPath,
          false,
          undefined,
          toolAnnotations,
          subagent,
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
            this.nonInteractive,
            toolAnnotations,
            subagent,
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
   * Remove rules matching a specific source.
   */
  removeRulesBySource(source: string): void {
    this.rules = this.rules.filter((rule) => rule.source !== source);
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
   * Remove checkers matching a specific source.
   */
  removeCheckersBySource(source: string): void {
    this.checkers = this.checkers.filter(
      (checker) => checker.source !== source,
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
   * 4. Annotation-based rules (when toolMetadata is provided)
   *
   * @param toolMetadata Optional map of tool names to their annotations.
   *   When provided, annotation-based rules can match tools by their metadata.
   *   When not provided, rules with toolAnnotations are skipped (conservative fallback).
   */
  getExcludedTools(
    toolMetadata?: Map<string, Record<string, unknown>>,
    allToolNames?: Set<string>,
  ): Set<string> {
    const excludedTools = new Set<string>();

    if (!allToolNames) {
      return excludedTools;
    }

    for (const toolName of allToolNames) {
      const annotations = toolMetadata?.get(toolName);
      const serverName = isMcpToolAnnotation(annotations)
        ? annotations._serverName
        : undefined;

      let staticallyExcluded = false;
      let matchFound = false;

      // Evaluate rules in priority order (they are already sorted in constructor)
      for (const rule of this.rules) {
        if (this.disableAlwaysAllow && this.isAlwaysAllowRule(rule)) {
          continue;
        }

        // Create a copy of the rule without argsPattern to see if it targets the tool
        // regardless of the runtime arguments it might receive.
        const ruleWithoutArgs: PolicyRule = { ...rule, argsPattern: undefined };
        const toolCall: FunctionCall = { name: toolName, args: {} };

        const appliesToTool = ruleMatches(
          ruleWithoutArgs,
          toolCall,
          undefined, // stringifiedArgs
          serverName,
          this.approvalMode,
          this.nonInteractive,
          annotations,
        );

        if (appliesToTool) {
          if (rule.argsPattern) {
            // Exclusions only apply statically before arguments are known.
            if (rule.decision !== PolicyDecision.DENY) {
              // Conditionally allowed/asked based on args. Therefore NOT statically excluded.
              staticallyExcluded = false;
              matchFound = true;
              break;
            }
            // If it's conditionally DENIED based on args, it means it's not unconditionally denied.
            // We must keep evaluating lower priority rules to see the default/unconditional state.
            continue;
          } else {
            // Unconditional rule for this tool
            const decision = this.applyNonInteractiveMode(rule.decision);
            staticallyExcluded = decision === PolicyDecision.DENY;
            matchFound = true;
            break;
          }
        }
      }

      if (!matchFound) {
        // Fallback to default decision if no rule matches
        const defaultDec = this.applyNonInteractiveMode(this.defaultDecision);
        if (defaultDec === PolicyDecision.DENY) {
          staticallyExcluded = true;
        }
      }

      if (staticallyExcluded) {
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
