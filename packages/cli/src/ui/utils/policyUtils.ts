/**
 * @license
 * Copyright 2025 Google LLC
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
  /** Uppercased decision string */
  decision: string;
  /** Resolved display name (e.g. "Shell") or fallback to internal name */
  toolDisplayName: string;
  /** Formatted constraint string for parenthetical display, or undefined */
  constraint: string | undefined;
  /** Formatted priority string */
  priority: string;
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
      const toolDisplayName = rule.toolName
        ? (toolDisplayNames.get(rule.toolName) ?? rule.toolName)
        : 'all tools';
      const constraint = rule.constraintDisplay;
      const priority = String(rule.priority ?? 0);
      const source = rule.source ?? '';

      const searchText = [toolDisplayName, rule.toolName, constraint, source]
        .filter(Boolean)
        .join(' ');

      return {
        key: `policy-${index}`,
        rule,
        decision: rule.decision.toUpperCase(),
        toolDisplayName,
        constraint,
        priority,
        source,
        searchText,
      };
    });
}
