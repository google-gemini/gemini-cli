/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PolicyRule, PolicyDecision } from '@google/gemini-cli-core';

/**
 * Represents a single item in the policies dialog list.
 */
export interface PolicyListItem {
  /** Unique key for React rendering */
  key: string;
  /** The original policy rule */
  rule: PolicyRule;
  /** Resolved display name (e.g. "Shell") or fallback to internal name */
  toolDisplayName: string;
  /** Formatted constraint string for parenthetical display, or undefined */
  constraint: string | undefined;
  /** rule.source ?? '' */
  source: string;
  /** Concatenated searchable fields */
  searchText: string;
}

/**
 * Builds a list of PolicyListItems from rules, filtered by decision and sorted
 * by priority descending.
 */
export function buildPolicyListItems(
  rules: readonly PolicyRule[],
  toolDisplayNames: Map<string, string>,
  decision: PolicyDecision,
): PolicyListItem[] {
  return rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.decision === decision)
    .sort((a, b) => (b.rule.priority ?? 0) - (a.rule.priority ?? 0))
    .map(({ rule, index }) => {
      const toolDisplayName =
        !rule.toolName || rule.toolName === '*'
          ? 'all tools'
          : (toolDisplayNames.get(rule.toolName) ?? rule.toolName);
      const constraint = rule.constraintDisplay;
      const source = rule.source ?? '';

      const searchText = [toolDisplayName, rule.toolName, constraint, source]
        .filter(Boolean)
        .join(' ');

      return {
        key: `policy-${index}`,
        rule,
        toolDisplayName,
        constraint,
        source,
        searchText,
      };
    });
}
