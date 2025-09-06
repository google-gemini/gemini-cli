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
} from './types.js';

export class PolicyEngine {
  private rules: PolicyRule[];
  private readonly defaultDecision: PolicyDecision;
  private readonly nonInteractive: boolean;

  constructor(config: PolicyEngineConfig = {}) {
    this.rules = (config.rules ?? []).sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    this.defaultDecision = config.defaultDecision ?? PolicyDecision.ASK_USER;
    this.nonInteractive = config.nonInteractive ?? false;
  }

  /**
   * Check if a tool call is allowed based on the configured policies.
   */
  check(toolCall: FunctionCall): PolicyDecision {
    // Find the first matching rule (already sorted by priority)
    for (const rule of this.rules) {
      if (this.ruleMatches(rule, toolCall)) {
        return this.applyNonInteractiveMode(rule.decision);
      }
    }

    // No matching rule found, use default decision
    return this.applyNonInteractiveMode(this.defaultDecision);
  }

  /**
   * Add a new rule to the policy engine.
   */
  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
    // Re-sort rules by priority
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Remove rules for a specific tool.
   */
  removeRulesForTool(toolName: string): void {
    // Remove all rules for the specified tool, not just the first one
    for (let i = this.rules.length - 1; i >= 0; i--) {
      if (this.rules[i].toolName === toolName) {
        this.rules.splice(i, 1);
      }
    }
  }

  /**
   * Get all current rules.
   */
  getRules(): readonly PolicyRule[] {
    return this.rules;
  }

  private ruleMatches(rule: PolicyRule, toolCall: FunctionCall): boolean {
    // Check tool name if specified
    if (rule.toolName && toolCall.name !== rule.toolName) {
      return false;
    }

    // Check args pattern if specified
    if (rule.argsPattern) {
      // If rule has an args pattern but tool has no args, no match
      if (!toolCall.args) {
        return false;
      }
      // Use stable JSON stringification with sorted keys to ensure consistent matching
      const argsString = this.stableStringify(toolCall.args);
      if (!rule.argsPattern.test(argsString)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Produces a stable, deterministic JSON string representation with sorted keys.
   *
   * This method is critical for security policy matching. It ensures that the same
   * object always produces the same string representation, regardless of property
   * insertion order, which could vary across different JavaScript engines or
   * runtime conditions.
   *
   * Key behaviors:
   * 1. **Sorted Keys**: Object properties are always serialized in alphabetical order,
   *    ensuring deterministic output for pattern matching.
   *
   * 2. **Circular Reference Protection**: Uses ancestor chain tracking (not just
   *    object identity) to detect true circular references while correctly handling
   *    repeated non-circular object references. Circular references are replaced
   *    with "[Circular]" to prevent stack overflow attacks.
   *
   * 3. **JSON Spec Compliance**:
   *    - undefined values: Omitted from objects, converted to null in arrays
   *    - Functions: Omitted from objects, converted to null in arrays
   *    - toJSON methods: Respected and called when present (per JSON.stringify spec)
   *
   * 4. **Security Considerations**:
   *    - Prevents DoS via circular references that would cause infinite recursion
   *    - Ensures consistent policy rule matching by normalizing property order
   *    - Respects toJSON for objects that sanitize their output
   *    - Handles toJSON methods that throw errors gracefully
   *
   * @param obj - The object to stringify (typically toolCall.args)
   * @returns A deterministic JSON string representation
   *
   * @example
   * // Different property orders produce the same output:
   * stableStringify({b: 2, a: 1}) === stableStringify({a: 1, b: 2})
   * // Returns: '{"a":1,"b":2}'
   *
   * @example
   * // Circular references are handled safely:
   * const obj = {a: 1};
   * obj.self = obj;
   * stableStringify(obj)
   * // Returns: '{"a":1,"self":"[Circular]"}'
   *
   * @example
   * // toJSON methods are respected:
   * const obj = {
   *   sensitive: 'secret',
   *   toJSON: () => ({ safe: 'data' })
   * };
   * stableStringify(obj)
   * // Returns: '{"safe":"data"}'
   */
  private stableStringify(obj: unknown): string {
    const stringify = (
      currentObj: unknown,
      ancestors: Set<unknown>,
    ): string => {
      // Handle primitives and null
      if (currentObj === undefined) {
        return 'null'; // undefined in arrays becomes null in JSON
      }
      if (currentObj === null) {
        return 'null';
      }
      if (typeof currentObj === 'function') {
        return 'null'; // functions in arrays become null in JSON
      }
      if (typeof currentObj !== 'object') {
        return JSON.stringify(currentObj);
      }

      // Check for circular reference (object is in ancestor chain)
      if (ancestors.has(currentObj)) {
        return '"[Circular]"';
      }

      // Create new ancestors set for this branch
      const newAncestors = new Set(ancestors);
      newAncestors.add(currentObj);

      // Check for toJSON method and use it if present
      const objWithToJSON = currentObj as { toJSON?: () => unknown };
      if (typeof objWithToJSON.toJSON === 'function') {
        try {
          const jsonValue = objWithToJSON.toJSON();
          // The result of toJSON needs to be stringified recursively
          return stringify(jsonValue, newAncestors);
        } catch {
          // If toJSON throws, treat as a regular object
        }
      }

      if (Array.isArray(currentObj)) {
        const items = currentObj.map((item) => {
          // undefined and functions in arrays become null
          if (item === undefined || typeof item === 'function') {
            return 'null';
          }
          return stringify(item, newAncestors);
        });
        return '[' + items.join(',') + ']';
      }

      // Handle objects - sort keys and filter out undefined/function values
      const sortedKeys = Object.keys(currentObj).sort();
      const pairs: string[] = [];

      for (const key of sortedKeys) {
        const value = (currentObj as Record<string, unknown>)[key];
        // Skip undefined and function values in objects (per JSON spec)
        if (value !== undefined && typeof value !== 'function') {
          pairs.push(
            JSON.stringify(key) + ':' + stringify(value, newAncestors),
          );
        }
      }

      return '{' + pairs.join(',') + '}';
    };

    return stringify(obj, new Set());
  }

  private applyNonInteractiveMode(decision: PolicyDecision): PolicyDecision {
    // In non-interactive mode, ASK_USER becomes DENY
    if (this.nonInteractive && decision === PolicyDecision.ASK_USER) {
      return PolicyDecision.DENY;
    }
    return decision;
  }
}
