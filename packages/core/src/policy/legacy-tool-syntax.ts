/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PolicyDecision, type PolicyRule } from './types.js';
import { buildArgsPatterns } from './utils.js';
import { SHELL_TOOL_NAMES } from '../utils/shell-utils.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';
import { coreEvents } from '../utils/events.js';

/**
 * Legacy `toolName(args)` form used historically in `tools.core`,
 * `tools.allowed`, `tools.exclude`, and extension `excludeTools`.
 */
export const LEGACY_TOOL_ARGS_PATTERN = /^([a-zA-Z0-9_-]+)\((.*)\)$/;

export function isLegacyCommandScopedToolRef(entry: string): boolean {
  return LEGACY_TOOL_ARGS_PATTERN.test(entry);
}

export function extensionExcludeToolsPolicySource(
  extensionName: string,
): string {
  return `Extension (${extensionName}): excludeTools`;
}

/**
 * Strips a trailing glob `*` from legacy command restrictions.
 * Docs historically used `rm -rf *` to mean "rm -rf and anything after".
 */
export function normalizeLegacyCommandPrefix(args: string): string | undefined {
  const trimmed = args
    .trim()
    .replace(/[*\s]+$/, '')
    .trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeToolName(rawToolName: string): string {
  return SHELL_TOOL_NAMES.includes(rawToolName) ? SHELL_TOOL_NAME : rawToolName;
}

function emitLegacyExcludeWarning(
  message: string,
  warn?: (message: string) => void,
): void {
  if (warn) {
    warn(message);
    return;
  }
  coreEvents.emitFeedback('warning', message);
}

/**
 * Converts exclude entries into DENY policy rules.
 *
 * Bare names deny the whole tool. `toolName(args)` entries become
 * command-prefix deny rules for the shell tool (and whole-tool denies
 * for other tools, matching historical `tools.allowed` args handling).
 */
export function mapExcludeToolsToDenyRules(
  tools: string[],
  priority: number,
  source: string,
  warn?: (message: string) => void,
): PolicyRule[] {
  const rules: PolicyRule[] = [];

  for (const tool of tools) {
    const match = tool.match(LEGACY_TOOL_ARGS_PATTERN);
    if (!match) {
      rules.push({
        toolName: normalizeToolName(tool),
        decision: PolicyDecision.DENY,
        priority,
        source,
      });
      continue;
    }

    const [, rawToolName, args] = match;
    const toolName = normalizeToolName(rawToolName);
    emitLegacyExcludeWarning(
      `Exclude entry "${tool}" uses toolName(args) syntax, which is not a tool name. ` +
        `It is applied as a command-level deny rule. Prefer a Policy Engine rule ` +
        `instead: https://geminicli.com/docs/core/policy-engine/`,
      warn,
    );

    if (toolName === SHELL_TOOL_NAME) {
      const commandPrefix = normalizeLegacyCommandPrefix(args);
      if (!commandPrefix) {
        rules.push({
          toolName,
          decision: PolicyDecision.DENY,
          priority,
          source,
        });
        continue;
      }

      const patterns = buildArgsPatterns(undefined, commandPrefix);
      for (const pattern of patterns) {
        if (pattern) {
          rules.push({
            toolName,
            decision: PolicyDecision.DENY,
            priority,
            argsPattern: new RegExp(pattern),
            source,
          });
        }
      }
      continue;
    }

    rules.push({
      toolName,
      decision: PolicyDecision.DENY,
      priority,
      source,
    });
  }

  return rules;
}
