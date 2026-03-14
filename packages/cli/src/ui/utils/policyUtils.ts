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
 * Un-escapes a regex string that was escaped by `escapeRegex()` from
 * packages/core/src/policy/utils.ts.
 *
 * escapeRegex escapes: [-[\]{}()*+?.,\\^$|#\s"]
 * by prefixing each with a backslash.
 */
function unescapeRegex(escaped: string): string {
  return escaped.replace(/\\(.)/g, '$1');
}

/**
 * Formats an argsPattern regex into a human-readable constraint string.
 *
 * The policy engine compiles TOML rule fields (commandPrefix, commandRegex,
 * argsPattern) into RegExp objects via buildArgsPatterns() in
 * packages/core/src/policy/utils.ts. This function reverses that compilation
 * back into readable text for display.
 *
 * Pattern formats (checked in order):
 *
 * 1. commandPrefix — `"command":"<escaped>(?:[\s"]|\\")` → `<prefix>*`
 * 2. commandRegex — starts with `"command":"` → raw regex after the prefix
 * 3. file_path — contains `"file_path":"<path>"` → `path: <path>`
 * 4. Fallback — truncated raw regex source
 *
 * Returns undefined if there is no constraint (tool-only or wildcard rules).
 */
export function formatArgsPattern(
  argsPattern: RegExp | undefined,
): string | undefined {
  if (!argsPattern) {
    return undefined;
  }

  const source = argsPattern.source;

  // buildArgsPatterns uses escapeRegex() which escapes quotes to \", so the
  // regex source contains escaped quotes. We support both escaped (\") and
  // unescaped (") formats for robustness.
  const cmdPrefix = /^\\?"command\\?":\\?"(.+?)\(\?:\[\\s"]\|\\\\"?\)$/;

  // 1. commandPrefix: \"command\":\"<escaped-prefix>(?:[\s"]|\\")"
  //    The lookahead ensures the prefix is word-bounded in JSON.
  const prefixMatch = source.match(cmdPrefix);
  if (prefixMatch) {
    return unescapeRegex(prefixMatch[1]) + '*';
  }

  // 2. commandRegex: starts with "command":" or \"command\":\"
  const cmdRegexPrefix = /^\\?"command\\?":\\?"/;
  const cmdRegexMatch = source.match(cmdRegexPrefix);
  if (cmdRegexMatch) {
    const regex = source.slice(cmdRegexMatch[0].length);
    return regex;
  }

  // 3. file_path pattern
  if (source.includes('"file_path"')) {
    const pathMatch = source.match(/"file_path":"(.+?)"/);
    if (pathMatch) {
      return `path: ${pathMatch[1]}`;
    }
    return 'path: ...';
  }

  // 4. Fallback: truncated raw regex
  const maxLen = 40;
  if (source.length > maxLen) {
    return source.substring(0, maxLen) + '...';
  }
  return source;
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
      const constraint = formatArgsPattern(rule.argsPattern);
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
